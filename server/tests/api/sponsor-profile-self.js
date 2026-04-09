import axios from 'axios';
import {
  BASE_URL,
  log,
  createTestSponsor,
  cleanupSponsorCompanies,
  closePool,
  createTestUser,
  createTestSponsorProfile,
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
    console.log('Starting sponsor self-profile API tests...\n');

    const sponsorCompanyId = await createTestSponsor({
      companyName: `Sponsor Self Profile ${Date.now()}`,
      pointDollarValue: 0.01,
    });
    createdSponsorIds.push(sponsorCompanyId);

    const sponsor = await createTestUser({ userType: 'sponsor' });
    createdUserIds.push(sponsor.userId);

    await createTestSponsorProfile({
      userId: sponsor.userId,
      sponsorCompanyId,
    });

    // Test 1: Sponsor can retrieve own profile from /api/user/profile/:id
    log('TEST 1: Sponsor self profile read succeeds', `GET /api/user/profile/${sponsor.userId}`);
    const profileRes = await axios.get(`${API_BASE_URL}/user/profile/${sponsor.userId}`);
    if (profileRes.status !== 200 || Number(profileRes.data?.UserID) !== Number(sponsor.userId)) {
      throw new Error('Expected sponsor self profile GET to return requested user');
    }

    // Test 2: Sponsor can patch own profile through /api/user/profile/:id
    log('TEST 2: Sponsor self profile patch succeeds', `PATCH /api/user/profile/${sponsor.userId}`);
    const updatedFirst = 'SponsorSelf';
    const updatedLast = 'Patched';
    const updatedEmail = `sponsor-self-${Date.now()}@example.com`;

    const patchRes = await axios.patch(`${API_BASE_URL}/user/profile/${sponsor.userId}`, {
      firstName: updatedFirst,
      lastName: updatedLast,
      email: updatedEmail,
      phone: '5551112222',
    });

    if (
      patchRes.status !== 200 ||
      patchRes.data?.FirstName !== updatedFirst ||
      patchRes.data?.LastName !== updatedLast ||
      patchRes.data?.Email !== updatedEmail
    ) {
      throw new Error('Expected sponsor self profile PATCH to persist updated fields');
    }

    // Test 3: Defensive negative check documenting prior 404 path
    log(
      'TEST 3: Sponsor id treated as driver id returns 404',
      `GET /api/sponsors/${sponsor.userId}/drivers/${sponsor.userId}`
    );
    try {
      await axios.get(`${API_BASE_URL}/sponsors/${sponsor.userId}/drivers/${sponsor.userId}`);
      throw new Error('Expected 404 when sponsor id is used as a driver id for sponsor driver lookup');
    } catch (error) {
      if (!error.response || error.response.status !== 404) {
        throw error;
      }
    }

    console.log('\nSponsor self-profile API tests completed successfully!');
  } catch (error) {
    console.error('\nSponsor self-profile tests failed:');
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
