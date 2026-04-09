import axios from 'axios';
import jwt from 'jsonwebtoken';
import {
  BASE_URL,
  log,
  createTestSponsor,
  cleanupSponsorCompanies,
  closePool,
  createTestUser,
  createTestDriverProfile,
  createTestSponsorProfile,
} from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-fleetscore';

const createdUserIds = [];
const createdSponsorIds = [];
const driverLicenseNumbers = [];

function buildSessionCookie(user, originalUser = null) {
  const payload = {
    UserID: user.userId,
    UserType: user.userType,
    Username: user.username,
  };

  if (originalUser) {
    payload.OriginalUser = {
      UserID: originalUser.userId,
      UserType: originalUser.userType,
      Username: originalUser.username,
    };
  }

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: 60 * 60 * 24 });
  return `sessionId=${token}`;
}

async function cleanupUsers(userIds) {
  if (!userIds || userIds.length === 0) return;

  const connection = await pool.getConnection();
  try {
    for (const userId of userIds) {
      await connection.query('DELETE FROM EVENTS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM DRIVERS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM SPONSORS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM ADMINS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [userId]);
      console.log(`Deleted user ${userId}`);
    }
  } catch (error) {
    console.error('Error cleaning up users:', error.message);
  } finally {
    connection.release();
  }
}

async function cleanupPointTransactions() {
  if (driverLicenseNumbers.length === 0) return;

  const connection = await pool.getConnection();
  try {
    await connection.query('DELETE FROM POINT_TRANSACTIONS WHERE DriverID IN (?)', [driverLicenseNumbers]);
  } catch (error) {
    console.error('Error cleaning up point transactions:', error.message);
  } finally {
    connection.release();
  }
}

async function getLatestTransactionByReason(driverLicenseNumber, reason) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT TransactionID, DriverID, UserChanged, PointChange, ReasonForChange
       FROM POINT_TRANSACTIONS
       WHERE DriverID = ? AND ReasonForChange = ?
       ORDER BY TransactionID DESC
       LIMIT 1`,
      [driverLicenseNumber, reason]
    );
    return rows[0] ?? null;
  } finally {
    connection.release();
  }
}

async function getDriverPointBalance(userId) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query('SELECT PointBalance FROM DRIVERS WHERE UserID = ?', [userId]);
    return rows[0]?.PointBalance;
  } finally {
    connection.release();
  }
}

async function runTests() {
  try {
    console.log('Starting sponsor point transaction mutation tests...\n');

    const companyA = await createTestSponsor({ companyName: `Mutations Sponsor A ${Date.now()}`, pointDollarValue: 0.01 });
    const companyB = await createTestSponsor({ companyName: `Mutations Sponsor B ${Date.now()}`, pointDollarValue: 0.01 });
    createdSponsorIds.push(companyA, companyB);

    const sponsorA = await createTestUser({ userType: 'sponsor' });
    const sponsorB = await createTestUser({ userType: 'sponsor' });
    const adminUser = await createTestUser({ userType: 'admin' });
    const driverA = await createTestUser({ userType: 'driver' });
    const driverB = await createTestUser({ userType: 'driver' });

    const sponsorAUser = { ...sponsorA, userType: 'sponsor' };
    const adminIdentity = { ...adminUser, userType: 'admin' };

    createdUserIds.push(sponsorA.userId, sponsorB.userId, adminUser.userId, driverA.userId, driverB.userId);

    await createTestSponsorProfile({ userId: sponsorA.userId, sponsorCompanyId: companyA });
    await createTestSponsorProfile({ userId: sponsorB.userId, sponsorCompanyId: companyB });

    const driverAProfile = await createTestDriverProfile({
      userId: driverA.userId,
      sponsorCompanyId: companyA,
      licenseNumber: `MUTA_${driverA.userId}`,
      pointBalance: 100,
    });

    const driverBProfile = await createTestDriverProfile({
      userId: driverB.userId,
      sponsorCompanyId: companyB,
      licenseNumber: `MUTB_${driverB.userId}`,
      pointBalance: 100,
    });

    driverLicenseNumbers.push(driverAProfile.licenseNumber, driverBProfile.licenseNumber);

    const createReason = `mutation-create-${Date.now()}`;

    log('TEST 1: Sponsor creates transaction and writes license-backed DriverID', `POST /api/sponsors/${sponsorA.userId}/drivers/${driverA.userId}/point-transactions`);
    const createRes = await axios.post(
      `${API_BASE_URL}/sponsors/${sponsorA.userId}/drivers/${driverA.userId}/point-transactions`,
      { pointChange: 40, reason: createReason }
    );

    if (createRes.status !== 200 || createRes.data?.success !== true) {
      throw new Error('Expected successful sponsor point transaction create');
    }

    const createdTx = await getLatestTransactionByReason(driverAProfile.licenseNumber, createReason);
    if (!createdTx) {
      throw new Error('Expected inserted transaction row');
    }

    if (createdTx.DriverID !== driverAProfile.licenseNumber) {
      throw new Error('Expected DriverID to store driver LicenseNumber');
    }

    if (Number(createdTx.UserChanged) !== Number(sponsorA.userId) || Number(createdTx.PointChange) !== 40) {
      throw new Error('Expected transaction UserChanged and PointChange to match request');
    }

    const balanceAfterCreate = await getDriverPointBalance(driverA.userId);
    if (Number(balanceAfterCreate) !== 140) {
      throw new Error(`Expected PointBalance 140 after create; received ${balanceAfterCreate}`);
    }

    log('TEST 2: Sponsor edits own scoped transaction and balance diff applies', `PUT /api/sponsors/${sponsorA.userId}/point-transactions/${createdTx.TransactionID}`);
    const editReason = `mutation-edit-${Date.now()}`;
    const editRes = await axios.put(
      `${API_BASE_URL}/sponsors/${sponsorA.userId}/point-transactions/${createdTx.TransactionID}`,
      { newPoints: 25, newReason: editReason }
    );

    if (editRes.status !== 200 || editRes.data?.success !== true) {
      throw new Error('Expected successful sponsor point transaction edit');
    }

    const editedTx = await getLatestTransactionByReason(driverAProfile.licenseNumber, editReason);
    if (!editedTx || Number(editedTx.TransactionID) !== Number(createdTx.TransactionID)) {
      throw new Error('Expected edited transaction reason to persist on same transaction');
    }

    const balanceAfterEdit = await getDriverPointBalance(driverA.userId);
    if (Number(balanceAfterEdit) !== 125) {
      throw new Error(`Expected PointBalance 125 after edit; received ${balanceAfterEdit}`);
    }

    log('TEST 3: Sponsor cannot edit a transaction outside company scope', 'PUT /api/sponsors/:userId/point-transactions/:tId');
    const otherReason = `other-company-${Date.now()}`;
    await axios.post(
      `${API_BASE_URL}/sponsors/${sponsorB.userId}/drivers/${driverB.userId}/point-transactions`,
      { pointChange: 20, reason: otherReason }
    );
    const otherTx = await getLatestTransactionByReason(driverBProfile.licenseNumber, otherReason);
    if (!otherTx) {
      throw new Error('Expected setup transaction for company B');
    }

    try {
      await axios.put(
        `${API_BASE_URL}/sponsors/${sponsorA.userId}/point-transactions/${otherTx.TransactionID}`,
        { newPoints: 999, newReason: 'cross-company-should-fail' }
      );
      throw new Error('Expected 404 when editing cross-company transaction');
    } catch (error) {
      if (!error.response || error.response.status !== 404) {
        throw error;
      }
    }

    log('TEST 4: Route user mismatch in session context is rejected', 'POST /api/sponsors/:userId/drivers/:driverId/point-transactions');
    const mismatchedCookie = buildSessionCookie({ ...driverA, userType: 'driver' });
    try {
      await axios.post(
        `${API_BASE_URL}/sponsors/${sponsorA.userId}/drivers/${driverA.userId}/point-transactions`,
        { pointChange: 5, reason: 'mismatch-cookie-should-fail' },
        { headers: { Cookie: mismatchedCookie } }
      );
      throw new Error('Expected 403 when session effective user mismatches route user');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }

    log('TEST 5: Admin-assumed sponsor session can mutate sponsor points flow', 'POST /api/admin/assume-sponsor/:targetUserId + POST /api/sponsors/:userId/drivers/:driverId/point-transactions');
    const assumeRes = await axios.post(`${API_BASE_URL}/admin/assume-sponsor/${sponsorA.userId}`, {
      requesterUserId: adminUser.userId,
    });

    if (assumeRes.status !== 200 || assumeRes.data?.assumedUser?.UserType !== 'sponsor') {
      throw new Error('Expected admin assume sponsor response with sponsor identity');
    }

    const assumedSponsorCookie = buildSessionCookie(sponsorAUser, adminIdentity);
    const assumedReason = `assumed-sponsor-${Date.now()}`;
    const assumedCreateRes = await axios.post(
      `${API_BASE_URL}/sponsors/${sponsorA.userId}/drivers/${driverA.userId}/point-transactions`,
      { pointChange: -10, reason: assumedReason },
      { headers: { Cookie: assumedSponsorCookie } }
    );

    if (assumedCreateRes.status !== 200 || assumedCreateRes.data?.success !== true) {
      throw new Error('Expected assumed sponsor transaction create success');
    }

    const assumedTx = await getLatestTransactionByReason(driverAProfile.licenseNumber, assumedReason);
    if (!assumedTx) {
      throw new Error('Expected transaction written during assumed sponsor flow');
    }

    log('TEST 6: Removed legacy deduct endpoint returns not found', 'POST /api/sponsors/deduct-points');
    try {
      await axios.post(`${API_BASE_URL}/sponsors/deduct-points`, {
        driverId: driverA.userId,
        points: 10,
        reason: 'legacy-endpoint-removed',
        sponsorId: sponsorA.userId,
      });
      throw new Error('Expected removed deduct endpoint to return 404');
    } catch (error) {
      if (!error.response || error.response.status !== 404) {
        throw error;
      }
    }

    console.log('\nSponsor point transaction mutation tests completed successfully!');
  } catch (error) {
    console.error('\nSponsor point transaction mutation tests failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    await cleanupPointTransactions();
    await cleanupUsers(createdUserIds);
    await cleanupSponsorCompanies(createdSponsorIds);
    await closePool();
  }
}

runTests();
