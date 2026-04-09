/**
 * sponsor-driver-visibility.js
 *
 * Verifies that a sponsor can only see drivers from their own company.
 * Regression guard for the cross-sponsor data leak fixed by changing
 * GET /api/sponsors/my-drivers/:companyId → GET /api/sponsors/:userId/my-drivers.
 */

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
const createdLicenseNumbers = [];

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
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [userId]);
    }
  } catch (error) {
    console.error('Error cleaning up users:', error.message);
  } finally {
    connection.release();
  }
}

async function runTests() {
  try {
    console.log('Starting sponsor driver visibility isolation tests...\n');

    // Setup: two companies, one sponsor each, one driver per company
    const companyA = await createTestSponsor({ companyName: `Visibility Co A ${Date.now()}` });
    const companyB = await createTestSponsor({ companyName: `Visibility Co B ${Date.now()}` });
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
      licenseNumber: `VIS_A_${driverA.userId}`,
    });
    const driverBProfile = await createTestDriverProfile({
      userId: driverB.userId,
      sponsorCompanyId: companyB,
      licenseNumber: `VIS_B_${driverB.userId}`,
    });
    createdLicenseNumbers.push(driverAProfile.licenseNumber, driverBProfile.licenseNumber);

    // TEST 1: Sponsor A sees only their own driver
    log('TEST 1: Sponsor A sees only Company A drivers', `GET /api/sponsors/${sponsorA.userId}/my-drivers`);
    const resA = await axios.get(`${API_BASE_URL}/sponsors/${sponsorA.userId}/my-drivers`);
    if (resA.status !== 200 || !Array.isArray(resA.data)) {
      throw new Error('Expected 200 and array from Sponsor A my-drivers');
    }
    const idsSeenByA = resA.data.map((d) => Number(d.UserID));
    if (!idsSeenByA.includes(driverA.userId)) {
      throw new Error('Sponsor A should see their own driver');
    }
    if (idsSeenByA.includes(driverB.userId)) {
      throw new Error('Sponsor A must NOT see Company B\'s driver');
    }
    console.log('PASS: Sponsor A sees only Company A drivers');

    // TEST 2: Sponsor B sees only their own driver
    log('TEST 2: Sponsor B sees only Company B drivers', `GET /api/sponsors/${sponsorB.userId}/my-drivers`);
    const resB = await axios.get(`${API_BASE_URL}/sponsors/${sponsorB.userId}/my-drivers`);
    if (resB.status !== 200 || !Array.isArray(resB.data)) {
      throw new Error('Expected 200 and array from Sponsor B my-drivers');
    }
    const idsSeenByB = resB.data.map((d) => Number(d.UserID));
    if (!idsSeenByB.includes(driverB.userId)) {
      throw new Error('Sponsor B should see their own driver');
    }
    if (idsSeenByB.includes(driverA.userId)) {
      throw new Error('Sponsor B must NOT see Company A\'s driver');
    }
    console.log('PASS: Sponsor B sees only Company B drivers');

    // TEST 3: Unknown userId returns 404
    log('TEST 3: Unknown userId returns 404', 'GET /api/sponsors/0/my-drivers');
    try {
      await axios.get(`${API_BASE_URL}/sponsors/0/my-drivers`);
      throw new Error('Expected 404 for unknown sponsor userId');
    } catch (err) {
      if (err.response?.status !== 404) throw err;
      console.log('PASS: Unknown userId returns 404');
    }

    // TEST 4: Session mismatch blocks route userId access
    log('TEST 4: Mismatched effective user returns 403', `GET /api/sponsors/${sponsorA.userId}/my-drivers`);
    const mismatchCookie = buildSessionCookie({ ...sponsorB, userType: 'sponsor' });
    try {
      await axios.get(`${API_BASE_URL}/sponsors/${sponsorA.userId}/my-drivers`, {
        headers: { Cookie: mismatchCookie },
      });
      throw new Error('Expected 403 for mismatched effective session on my-drivers');
    } catch (err) {
      if (err.response?.status !== 403) throw err;
      console.log('PASS: Mismatched effective user returns 403');
    }

    console.log('\nSponsor driver visibility isolation tests completed successfully!');
  } catch (error) {
    console.error('\nSponsor driver visibility tests FAILED:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    process.exitCode = 1;
  } finally {
    await cleanupUsers(createdUserIds);
    await cleanupSponsorCompanies(createdSponsorIds);
    await closePool();
  }
}

runTests();
