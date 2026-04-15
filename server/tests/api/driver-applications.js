import axios from 'axios';
import jwt from 'jsonwebtoken';
import {
  BASE_URL,
  closePool,
  createTestDriverProfile,
  createTestSponsor,
  createTestUser,
  cleanupSponsorCompanies,
  log,
} from '../setup.js';
import { pool } from '../../src/db.js';

const USER_API_URL = `${BASE_URL}/api/user`;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-fleetscore';

const createdUserIds = [];
const createdApplicationIds = [];
const createdSponsorCompanyIds = [];

function buildSessionCookie(user) {
  const payload = {
    UserID: user.userId,
    UserType: user.userType,
    Username: user.username,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: 60 * 60 * 24 });
  return `sessionId=${token}`;
}

async function cleanupApplications(applicationIds, trackedLicenseNumbers = []) {
  const connection = await pool.getConnection();
  try {
    for (const appId of applicationIds) {
      await connection.query('DELETE FROM DRIVER_APPLICATIONS WHERE ApplicationID = ?', [appId]);
    }

    for (const licenseNumber of trackedLicenseNumbers) {
      await connection.query('DELETE FROM DRIVER_APPLICATIONS WHERE DriverID = ?', [licenseNumber]);
    }
  } catch (error) {
    console.error('Error cleaning up applications:', error.message);
  } finally {
    connection.release();
  }
}

