import axios from 'axios';
import {
  BASE_URL,
  log,
  createTestUser,
  getEventsByUserId,
  closePool,
} from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;
const createdUserIds = [];

function parseProperties(rawProperties) {
  if (!rawProperties) return {};
  if (typeof rawProperties === 'object') return rawProperties;

  try {
    return JSON.parse(rawProperties);
  } catch {
    return {};
  }
}

async function cleanupUsers(userIds) {
  if (!userIds || userIds.length === 0) {
    return;
  }

  const connection = await pool.getConnection();
  try {
    for (const userId of userIds) {
      await connection.query('DELETE FROM EVENTS WHERE UserID = ?', [userId]);
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

async function runTests() {
  try {
    console.log('Starting assumption-exit endpoint tests...\n');

    const uniqueSuffix = `${Date.now().toString().slice(-7)}${Math.random()
      .toString(36)
      .slice(2, 5)}`;

    const originalUser = await createTestUser({
      userType: 'admin',
      username: `orig_${uniqueSuffix}`,
      email: `orig_${uniqueSuffix}@example.com`,
    });

    const actingUser = await createTestUser({
      userType: 'driver',
      username: `act_${uniqueSuffix}`,
      email: `act_${uniqueSuffix}@example.com`,
    });

    createdUserIds.push(originalUser.userId, actingUser.userId);

    // Test 1: Missing required IDs returns 400.
    log('TEST 1: Missing IDs return 400', 'POST /api/auth/assumption-exit');
    try {
      await axios.post(`${API_BASE_URL}/auth/assumption-exit`, {});
      throw new Error('Expected 400 for missing actingUserId and originalUserId');
    } catch (error) {
      if (!error.response || error.response.status !== 400) {
        throw error;
      }
    }

    // Test 2: Non-integer IDs return 400.
    log('TEST 2: Non-integer IDs return 400', 'POST /api/auth/assumption-exit');
    try {
      await axios.post(`${API_BASE_URL}/auth/assumption-exit`, {
        actingUserId: 'not-a-number',
        originalUserId: null,
      });
      throw new Error('Expected 400 for invalid actingUserId and originalUserId');
    } catch (error) {
      if (!error.response || error.response.status !== 400) {
        throw error;
      }
    }

    // Test 3: Valid payload logs AccountUpdate event and returns success.
    log('TEST 3: Valid IDs return 200 and log assumedView:exit', 'POST /api/auth/assumption-exit');
    const exitRes = await axios.post(`${API_BASE_URL}/auth/assumption-exit`, {
      actingUserId: actingUser.userId,
      originalUserId: originalUser.userId,
    });

    if (exitRes.status !== 200 || exitRes.data?.success !== true) {
      throw new Error('Expected 200 success response for valid assumption exit payload');
    }

    const updateEvents = await getEventsByUserId(originalUser.userId, 'AccountUpdate', 20);
    const matchingExitEvent = updateEvents.find((event) => {
      const properties = parseProperties(event.Properties);
      const updatedFields = Array.isArray(properties.updatedFields)
        ? properties.updatedFields
        : [];

      return updatedFields.includes('assumedView:exit') && properties.success === true;
    });

    if (!matchingExitEvent) {
      throw new Error('Expected AccountUpdate event with updatedFields containing assumedView:exit');
    }

    console.log('\nAssumption-exit endpoint tests completed successfully!');
  } catch (error) {
    console.error('\nAssumption-exit endpoint tests failed:');
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
