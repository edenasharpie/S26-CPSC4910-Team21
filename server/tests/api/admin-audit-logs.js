import axios from 'axios';
import { BASE_URL, log, createTestUser, closePool } from '../setup.js';
import { pool } from '../../src/db.js';

const API_URL = `${BASE_URL}/api/admin/audit-logs`;

const createdUserIds = [];

async function cleanupUsers(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;

  const connection = await pool.getConnection();
  try {
    for (const userId of userIds) {
      await connection.query('DELETE FROM EVENTS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM ADMINS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM SPONSORS WHERE UserID = ?', [userId]);
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
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [userId]);
    }
  } finally {
    connection.release();
  }
}

async function runTests() {
  try {
    console.log('Starting admin audit log endpoint tests...\n');

    const suffix = String(Date.now()).slice(-6);
    const auditUser = await createTestUser({
      userType: 'admin',
      username: `au${suffix}`,
      email: `au${suffix}@e.co`,
      firstName: 'Audit',
      lastName: 'User',
    });
    createdUserIds.push(auditUser.userId);

    await pool.query(
      `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
       VALUES (?, NOW(), 'Notification', JSON_OBJECT('content', 'audit_logs_test_seed'))`,
      [auditUser.userId]
    );

    log('TEST 1: Fetching unfiltered audit logs...', `GET ${API_URL}`);
    const allLogsResponse = await axios.get(API_URL);
    if (allLogsResponse.status !== 200 || !Array.isArray(allLogsResponse.data)) {
      throw new Error('Expected unfiltered audit log response to be a 200 array.');
    }

    log('TEST 2: Filtering logs by event type and target user...', `${API_URL}?filter=Notification&targetUserId=${auditUser.userId}`);
    const filteredResponse = await axios.get(API_URL, {
      params: {
        filter: 'Notification',
        targetUserId: auditUser.userId,
      },
    });

    if (!Array.isArray(filteredResponse.data)) {
      throw new Error('Expected filtered audit response to be an array.');
    }

    const hasSeedEvent = filteredResponse.data.some((row) => (
      Number(row.UserID) === Number(auditUser.userId) &&
      String(row.EventType) === 'Notification'
    ));

    if (!hasSeedEvent) {
      throw new Error('Expected filtered audit logs to include seeded Notification event.');
    }

    log('TEST 3: Invalid filter value should return 400...', `${API_URL}?filter=NotARealEventType`);
    try {
      await axios.get(API_URL, { params: { filter: 'NotARealEventType' } });
      throw new Error('Expected invalid filter request to fail with 400.');
    } catch (error) {
      if (error?.response?.status !== 400) {
        throw error;
      }
    }

    log('TEST 4: Invalid targetUserId should return 400...', `${API_URL}?targetUserId=abc`);
    try {
      await axios.get(API_URL, { params: { targetUserId: 'abc' } });
      throw new Error('Expected invalid targetUserId request to fail with 400.');
    } catch (error) {
      if (error?.response?.status !== 400) {
        throw error;
      }
    }

    console.log('\nAll admin audit log endpoint tests passed successfully.');
  } catch (error) {
    console.error('\nAdmin audit log endpoint tests failed.');
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
