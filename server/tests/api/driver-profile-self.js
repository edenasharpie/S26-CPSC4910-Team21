import axios from 'axios';
import jwt from 'jsonwebtoken';
import {
  BASE_URL,
  log,
  closePool,
  createTestUser,
  createTestDriverProfile,
} from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;
const SESSION_COOKIE_NAME = 'sessionId';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-fleetscore';

const createdUserIds = [];

function buildSessionCookie(userId, userType = 'driver') {
  const token = jwt.sign(
    {
      UserID: Number(userId),
      UserType: String(userType),
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  return `${SESSION_COOKIE_NAME}=${token}`;
}

async function cleanupUsers(userIds) {
  if (!userIds || userIds.length === 0) return;

  const connection = await pool.getConnection();
  try {
    for (const userId of userIds) {
      await connection.query('DELETE FROM EVENTS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM DRIVERS WHERE UserID = ?', [userId]);
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
    console.log('Starting driver self-profile API tests...\n');

    const driver = await createTestUser({ userType: 'driver' });
    const otherDriver = await createTestUser({ userType: 'driver' });
    createdUserIds.push(driver.userId, otherDriver.userId);

    await createTestDriverProfile({
      userId: driver.userId,
      licenseNumber: `DRV_SELF_${driver.userId}`,
      pointBalance: 250,
      performanceStatus: 'good',
    });

    await createTestDriverProfile({
      userId: otherDriver.userId,
      licenseNumber: `DRV_OTHER_${otherDriver.userId}`,
      pointBalance: 400,
      performanceStatus: 'average',
    });

    // Test 1: Driver can retrieve own profile from /api/user/profile/:id
    log('TEST 1: Driver self profile read succeeds', `GET /api/user/profile/${driver.userId}`);
    const profileRes = await axios.get(`${API_BASE_URL}/user/profile/${driver.userId}`, {
      headers: {
        Cookie: buildSessionCookie(driver.userId, 'driver'),
      },
    });

    if (
      profileRes.status !== 200 ||
      Number(profileRes.data?.UserID) !== Number(driver.userId) ||
      String(profileRes.data?.UserType).toLowerCase() !== 'driver' ||
      typeof profileRes.data?.LicenseNumber !== 'string'
    ) {
      throw new Error('Expected driver self profile GET to return requested driver profile');
    }

    if (Object.prototype.hasOwnProperty.call(profileRes.data, 'PassHash')) {
      throw new Error('Expected profile response to omit PassHash');
    }

    // Test 2: Driver can patch own profile through /api/user/profile/:id
    log('TEST 2: Driver self profile patch succeeds', `PATCH /api/user/profile/${driver.userId}`);
    const updatedFirst = 'DriverSelf';
    const updatedLast = 'Updated';
    const updatedEmail = `dp${Date.now()}@e.co`;
    const updatedPhone = '5552223333';
    const updatedBio = 'Updated by driver self-profile test';

    const patchRes = await axios.patch(
      `${API_BASE_URL}/user/profile/${driver.userId}`,
      {
        firstName: updatedFirst,
        lastName: updatedLast,
        email: updatedEmail,
        phone: updatedPhone,
        bio: updatedBio,
      },
      {
        headers: {
          Cookie: buildSessionCookie(driver.userId, 'driver'),
        },
      }
    );

    if (
      patchRes.status !== 200 ||
      Number(patchRes.data?.UserID) !== Number(driver.userId) ||
      patchRes.data?.FirstName !== updatedFirst ||
      patchRes.data?.LastName !== updatedLast ||
      patchRes.data?.Email !== updatedEmail ||
      patchRes.data?.Phone !== updatedPhone ||
      patchRes.data?.Bio !== updatedBio
    ) {
      throw new Error('Expected driver self profile PATCH to persist updated fields');
    }

    // Test 3: Session context mismatch blocks profile patch
    log(
      'TEST 3: Driver cannot patch profile for different session user context',
      `PATCH /api/user/profile/${driver.userId} with session for ${otherDriver.userId}`
    );

    try {
      await axios.patch(
        `${API_BASE_URL}/user/profile/${driver.userId}`,
        { firstName: 'ShouldFail' },
        {
          headers: {
            Cookie: buildSessionCookie(otherDriver.userId, 'driver'),
          },
        }
      );
      throw new Error('Expected 403 for mismatched session context on profile patch');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }

    console.log('\nDriver self-profile API tests completed successfully!');
  } catch (error) {
    console.error('\nDriver self-profile tests failed:');
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
