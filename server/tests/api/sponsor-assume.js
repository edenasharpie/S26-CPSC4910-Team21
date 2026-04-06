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
  setUserActiveStatus,
  setUserPermissions,
} from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;

const createdUserIds = [];
const createdSponsorIds = [];

async function cleanupUsers(userIds) {
  if (!userIds || userIds.length === 0) return;

  const connection = await pool.getConnection();
  try {
    for (const userId of userIds) {
      await connection.query('DELETE FROM EVENTS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM DRIVERS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM SPONSORS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [userId]);
      console.log(`Deleted user ${userId}`);
    }
  } catch (error) {
    console.error('Error cleaning up users:', error.message);
  } finally {
    connection.release();
  }
}

async function runTests() {
  try {
    console.log('Starting sponsor assume endpoint tests...\n');

    const companyA = await createTestSponsor({
      companyName: `Sponsor Assume A ${Date.now()}`,
      pointDollarValue: 0.01,
    });
    const companyB = await createTestSponsor({
      companyName: `Sponsor Assume B ${Date.now()}`,
      pointDollarValue: 0.01,
    });
    createdSponsorIds.push(companyA, companyB);

    const sponsorUser = await createTestUser({ userType: 'sponsor' });
    const otherRoleRequester = await createTestUser({ userType: 'admin' });
    const sameCompanyDriver = await createTestUser({ userType: 'driver' });
    const otherCompanyDriver = await createTestUser({ userType: 'driver' });

    createdUserIds.push(
      sponsorUser.userId,
      otherRoleRequester.userId,
      sameCompanyDriver.userId,
      otherCompanyDriver.userId
    );

    await createTestSponsorProfile({ userId: sponsorUser.userId, sponsorCompanyId: companyA });

    await createTestDriverProfile({
      userId: sameCompanyDriver.userId,
      sponsorCompanyId: companyA,
      licenseNumber: `SPA_DL_${sameCompanyDriver.userId}`,
    });

    await createTestDriverProfile({
      userId: otherCompanyDriver.userId,
      sponsorCompanyId: companyB,
      licenseNumber: `SPB_DL_${otherCompanyDriver.userId}`,
    });

    // Test 1: sponsor assumes same-company driver
    log('TEST 1: Sponsor assume same-company driver success', `POST /api/sponsors/${sponsorUser.userId}/assume-driver/${sameCompanyDriver.userId}`);
    const happyPathRes = await axios.post(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/assume-driver/${sameCompanyDriver.userId}`);
    if (happyPathRes.status !== 200 || happyPathRes.data?.assumedUser?.UserType !== 'driver') {
      throw new Error('Expected sponsor assume success with driver payload');
    }

    // Test 2: missing permission returns 403
    log('TEST 2: Missing canAssumeDriverView returns 403', 'POST /api/sponsors/:userId/assume-driver/:driverId');
    await setUserPermissions(sponsorUser.userId, { canAssumeDriverView: false });
    try {
      await axios.post(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/assume-driver/${sameCompanyDriver.userId}`);
      throw new Error('Expected 403 when sponsor lacks canAssumeDriverView');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }
    await setUserPermissions(sponsorUser.userId, {});

    // Test 3: inactive sponsor returns 403
    log('TEST 3: Inactive sponsor requester returns 403', 'POST /api/sponsors/:userId/assume-driver/:driverId');
    await setUserActiveStatus(sponsorUser.userId, 0);
    try {
      await axios.post(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/assume-driver/${sameCompanyDriver.userId}`);
      throw new Error('Expected 403 for inactive sponsor requester');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }
    await setUserActiveStatus(sponsorUser.userId, 1);

    // Test 4: out-of-company driver returns 404
    log('TEST 4: Out-of-company driver returns 404', 'POST /api/sponsors/:userId/assume-driver/:driverId');
    try {
      await axios.post(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/assume-driver/${otherCompanyDriver.userId}`);
      throw new Error('Expected 404 for out-of-company driver');
    } catch (error) {
      if (!error.response || error.response.status !== 404) {
        throw error;
      }
    }

    // Test 5: inactive target driver returns 409
    log('TEST 5: Inactive target driver returns 409', 'POST /api/sponsors/:userId/assume-driver/:driverId');
    await setUserActiveStatus(sameCompanyDriver.userId, 0);
    try {
      await axios.post(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/assume-driver/${sameCompanyDriver.userId}`);
      throw new Error('Expected 409 for inactive target driver');
    } catch (error) {
      if (!error.response || error.response.status !== 409) {
        throw error;
      }
    }
    await setUserActiveStatus(sameCompanyDriver.userId, 1);

    // Test 6: non-sponsor requester returns 403
    log('TEST 6: Non-sponsor requester returns 403', 'POST /api/sponsors/:userId/assume-driver/:driverId');
    try {
      await axios.post(`${API_BASE_URL}/sponsors/${otherRoleRequester.userId}/assume-driver/${sameCompanyDriver.userId}`);
      throw new Error('Expected 403 for non-sponsor requester');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }

    console.log('\nSponsor assume endpoint tests completed successfully!');
  } catch (error) {
    console.error('\nSponsor assume tests failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    await cleanupUsers(createdUserIds);
    await cleanupSponsorCompanies(createdSponsorIds);
    await closePool();
  }
}

runTests();
