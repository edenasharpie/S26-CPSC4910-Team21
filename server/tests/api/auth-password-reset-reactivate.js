import axios from 'axios';
import {
  BASE_URL,
  log,
  createTestUser,
  createTestDriverProfile,
  closePool,
} from '../setup.js';
import { pool } from '../../src/db.js';
import { hashPassword } from '../../src/utils/auth.js';

const API_URL = `${BASE_URL}/api/auth`;

const createdUserIds = [];
const createdDriverLicenses = [];

async function cleanupUsers(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;

  const connection = await pool.getConnection();
  try {
    for (const userId of userIds) {
      await connection.query('DELETE FROM EVENTS WHERE UserID = ?', [userId]);
      try {
        await connection.query(
          'DELETE FROM DRIVER_COMPANY_ENROLLMENT WHERE DriverID IN (SELECT LicenseNumber FROM DRIVERS WHERE UserID = ?)',
          [userId]
        );
      } catch (error) {
        if (error?.code !== 'ER_NO_SUCH_TABLE' && error?.code !== 'ER_BAD_FIELD_ERROR') {
          throw error;
        }
      }
      await connection.query('DELETE FROM DRIVERS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM SPONSORS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM ADMINS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [userId]);
    }
  } finally {
    connection.release();
  }
}

async function getActiveStatus(userId) {
  const [rows] = await pool.query('SELECT ActiveStatus FROM USERS WHERE UserID = ?', [userId]);
  return rows[0] ? Number(rows[0].ActiveStatus) : null;
}

async function runTests() {
  try {
    console.log('Starting auth password reset/reactivate endpoint tests...\n');

    const suffix = String(Date.now()).slice(-6);

    const inactiveDriverPassword = 'DriverPass123!';
    const activeDriverPassword = 'ActivePass123!';
    const sponsorPassword = 'SponsorPass123!';

    const inactiveDriverUser = await createTestUser({
      userType: 'driver',
      activeStatus: 0,
      username: `idr${suffix}`,
      email: `idr${suffix}@e.co`,
      passHash: await hashPassword(inactiveDriverPassword),
      firstName: 'Inactive',
      lastName: 'Driver',
    });
    createdUserIds.push(inactiveDriverUser.userId);

    const inactiveDriverProfile = await createTestDriverProfile({
      userId: inactiveDriverUser.userId,
      licenseNumber: `LID${suffix}`,
      pointBalance: 200,
      sponsorCompanyId: null,
    });
    createdDriverLicenses.push(inactiveDriverProfile.licenseNumber);

    const activeDriverUser = await createTestUser({
      userType: 'driver',
      activeStatus: 1,
      username: `adr${suffix}`,
      email: `adr${suffix}@e.co`,
      passHash: await hashPassword(activeDriverPassword),
      firstName: 'Active',
      lastName: 'Driver',
    });
    createdUserIds.push(activeDriverUser.userId);

    const activeDriverProfile = await createTestDriverProfile({
      userId: activeDriverUser.userId,
      licenseNumber: `LAD${suffix}`,
      pointBalance: 300,
      sponsorCompanyId: null,
    });
    createdDriverLicenses.push(activeDriverProfile.licenseNumber);

    const sponsorUser = await createTestUser({
      userType: 'sponsor',
      activeStatus: 0,
      username: `spr${suffix}`,
      email: `spr${suffix}@e.co`,
      passHash: await hashPassword(sponsorPassword),
      firstName: 'Inactive',
      lastName: 'Sponsor',
    });
    createdUserIds.push(sponsorUser.userId);

    log('TEST 1: Reactivate missing fields should return 400...', 'POST /api/auth/reactivate');
    try {
      await axios.post(`${API_URL}/reactivate`, {});
      throw new Error('Expected missing reactivation payload to fail with 400.');
    } catch (error) {
      if (error?.response?.status !== 400) throw error;
    }

    log('TEST 2: Reactivate invalid credentials should return 401...', 'POST /api/auth/reactivate');
    try {
      await axios.post(`${API_URL}/reactivate`, {
        username: inactiveDriverUser.username,
        password: 'WrongPassword!',
      });
      throw new Error('Expected invalid credentials to fail with 401.');
    } catch (error) {
      if (error?.response?.status !== 401) throw error;
    }

    log('TEST 3: Reactivate non-driver account should return 403...', 'POST /api/auth/reactivate');
    try {
      await axios.post(`${API_URL}/reactivate`, {
        username: sponsorUser.username,
        password: sponsorPassword,
      });
      throw new Error('Expected sponsor self-reactivate to fail with 403.');
    } catch (error) {
      if (error?.response?.status !== 403) throw error;
    }

    log('TEST 4: Reactivate already-active driver should return 409...', 'POST /api/auth/reactivate');
    try {
      await axios.post(`${API_URL}/reactivate`, {
        username: activeDriverUser.username,
        password: activeDriverPassword,
      });
      throw new Error('Expected active driver reactivation to fail with 409.');
    } catch (error) {
      if (error?.response?.status !== 409) throw error;
    }

    log('TEST 5: Reactivate inactive driver should return 200...', 'POST /api/auth/reactivate');
    const reactivateResponse = await axios.post(`${API_URL}/reactivate`, {
      username: inactiveDriverUser.username,
      password: inactiveDriverPassword,
    });

    if (reactivateResponse.status !== 200 || reactivateResponse.data?.success !== true) {
      throw new Error('Expected successful driver reactivation response.');
    }

    const currentStatus = await getActiveStatus(inactiveDriverUser.userId);
    if (currentStatus !== 1) {
      throw new Error('Expected inactive driver ActiveStatus to be updated to 1 after reactivation.');
    }

    log('TEST 6: Password reset request missing identifier should return 400...', 'POST /api/auth/password-reset/request');
    try {
      await axios.post(`${API_URL}/password-reset/request`, {});
      throw new Error('Expected missing identifier to fail with 400.');
    } catch (error) {
      if (error?.response?.status !== 400) throw error;
    }

    log('TEST 7: Password reset request unknown identifier should return generic 200...', 'POST /api/auth/password-reset/request');
    const unknownRequestResponse = await axios.post(`${API_URL}/password-reset/request`, {
      identifier: `missing_${suffix}`,
    });

    if (unknownRequestResponse.status !== 200 || unknownRequestResponse.data?.success !== true) {
      throw new Error('Expected generic success response for unknown reset identifier.');
    }

    log('TEST 8: Password reset request valid identifier should return challenge...', 'POST /api/auth/password-reset/request');
    const knownRequestResponse = await axios.post(`${API_URL}/password-reset/request`, {
      identifier: activeDriverUser.username,
    });

    if (!knownRequestResponse.data?.resetRequestId || !knownRequestResponse.data?.manualEntryKey) {
      throw new Error('Expected reset challenge response to include resetRequestId and manualEntryKey.');
    }

    const resetRequestId = String(knownRequestResponse.data.resetRequestId);

    log('TEST 9: Verify TOTP missing payload should return 400...', 'POST /api/auth/password-reset/verify-totp');
    try {
      await axios.post(`${API_URL}/password-reset/verify-totp`, {});
      throw new Error('Expected missing verify payload to fail with 400.');
    } catch (error) {
      if (error?.response?.status !== 400) throw error;
    }

    log('TEST 10: Verify TOTP with invalid challenge should return 400...', 'POST /api/auth/password-reset/verify-totp');
    try {
      await axios.post(`${API_URL}/password-reset/verify-totp`, {
        resetRequestId: 'invalid-reset-request-id',
        totpCode: '123456',
      });
      throw new Error('Expected invalid reset challenge to fail with 400.');
    } catch (error) {
      if (error?.response?.status !== 400) throw error;
    }

    log('TEST 11: Verify TOTP with invalid code should return 401...', 'POST /api/auth/password-reset/verify-totp');
    try {
      await axios.post(`${API_URL}/password-reset/verify-totp`, {
        resetRequestId,
        totpCode: '000000',
      });
      throw new Error('Expected invalid TOTP to fail with 401.');
    } catch (error) {
      if (error?.response?.status !== 401) throw error;
    }

    log('TEST 12: Confirm reset missing payload should return 400...', 'POST /api/auth/password-reset/confirm');
    try {
      await axios.post(`${API_URL}/password-reset/confirm`, {});
      throw new Error('Expected missing confirm payload to fail with 400.');
    } catch (error) {
      if (error?.response?.status !== 400) throw error;
    }

    log('TEST 13: Confirm reset invalid token should return 401...', 'POST /api/auth/password-reset/confirm');
    try {
      await axios.post(`${API_URL}/password-reset/confirm`, {
        resetToken: 'invalid-reset-token',
        newPassword: 'Replacement123!',
      });
      throw new Error('Expected invalid reset token to fail with 401.');
    } catch (error) {
      if (error?.response?.status !== 401) throw error;
    }

    console.log('\nAll auth password reset/reactivate endpoint tests passed successfully.');
  } catch (error) {
    console.error('\nAuth password reset/reactivate endpoint tests failed.');
    if (error?.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    process.exitCode = 1;
  } finally {
    await cleanupUsers(createdUserIds);
    await closePool();
    process.exit(process.exitCode ?? 0);
  }
}

runTests();