async function cleanupUsers(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;

  const connection = await pool.getConnection();
  try {
    for (const userId of userIds) {
      await connection.query('DELETE FROM EVENTS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM DRIVERS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM SPONSORS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM ADMINS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [userId]);
    }
  } catch (error) {
    console.error('Error cleaning up users:', error.message);
  } finally {
    connection.release();
  }
}

async function runTests() {
  let driverLicenseNumber = '';

  try {
    console.log('Starting driver applications endpoint tests...\n');

    const suffix = String(Date.now()).slice(-6);

    const sponsorCompanyId = await createTestSponsor({
      companyName: `Driver App Co ${suffix}`,
      pointDollarValue: 0.01,
    });
    createdSponsorCompanyIds.push(sponsorCompanyId);

    const driverUser = await createTestUser({ userType: 'driver' });
    const otherDriverUser = await createTestUser({ userType: 'driver' });
    createdUserIds.push(driverUser.userId, otherDriverUser.userId);

    const driverProfile = await createTestDriverProfile({
      userId: driverUser.userId,
      sponsorCompanyId: null,
      licenseNumber: `DRVAPP_${driverUser.userId}`,
      pointBalance: 50,
    });

    driverLicenseNumber = driverProfile.licenseNumber;

    await createTestDriverProfile({
      userId: otherDriverUser.userId,
      sponsorCompanyId: null,
      licenseNumber: `DRVAPP_${otherDriverUser.userId}`,
      pointBalance: 10,
    });

    log('TEST 1: Submit application with numeric driver userId', 'POST /api/user/submit-application');
    const submitRes = await axios.post(`${USER_API_URL}/submit-application`, {
      driverId: driverUser.userId,
      sponsorCompanyId,
      explanation: 'Strong safety track record',
    });

    if (submitRes.status !== 201 || !submitRes.data?.applicationId) {
      throw new Error('Expected successful application submission with applicationId.');
    }

    createdApplicationIds.push(Number(submitRes.data.applicationId));

    if (String(submitRes.data.driverId) !== String(driverLicenseNumber)) {
      throw new Error('Expected submit endpoint to resolve driverId to license number.');
    }

    log('TEST 2: Duplicate pending application returns 409', 'POST /api/user/submit-application');
    try {
      await axios.post(`${USER_API_URL}/submit-application`, {
        driverId: driverUser.userId,
        sponsorCompanyId,
        explanation: 'Duplicate pending should fail',
      });
      throw new Error('Expected duplicate pending application to fail with 409.');
    } catch (error) {
      if (error?.response?.status !== 409) throw error;
    }

    log('TEST 3: Submit application supports license-number driverId', 'POST /api/user/submit-application');
    const sponsorCompanyId2 = await createTestSponsor({
      companyName: `Driver App Co 2 ${suffix}`,
      pointDollarValue: 0.01,
    });
    createdSponsorCompanyIds.push(sponsorCompanyId2);

    const submitByLicenseRes = await axios.post(`${USER_API_URL}/submit-application`, {
      driverId: driverLicenseNumber,
      sponsorCompanyId: sponsorCompanyId2,
      explanation: 'Submitting by license number',
    });

    if (submitByLicenseRes.status !== 201 || !submitByLicenseRes.data?.applicationId) {
      throw new Error('Expected successful submission when driverId is a license number.');
    }

    createdApplicationIds.push(Number(submitByLicenseRes.data.applicationId));

    log('TEST 4: Missing required fields return 400', 'POST /api/user/submit-application');
    try {
      await axios.post(`${USER_API_URL}/submit-application`, {
        driverId: driverUser.userId,
        sponsorCompanyId,
      });
      throw new Error('Expected missing explanation to fail with 400.');
    } catch (error) {
      if (error?.response?.status !== 400) throw error;
    }

    log('TEST 5: Unknown sponsor company returns 404', 'POST /api/user/submit-application');
    try {
      await axios.post(`${USER_API_URL}/submit-application`, {
        driverId: driverUser.userId,
        sponsorCompanyId: 999999999,
        explanation: 'Invalid sponsor should fail',
      });
      throw new Error('Expected unknown sponsor company to fail with 404.');
    } catch (error) {
      if (error?.response?.status !== 404) throw error;
    }

    log('TEST 6: Driver can fetch their applications by userId', 'GET /api/user/my-applications/:driverId');
    const myAppsRes = await axios.get(`${USER_API_URL}/my-applications/${driverUser.userId}`);
    if (myAppsRes.status !== 200 || !Array.isArray(myAppsRes.data)) {
      throw new Error('Expected applications array response for my-applications.');
    }

    const returnedApplicationIds = myAppsRes.data.map((row) => Number(row.ApplicationID));
    if (!returnedApplicationIds.includes(Number(submitRes.data.applicationId))) {
      throw new Error('Expected first created application in my-applications response.');
    }

    if (!returnedApplicationIds.includes(Number(submitByLicenseRes.data.applicationId))) {
      throw new Error('Expected second created application in my-applications response.');
    }

    log('TEST 7: Mismatched session user cannot fetch another driver applications', 'GET /api/user/my-applications/:driverId');
    const mismatchedCookie = buildSessionCookie({ ...otherDriverUser, userType: 'driver' });

    try {
      await axios.get(`${USER_API_URL}/my-applications/${driverUser.userId}`, {
        headers: { Cookie: mismatchedCookie },
      });
      throw new Error('Expected mismatched session user to fail with 403.');
    } catch (error) {
      if (error?.response?.status !== 403) throw error;
    }

    log('TEST 8: Unknown driver returns 404 on my-applications', 'GET /api/user/my-applications/:driverId');
    try {
      await axios.get(`${USER_API_URL}/my-applications/UNKNOWN_DRIVER_LICENSE`);
      throw new Error('Expected unknown driver lookup to fail with 404.');
    } catch (error) {
      if (error?.response?.status !== 404) throw error;
    }

    console.log('\nDriver applications endpoint tests completed successfully!');
  } catch (error) {
    console.error('\nDriver applications endpoint tests failed.');
    if (error?.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error?.message ?? error);
    }
    process.exitCode = 1;
  } finally {
    await cleanupApplications(createdApplicationIds, driverLicenseNumber ? [driverLicenseNumber] : []);
    await cleanupUsers(createdUserIds);
    await cleanupSponsorCompanies(createdSponsorCompanyIds);
    await closePool();
    process.exit(process.exitCode ?? 0);
  }
}

runTests();
