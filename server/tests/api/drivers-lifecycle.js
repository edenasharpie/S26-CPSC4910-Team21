import axios from 'axios';
import {
  BASE_URL,
  log,
  createTestSponsor,
  createTestUser,
  createTestDriverProfile,
  cleanupSponsorCompanies,
  closePool,
} from '../setup.js';
import { pool } from '../../src/db.js';
import { hashPassword } from '../../src/utils/auth.js';

const API_URL = `${BASE_URL}/api/drivers`;

const createdUserIds = [];
const createdSponsorCompanyIds = [];

async function cleanupUsers(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;

  const connection = await pool.getConnection();
  try {
    for (const userId of userIds) {
      const [driverRows] = await connection.query('SELECT LicenseNumber FROM DRIVERS WHERE UserID = ?', [userId]);
      for (const row of driverRows) {
        await connection.query('DELETE FROM POINT_TRANSACTIONS WHERE DriverID = ?', [row.LicenseNumber]);
      }

      await connection.query('DELETE FROM EVENTS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM DRIVERS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM SPONSORS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM ADMINS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [userId]);
    }
  } finally {
    connection.release();
  }
}

async function runTests() {
  try {
    console.log('Starting driver sponsors/deactivate endpoint tests...\n');

    const suffix = String(Date.now()).slice(-6);
    const sponsorCompanyId = await createTestSponsor({
      companyName: `Driver Sponsor ${suffix}`,
      pointDollarValue: 0.01,
    });
    createdSponsorCompanyIds.push(sponsorCompanyId);

    const driverPassword = 'DriverSelfDeactivate123!';
    const driverUser = await createTestUser({
      userType: 'driver',
      activeStatus: 1,
      username: `drv${suffix}`,
      email: `drv${suffix}@e.co`,
      passHash: await hashPassword(driverPassword),
      firstName: 'Driver',
      lastName: 'Lifecycle',
    });
    createdUserIds.push(driverUser.userId);

    const driverProfile = await createTestDriverProfile({
      userId: driverUser.userId,
      sponsorCompanyId,
      licenseNumber: `DLS${suffix}`,
      pointBalance: 400,
      performanceStatus: 'good',
    });

    await pool.query(
      `INSERT INTO POINT_TRANSACTIONS (DriverID, UserChanged, PointChange, ReasonForChange, TimeChanged)
       VALUES (?, ?, ?, ?, NOW())`,
      [driverProfile.licenseNumber, driverUser.userId, 25, 'seed_points']
    );

    log('TEST 1: Fetching driver sponsor affiliations...', `GET ${API_URL}/sponsors/${driverUser.userId}`);
    const sponsorsResponse = await axios.get(`${API_URL}/sponsors/${driverUser.userId}`);

    if (sponsorsResponse.status !== 200 || !Array.isArray(sponsorsResponse.data)) {
      throw new Error('Expected sponsors endpoint to return 200 with array payload.');
    }

    const hasCreatedSponsor = sponsorsResponse.data.some((row) => Number(row.SponsorCompanyID) === Number(sponsorCompanyId));
    if (!hasCreatedSponsor) {
      throw new Error('Expected sponsors endpoint to include created sponsor company.');
    }

    log('TEST 2: Invalid userId should return 400...', `GET ${API_URL}/sponsors/not-a-number`);
    try {
      await axios.get(`${API_URL}/sponsors/not-a-number`);
      throw new Error('Expected invalid userId on sponsors endpoint to fail with 400.');
    } catch (error) {
      if (error?.response?.status !== 400) throw error;
    }

    log('TEST 3: Deactivate missing payload should return 400...', `POST ${API_URL}/deactivate`);
    try {
      await axios.post(`${API_URL}/deactivate`, {});
      throw new Error('Expected missing deactivate payload to fail with 400.');
    } catch (error) {
      if (error?.response?.status !== 400) throw error;
    }

    log('TEST 4: Deactivate wrong password should return 401...', `POST ${API_URL}/deactivate`);
    try {
      await axios.post(`${API_URL}/deactivate`, {
        userId: driverUser.userId,
        currentPassword: 'WrongPassword!',
      });
      throw new Error('Expected wrong password to fail with 401.');
    } catch (error) {
      if (error?.response?.status !== 401) throw error;
    }

    log('TEST 5: Deactivate valid credentials should return 200...', `POST ${API_URL}/deactivate`);
    const deactivateResponse = await axios.post(`${API_URL}/deactivate`, {
      userId: driverUser.userId,
      currentPassword: driverPassword,
    });

    if (deactivateResponse.status !== 200 || deactivateResponse.data?.success !== true) {
      throw new Error('Expected successful driver deactivate response.');
    }

    log('TEST 6: Deactivate already inactive account should return 409...', `POST ${API_URL}/deactivate`);
    try {
      await axios.post(`${API_URL}/deactivate`, {
        userId: driverUser.userId,
        currentPassword: driverPassword,
      });
      throw new Error('Expected second deactivate call to fail with 409.');
    } catch (error) {
      if (error?.response?.status !== 409) throw error;
    }

    log('TEST 7: Inactive driver should be blocked from sponsors endpoint...', `GET ${API_URL}/sponsors/${driverUser.userId}`);
    try {
      await axios.get(`${API_URL}/sponsors/${driverUser.userId}`);
      throw new Error('Expected inactive driver sponsors lookup to fail with 403.');
    } catch (error) {
      if (error?.response?.status !== 403) throw error;
    }

    console.log('\nAll driver sponsors/deactivate endpoint tests passed successfully.');
  } catch (error) {
    console.error('\nDriver sponsors/deactivate endpoint tests failed.');
    if (error?.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    process.exitCode = 1;
  } finally {
    await cleanupUsers(createdUserIds);
    await cleanupSponsorCompanies(createdSponsorCompanyIds);
    await closePool();
    process.exit(process.exitCode ?? 0);
  }
}

runTests();
