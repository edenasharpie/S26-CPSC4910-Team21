import axios from 'axios';
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

const createdUserIds = [];
const createdSponsorIds = [];
const driverReferences = [];

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
  if (driverReferences.length === 0) return;

  const connection = await pool.getConnection();
  try {
    await connection.query(
      `DELETE FROM POINT_TRANSACTIONS WHERE DriverID IN (?)`,
      [driverReferences]
    );
  } catch (error) {
    console.error('Error cleaning up point transactions:', error.message);
  } finally {
    connection.release();
  }
}

async function insertPointTransaction(driverRef, sponsorCompanyId, userChanged, pointChange, reason) {
  const connection = await pool.getConnection();
  try {
    await connection.query(
      `INSERT INTO POINT_TRANSACTIONS (DriverID, SponsorCompanyID, UserChanged, PointChange, ReasonForChange, TimeChanged)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [driverRef, sponsorCompanyId, userChanged, pointChange, reason]
    );
  } finally {
    connection.release();
  }
}

async function runTests() {
  try {
    console.log('Starting sponsor point transaction scoping tests...\n');

    const companyA = await createTestSponsor({ companyName: `Scope Sponsor A ${Date.now()}`, pointDollarValue: 0.01 });
    const companyB = await createTestSponsor({ companyName: `Scope Sponsor B ${Date.now()}`, pointDollarValue: 0.01 });
    createdSponsorIds.push(companyA, companyB);

    const sponsorA = await createTestUser({ userType: 'sponsor' });
    const sponsorB = await createTestUser({ userType: 'sponsor' });
    const driverA = await createTestUser({ userType: 'driver' });
    const driverB = await createTestUser({ userType: 'driver' });

    createdUserIds.push(sponsorA.userId, sponsorB.userId, driverA.userId, driverB.userId);

    await createTestSponsorProfile({ userId: sponsorA.userId, sponsorCompanyId: companyA });
    await createTestSponsorProfile({ userId: sponsorB.userId, sponsorCompanyId: companyB });

    const driverAProfile = await createTestDriverProfile({
      userId: driverA.userId,
      sponsorCompanyId: companyA,
      licenseNumber: `SCOPE_A_${driverA.userId}`,
      pointBalance: 100,
    });

    const driverBProfile = await createTestDriverProfile({
      userId: driverB.userId,
      sponsorCompanyId: companyB,
      licenseNumber: `SCOPE_B_${driverB.userId}`,
      pointBalance: 100,
    });

    driverReferences.push(driverAProfile.licenseNumber);
    driverReferences.push(driverBProfile.licenseNumber);

    await insertPointTransaction(driverAProfile.licenseNumber, companyA, sponsorA.userId, 15, 'scope-test-license-a');
    await insertPointTransaction(driverBProfile.licenseNumber, companyB, sponsorB.userId, 22, 'scope-test-license-b');

    log('TEST 1: Sponsor A sees only company A transactions', `GET /api/sponsors/${sponsorA.userId}/point-transactions`);
    const sponsorARes = await axios.get(`${API_BASE_URL}/sponsors/${sponsorA.userId}/point-transactions`);
    if (sponsorARes.status !== 200 || !Array.isArray(sponsorARes.data)) {
      throw new Error('Expected sponsor A scoped transactions list');
    }

    const sponsorADriverIds = new Set(sponsorARes.data.map((row) => Number(row.DriverUserID)));
    if (!sponsorADriverIds.has(driverA.userId) || sponsorADriverIds.has(driverB.userId)) {
      throw new Error('Sponsor A transaction scope leaked or omitted expected driver data');
    }

    log('TEST 2: Sponsor B sees only company B transactions', `GET /api/sponsors/${sponsorB.userId}/point-transactions`);
    const sponsorBRes = await axios.get(`${API_BASE_URL}/sponsors/${sponsorB.userId}/point-transactions`);
    if (sponsorBRes.status !== 200 || !Array.isArray(sponsorBRes.data)) {
      throw new Error('Expected sponsor B scoped transactions list');
    }

    const sponsorBDriverIds = new Set(sponsorBRes.data.map((row) => Number(row.DriverUserID)));
    if (!sponsorBDriverIds.has(driverB.userId) || sponsorBDriverIds.has(driverA.userId)) {
      throw new Error('Sponsor B transaction scope leaked or omitted expected driver data');
    }

    console.log('\nSponsor point transaction scoping tests completed successfully!');
  } catch (error) {
    console.error('\nSponsor point transaction scoping tests failed:');
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
