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
      const [driverRows] = await connection.query(
        'SELECT LicenseNumber FROM DRIVERS WHERE UserID = ? LIMIT 1',
        [userId]
      );

      const driverLicense = driverRows[0]?.LicenseNumber;
      if (driverLicense) {
        await connection.query('DELETE FROM DRIVER_COMPANY_ENROLLMENT WHERE DriverID = ?', [driverLicense]);
      }

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
    console.log('Starting sponsor->driver profile upload API tests...\n');

    const sponsorCompanyId = await createTestSponsor({
      companyName: `Sponsor Driver Upload ${Date.now()}`,
      pointDollarValue: 0.01,
    });
    createdSponsorIds.push(sponsorCompanyId);

    const sponsor = await createTestUser({ userType: 'sponsor' });
    const driver = await createTestUser({ userType: 'driver' });
    createdUserIds.push(sponsor.userId, driver.userId);

    await createTestSponsorProfile({
      userId: sponsor.userId,
      sponsorCompanyId,
    });

    const driverProfile = await createTestDriverProfile({
      userId: driver.userId,
      sponsorCompanyId,
      licenseNumber: `SPUP_${driver.userId}`,
      pointBalance: 100,
      performanceStatus: 'good',
    });

    const connection = await pool.getConnection();
    try {
      await connection.query(
        `INSERT INTO DRIVER_COMPANY_ENROLLMENT (DriverID, SponsorCompanyID, PointBalance, EnrollmentStatus, JoinedAt, LeftAt)
         VALUES (?, ?, 100, 'active', NOW(), NULL)`,
        [driverProfile.licenseNumber, sponsorCompanyId]
      );
    } finally {
      connection.release();
    }

    // Test 1: Sponsor updates sponsor-owned driver profile with profile image upload
    log('TEST 1: Sponsor can upload image while patching driver profile', `PATCH /api/sponsors/${sponsor.userId}/drivers/${driver.userId}`);
    const updatedEmail = `sdu-${Date.now()}@example.com`;
    const updatedPhone = '5558881234';

    const uploadFormData = new FormData();
    uploadFormData.append('firstName', 'SponsorEdited');
    uploadFormData.append('lastName', 'DriverUpload');
    uploadFormData.append('email', updatedEmail);
    uploadFormData.append('phone', updatedPhone);
    uploadFormData.append('profileImage', new Blob([ONE_PIXEL_PNG], { type: 'image/png' }), 'driver-upload.png');

    const patchRes = await axios.patch(
      `${API_BASE_URL}/sponsors/${sponsor.userId}/drivers/${driver.userId}`,
      uploadFormData
    );

    const responseProfilePicture = patchRes.data?.ProfilePicture ?? patchRes.data?.profilePicture;
    const responseEmail = patchRes.data?.Email ?? patchRes.data?.email;
    const responsePhone = patchRes.data?.Phone ?? patchRes.data?.phone;

    if (
      patchRes.status !== 200 ||
      Number(patchRes.data?.UserID ?? patchRes.data?.userId) !== Number(driver.userId) ||
      patchRes.data?.FirstName !== 'SponsorEdited' ||
      patchRes.data?.LastName !== 'DriverUpload' ||
      String(responseEmail ?? '') !== updatedEmail ||
      String(responsePhone ?? '') !== updatedPhone ||
      typeof responseProfilePicture !== 'string' ||
      !String(responseProfilePicture).startsWith('/api/images/u/')
    ) {
      throw new Error(`Expected sponsor driver patch to persist upload and profile fields. Received: ${JSON.stringify(patchRes.data)}`);
    }

    const imageReadRes = await axios.get(`${BASE_URL}${responseProfilePicture}`, {
      responseType: 'arraybuffer',
    });

    if (imageReadRes.status !== 200 || !String(imageReadRes.headers['content-type'] || '').includes('image/')) {
      throw new Error('Expected uploaded sponsor-managed driver image to be retrievable.');
    }

    // Test 2: Invalid image mime type is rejected
    log('TEST 2: Sponsor driver upload rejects invalid mime type', `PATCH /api/sponsors/${sponsor.userId}/drivers/${driver.userId}`);
    const invalidFormData = new FormData();
    invalidFormData.append('firstName', 'ShouldFail');
    invalidFormData.append('profileImage', new Blob([Buffer.from('not-an-image')], { type: 'text/plain' }), 'invalid.txt');

    try {
      await axios.patch(`${API_BASE_URL}/sponsors/${sponsor.userId}/drivers/${driver.userId}`, invalidFormData);
      throw new Error('Expected invalid sponsor driver image upload to return 400');
    } catch (error) {
      if (!error.response || error.response.status !== 400) {
        throw error;
      }
    }

    console.log('\nSponsor->driver profile upload API tests completed successfully!');
  } catch (error) {
    console.error('\nSponsor->driver profile upload tests failed:');
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
