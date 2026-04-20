import axios from 'axios';
import {
  BASE_URL,
  log,
  closePool,
  createTestUser,
} from '../setup.js';
import { hashPassword } from '../../src/utils/auth.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;
const createdUserIds = [];

async function cleanupUsers(userIds) {
  if (!userIds || userIds.length === 0) return;

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
      console.log(`Deleted user ${userId}`);
    }
  } catch (error) {
    console.error('Error cleaning up users:', error.message);
  } finally {
    connection.release();
  }
}

async function getActiveStatus(userId) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      'SELECT ActiveStatus FROM USERS WHERE UserID = ? LIMIT 1',
      [userId]
    );
    return rows[0]?.ActiveStatus;
  } finally {
    connection.release();
  }
}

async function runTests() {
  try {
    console.log('Starting user deactivate endpoint tests...\n');

    const knownPassword = 'Aa!12345678';
    const knownHash = await hashPassword(knownPassword);

    const driver = await createTestUser({ userType: 'driver', passHash: knownHash });
    const sponsor = await createTestUser({ userType: 'sponsor', passHash: knownHash });
    const admin = await createTestUser({ userType: 'admin', passHash: knownHash });
    const invalidPasswordUser = await createTestUser({ userType: 'driver', passHash: knownHash });

    createdUserIds.push(driver.userId, sponsor.userId, admin.userId, invalidPasswordUser.userId);

    // Test 1: Driver self-deactivate success
    log('TEST 1: Driver self-deactivate succeeds', `POST /api/user/deactivate (${driver.userId})`);
    const driverRes = await axios.post(`${API_BASE_URL}/user/deactivate`, {
      userId: driver.userId,
      currentPassword: knownPassword,
    });
    if (!driverRes.data?.success) {
      throw new Error('Expected driver deactivation success response');
    }

    // Test 2: Sponsor self-deactivate success
    log('TEST 2: Sponsor self-deactivate succeeds', `POST /api/user/deactivate (${sponsor.userId})`);
    const sponsorRes = await axios.post(`${API_BASE_URL}/user/deactivate`, {
      userId: sponsor.userId,
      currentPassword: knownPassword,
    });
    if (!sponsorRes.data?.success) {
      throw new Error('Expected sponsor deactivation success response');
    }

    // Test 3: Admin self-deactivate success
    log('TEST 3: Admin self-deactivate succeeds', `POST /api/user/deactivate (${admin.userId})`);
    const adminRes = await axios.post(`${API_BASE_URL}/user/deactivate`, {
      userId: admin.userId,
      currentPassword: knownPassword,
    });
    if (!adminRes.data?.success) {
      throw new Error('Expected admin deactivation success response');
    }

    const driverStatus = await getActiveStatus(driver.userId);
    const sponsorStatus = await getActiveStatus(sponsor.userId);
    const adminStatus = await getActiveStatus(admin.userId);
    if (driverStatus !== 0 || sponsorStatus !== 0 || adminStatus !== 0) {
      throw new Error('Expected all deactivated users to have ActiveStatus = 0');
    }

    // Test 4: Invalid password returns 401
    log('TEST 4: Invalid password returns 401', `POST /api/user/deactivate (${invalidPasswordUser.userId})`);
    try {
      await axios.post(`${API_BASE_URL}/user/deactivate`, {
        userId: invalidPasswordUser.userId,
        currentPassword: 'wrong-password',
      });
      throw new Error('Expected 401 for invalid password');
    } catch (error) {
      if (!error.response || error.response.status !== 401) {
        throw error;
      }
    }

    // Test 5: Already inactive account returns 409
    log('TEST 5: Already inactive account returns 409', `POST /api/user/deactivate (${driver.userId})`);
    try {
      await axios.post(`${API_BASE_URL}/user/deactivate`, {
        userId: driver.userId,
        currentPassword: knownPassword,
      });
      throw new Error('Expected 409 for already inactive account');
    } catch (error) {
      if (!error.response || error.response.status !== 409) {
        throw error;
      }
    }

    console.log('\nUser deactivate endpoint tests completed successfully!');
  } catch (error) {
    console.error('\nUser deactivate endpoint tests failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    await cleanupUsers(createdUserIds);
    await closePool();
  }
}

runTests();
