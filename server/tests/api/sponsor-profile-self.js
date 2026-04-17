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
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn0jL0AAAAASUVORK5CYII=',
  'base64'
);

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

    // Test 2: Sponsor can patch own profile and upload image through /api/user/profile/:id
    log('TEST 2: Sponsor self profile patch with image upload succeeds', `PATCH /api/user/profile/${sponsor.userId}`);
    const updatedFirst = 'SponsorSelf';
    const updatedLast = 'Patched';
    const updatedEmail = `sponsor-self-${Date.now()}@example.com`;
    const updatedPhone = '5551112222';

    const formData = new FormData();
    formData.append('firstName', updatedFirst);
    formData.append('lastName', updatedLast);
    formData.append('email', updatedEmail);
    formData.append('phone', updatedPhone);
    formData.append('profileImage', new Blob([ONE_PIXEL_PNG], { type: 'image/png' }), 'sponsor-profile.png');

    const patchRes = await axios.patch(`${API_BASE_URL}/user/profile/${sponsor.userId}`, formData);

    if (
      patchRes.status !== 200 ||
      Number(patchRes.data?.UserID) !== Number(sponsor.userId) ||
      patchRes.data?.FirstName !== updatedFirst ||
      patchRes.data?.LastName !== updatedLast ||
      patchRes.data?.Email !== updatedEmail ||
      patchRes.data?.Phone !== updatedPhone ||
      typeof patchRes.data?.ProfilePicture !== 'string' ||
      !patchRes.data.ProfilePicture.startsWith('/api/images/u/')
    ) {
      throw new Error('Expected sponsor self profile PATCH to persist updated fields and profile image path');
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
