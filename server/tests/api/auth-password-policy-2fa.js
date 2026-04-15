import axios from 'axios';
import { generateSync as generateTotpSync } from 'otplib';
import {
  BASE_URL,
  closePool,
  createTestDriverProfile,
  createTestUser,
  log,
} from '../setup.js';
import { hashPassword } from '../../src/utils/auth.js';
import { pool } from '../../src/db.js';

const AUTH_API_URL = `${BASE_URL}/api/auth`;
const USER_API_URL = `${BASE_URL}/api/user`;

const createdUserIds = [];

async function cleanupUsers(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;

  const connection = await pool.getConnection();
  try {
    for (const userId of userIds) {
      const [driverRows] = await connection.query(
        'SELECT LicenseNumber FROM DRIVERS WHERE UserID = ?',
        [userId]
      );

      for (const row of driverRows) {
        await connection.query('DELETE FROM POINT_TRANSACTIONS WHERE DriverID = ?', [row.LicenseNumber]);
      }

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

async function getLatestPasswordChangeEvent(userId) {
  const [rows] = await pool.query(
    `SELECT EventID, Properties
     FROM EVENTS
     WHERE UserID = ? AND EventType = 'PasswordChange'
     ORDER BY EventID DESC
     LIMIT 1`,
    [userId]
  );

  return rows[0] ?? null;
}

async function runTests() {
  try {
    console.log('Starting auth password policy + 2FA success tests...\n');

    const suffix = String(Date.now()).slice(-6);
    const initialPassword = 'InitialPass123!';
    const changedPassword = 'ChangedPass123!';
    const resetPassword = 'ResetPass123!';

    const driverUser = await createTestUser({
      userType: 'driver',
      activeStatus: 1,
      username: `pwd${suffix}`,
      email: `pwd${suffix}@e.co`,
      passHash: await hashPassword(initialPassword),
      firstName: 'Policy',
      lastName: 'Driver',
    });
    createdUserIds.push(driverUser.userId);

    await createTestDriverProfile({
      userId: driverUser.userId,
      licenseNumber: `PWD${suffix}`,
      pointBalance: 150,
      sponsorCompanyId: null,
    });

    log('TEST 1: Reject weak password on /api/user/change-password', 'POST /api/user/change-password');
    try {
      await axios.post(`${USER_API_URL}/change-password`, {
        userId: driverUser.userId,
        newPassword: 'weakpass12',
      });
      throw new Error('Expected weak password to fail with 400.');
    } catch (error) {
      if (error?.response?.status !== 400) throw error;
      const message = String(error?.response?.data?.message ?? '');
      if (!message.toLowerCase().includes('uppercase')) {
        throw new Error(`Expected uppercase-complexity validation error, received: ${message}`);
      }
    }

    log('TEST 2: Allow strong password change and record password event', 'POST /api/user/change-password');
    const changeResponse = await axios.post(`${USER_API_URL}/change-password`, {
      userId: driverUser.userId,
      newPassword: changedPassword,
    });

    if (changeResponse.status !== 200) {
      throw new Error(`Expected 200 for valid password change, received ${changeResponse.status}`);
    }

    const passwordChangeEvent = await getLatestPasswordChangeEvent(driverUser.userId);
    if (!passwordChangeEvent) {
      throw new Error('Expected PasswordChange event to be created after valid password change.');
    }

    log('TEST 3: Reject reuse of old password', 'POST /api/user/change-password');
    let reuseMessage = '';
    try {
      await axios.post(`${USER_API_URL}/change-password`, {
        userId: driverUser.userId,
        newPassword: initialPassword,
      });
      throw new Error('Expected password reuse request to fail with 400.');
    } catch (error) {
      if (error?.response?.status !== 400) throw error;
      reuseMessage = String(error?.response?.data?.message ?? '');
    }

    if (!reuseMessage.toLowerCase().includes('cannot reuse')) {
      throw new Error(`Expected password reuse message, received: ${reuseMessage}`);
    }

    log('TEST 4: Unknown identifier reset request stays generic', 'POST /api/auth/password-reset/request');
    const unknownIdentifierResponse = await axios.post(
      `${AUTH_API_URL}/password-reset/request`,
      { identifier: `missing_${suffix}` },
      { headers: { 'x-forwarded-for': `auth-reset-unknown-${suffix}` } }
    );

    if (unknownIdentifierResponse.status !== 200 || unknownIdentifierResponse.data?.success !== true) {
      throw new Error('Expected unknown identifier reset request to return generic success response.');
    }

    if (unknownIdentifierResponse.data?.resetRequestId) {
      throw new Error('Unknown identifier response must not include resetRequestId.');
    }

    log('TEST 5: Request password reset challenge for valid user', 'POST /api/auth/password-reset/request');
    const requestResponse = await axios.post(`${AUTH_API_URL}/password-reset/request`, {
      identifier: driverUser.username,
    });

    if (requestResponse.status !== 200 || !requestResponse.data?.resetRequestId || !requestResponse.data?.manualEntryKey) {
      throw new Error('Expected reset challenge response with resetRequestId and manualEntryKey.');
    }

    const resetRequestId = String(requestResponse.data.resetRequestId);
    const manualEntryKey = String(requestResponse.data.manualEntryKey);
    const validCode = generateTotpSync({ secret: manualEntryKey });

    log('TEST 6: Verify valid TOTP and receive reset token', 'POST /api/auth/password-reset/verify-totp');
    const verifyResponse = await axios.post(`${AUTH_API_URL}/password-reset/verify-totp`, {
      resetRequestId,
      totpCode: validCode,
    });

    if (verifyResponse.status !== 200 || !verifyResponse.data?.resetToken) {
      throw new Error('Expected verify-totp success with resetToken payload.');
    }

    const resetToken = String(verifyResponse.data.resetToken);

    log('TEST 7: Reusing a consumed challenge is rejected', 'POST /api/auth/password-reset/verify-totp');
    try {
      await axios.post(`${AUTH_API_URL}/password-reset/verify-totp`, {
        resetRequestId,
        totpCode: validCode,
      });
      throw new Error('Expected reused reset challenge to fail with 400.');
    } catch (error) {
      if (error?.response?.status !== 400) throw error;
    }

    log('TEST 8: Reject weak password during reset confirm', 'POST /api/auth/password-reset/confirm');
    try {
      await axios.post(`${AUTH_API_URL}/password-reset/confirm`, {
        resetToken,
        newPassword: 'weakpass12',
      });
      throw new Error('Expected weak reset password to fail with 400.');
    } catch (error) {
      if (error?.response?.status !== 400) throw error;
    }

    log('TEST 9: Confirm reset with strong password', 'POST /api/auth/password-reset/confirm');
    const confirmResponse = await axios.post(`${AUTH_API_URL}/password-reset/confirm`, {
      resetToken,
      newPassword: resetPassword,
    });

    if (confirmResponse.status !== 200 || confirmResponse.data?.success !== true) {
      throw new Error('Expected successful reset confirmation.');
    }

    log('TEST 10: Reset token is one-time use only', 'POST /api/auth/password-reset/confirm');
    try {
      await axios.post(`${AUTH_API_URL}/password-reset/confirm`, {
        resetToken,
        newPassword: 'AnotherPass123!',
      });
      throw new Error('Expected reused reset token to fail with 401.');
    } catch (error) {
      if (error?.response?.status !== 401) throw error;
    }

    log('TEST 11: Login succeeds with newly reset password and fails with stale password', 'POST /api/auth/login');
    const loginSuccess = await axios.post(`${AUTH_API_URL}/login`, {
      username: driverUser.username,
      password: resetPassword,
    });

    if (loginSuccess.status !== 200 || loginSuccess.data?.success !== true) {
      throw new Error('Expected login success with reset password.');
    }

    try {
      await axios.post(`${AUTH_API_URL}/login`, {
        username: driverUser.username,
        password: changedPassword,
      });
      throw new Error('Expected stale password login to fail.');
    } catch (error) {
      if (error?.response?.status !== 401) throw error;
    }

    log('TEST 12: Invalid TOTP attempts lock out challenge after threshold', 'POST /api/auth/password-reset/verify-totp');
    const lockoutRequestResponse = await axios.post(
      `${AUTH_API_URL}/password-reset/request`,
      { identifier: driverUser.username },
      { headers: { 'x-forwarded-for': `auth-reset-lockout-${suffix}` } }
    );

    const lockoutChallengeId = String(lockoutRequestResponse.data?.resetRequestId ?? '');
    if (!lockoutChallengeId) {
      throw new Error('Expected reset challenge ID for lockout test.');
    }

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        await axios.post(`${AUTH_API_URL}/password-reset/verify-totp`, {
          resetRequestId: lockoutChallengeId,
          totpCode: '000000',
        });
        throw new Error(`Expected invalid TOTP attempt ${attempt} to fail with 401.`);
      } catch (error) {
        if (error?.response?.status !== 401) throw error;
      }
    }

    try {
      await axios.post(`${AUTH_API_URL}/password-reset/verify-totp`, {
        resetRequestId: lockoutChallengeId,
        totpCode: '000000',
      });
      throw new Error('Expected lockout after max invalid TOTP attempts to fail with 429.');
    } catch (error) {
      if (error?.response?.status !== 429) throw error;
    }

    log('TEST 13: Reset request rate limiting returns 429 after quota', 'POST /api/auth/password-reset/request');
    const throttleIdentifier = `missing-rate-${suffix}`;
    const throttleIp = `auth-reset-throttle-${suffix}`;

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const okResponse = await axios.post(
        `${AUTH_API_URL}/password-reset/request`,
        { identifier: throttleIdentifier },
        { headers: { 'x-forwarded-for': throttleIp } }
      );

      if (okResponse.status !== 200 || okResponse.data?.success !== true) {
        throw new Error(`Expected throttle pre-limit request ${attempt} to return 200.`);
      }
    }

    try {
      await axios.post(
        `${AUTH_API_URL}/password-reset/request`,
        { identifier: throttleIdentifier },
        { headers: { 'x-forwarded-for': throttleIp } }
      );
      throw new Error('Expected throttled reset request to fail with 429.');
    } catch (error) {
      if (error?.response?.status !== 429) throw error;
      if (!Number.isInteger(Number(error?.response?.data?.retryAfterSeconds))) {
        throw new Error('Expected throttled response to include retryAfterSeconds.');
      }
    }

    console.log('\nAuth password policy + 2FA success tests completed successfully!');
  } catch (error) {
    console.error('\nAuth password policy + 2FA success tests failed.');
    if (error?.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error?.message ?? error);
    }
    process.exitCode = 1;
  } finally {
    await cleanupUsers(createdUserIds);
    await closePool();
    process.exit(process.exitCode ?? 0);
  }
}

runTests();
