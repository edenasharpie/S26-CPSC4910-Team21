import axios from 'axios';
import jwt from 'jsonwebtoken';
import {
  BASE_URL,
  closePool,
  createTestDriverProfile,
  createTestUser,
  log,
} from '../setup.js';
import { pool } from '../../src/db.js';
import { serializeProperties } from '../../src/services/notification-service.js';

const API_BASE_URL = `${BASE_URL}/api`;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-fleetscore';

const createdUserIds = [];

function buildSessionCookie(user) {
  const payload = {
    UserID: user.userId,
    UserType: user.userType,
    Username: user.username,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: 60 * 60 * 24 });
  return `sessionId=${token}`;
}

async function seedNotification(userId, content, category, options = {}) {
  const connection = await pool.getConnection();
  try {
    const baseProperties = JSON.parse(serializeProperties(content, category, options.actorUserId ?? null, options.metadata ?? {}));
    if (options.readAt) {
      baseProperties.readAt = options.readAt;
      baseProperties.readByAction = options.readByAction ?? 'single';
    }

    const [result] = await connection.query(
      `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
       VALUES (?, NOW(), 'Notification', ?)`,
      [userId, JSON.stringify(baseProperties)]
    );

    return Number(result.insertId);
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
  try {
    console.log('Starting driver notifications API tests...\n');

    const driverUser = await createTestUser({ userType: 'driver' });
    const otherDriverUser = await createTestUser({ userType: 'driver' });
    createdUserIds.push(driverUser.userId, otherDriverUser.userId);

    await createTestDriverProfile({
      userId: driverUser.userId,
      sponsorCompanyId: null,
      licenseNumber: `NOTIF_DRV_${driverUser.userId}`,
      pointBalance: 100,
    });

    const sessionCookie = buildSessionCookie({ ...driverUser, userType: 'driver' });
    const mismatchCookie = buildSessionCookie({ ...otherDriverUser, userType: 'driver' });

    axios.defaults.headers.Cookie = sessionCookie;

    const unreadOneId = await seedNotification(
      driverUser.userId,
      'Points were added to your account.',
      'driver_point_transaction'
    );

    await seedNotification(
      driverUser.userId,
      'Your order status changed.',
      'driver_order_status_changed',
      { readAt: '2026-04-15 12:00:00', readByAction: 'single' }
    );

    await seedNotification(
      driverUser.userId,
      'Sponsor updated your order.',
      'driver_order_changed_by_sponsor'
    );

    log('TEST 1: List driver notifications', `GET /api/drivers/${driverUser.userId}/notifications`);
    const listRes = await axios.get(`${API_BASE_URL}/drivers/${driverUser.userId}/notifications`, {
      params: { limit: 10, offset: 0 },
    });

    if (listRes.status !== 200) {
      throw new Error('Expected driver notifications list to return 200');
    }

    if (!Array.isArray(listRes.data.notifications) || listRes.data.notifications.length !== 3) {
      throw new Error('Expected exactly three notifications in driver list response');
    }

    if (Number(listRes.data.unreadCount) !== 2) {
      throw new Error(`Expected unreadCount 2, got ${listRes.data.unreadCount}`);
    }

    log('TEST 2: unreadOnly filter', `GET /api/drivers/${driverUser.userId}/notifications?unreadOnly=true`);
    const unreadRes = await axios.get(`${API_BASE_URL}/drivers/${driverUser.userId}/notifications`, {
      params: { unreadOnly: true },
    });

    if (!Array.isArray(unreadRes.data.notifications) || unreadRes.data.notifications.length !== 2) {
      throw new Error('Expected unreadOnly list to return two notifications');
    }

    log('TEST 3: category filter', `GET /api/drivers/${driverUser.userId}/notifications?category=driver_order_changed_by_sponsor`);
    const categoryRes = await axios.get(`${API_BASE_URL}/drivers/${driverUser.userId}/notifications`, {
      params: { category: 'driver_order_changed_by_sponsor' },
    });

    if (categoryRes.data.notifications.length !== 1) {
      throw new Error('Expected category filter to return one notification');
    }

    log('TEST 4: mark single as read', `PATCH /api/drivers/${driverUser.userId}/notifications/${unreadOneId}/read`);
    const markOneRes = await axios.patch(`${API_BASE_URL}/drivers/${driverUser.userId}/notifications/${unreadOneId}/read`);

    if (markOneRes.status !== 200 || markOneRes.data.success !== true) {
      throw new Error('Expected mark single read to succeed');
    }

    const postSingleRes = await axios.get(`${API_BASE_URL}/drivers/${driverUser.userId}/notifications`);
    if (Number(postSingleRes.data.unreadCount) !== 1) {
      throw new Error(`Expected unreadCount 1 after mark single, got ${postSingleRes.data.unreadCount}`);
    }

    log('TEST 5: mark all as read', `PATCH /api/drivers/${driverUser.userId}/notifications/read-all`);
    const markAllRes = await axios.patch(`${API_BASE_URL}/drivers/${driverUser.userId}/notifications/read-all`);

    if (markAllRes.status !== 200 || markAllRes.data.success !== true) {
      throw new Error('Expected mark all read to succeed');
    }

    const postAllRes = await axios.get(`${API_BASE_URL}/drivers/${driverUser.userId}/notifications`);
    if (Number(postAllRes.data.unreadCount) !== 0) {
      throw new Error(`Expected unreadCount 0 after mark all, got ${postAllRes.data.unreadCount}`);
    }

    const clearCategory = 'driver_clear_validation';
    const clearUnreadId = await seedNotification(
      driverUser.userId,
      'Clear target unread notification',
      clearCategory
    );

    await seedNotification(
      driverUser.userId,
      'Clear target already read notification',
      clearCategory,
      { readAt: '2026-04-16 09:00:00', readByAction: 'single' }
    );

    log('TEST 6: clear single notification', `DELETE /api/drivers/${driverUser.userId}/notifications/${clearUnreadId}`);
    const clearOneRes = await axios.delete(`${API_BASE_URL}/drivers/${driverUser.userId}/notifications/${clearUnreadId}`);

    if (clearOneRes.status !== 200 || clearOneRes.data.success !== true || clearOneRes.data.cleared !== true) {
      throw new Error('Expected clear single notification to succeed');
    }

    const postClearSingleRes = await axios.get(`${API_BASE_URL}/drivers/${driverUser.userId}/notifications`, {
      params: { category: clearCategory },
    });
    if (postClearSingleRes.data.notifications.length !== 1) {
      throw new Error('Expected one notification to remain in clear validation category after single clear');
    }
    if (Number(postClearSingleRes.data.unreadCount) !== 0) {
      throw new Error(`Expected unreadCount 0 after single clear in category, got ${postClearSingleRes.data.unreadCount}`);
    }

    log('TEST 7: clear all notifications by category', `DELETE /api/drivers/${driverUser.userId}/notifications/clear-all?category=${clearCategory}`);
    const clearAllRes = await axios.delete(`${API_BASE_URL}/drivers/${driverUser.userId}/notifications/clear-all`, {
      params: { category: clearCategory },
    });

    if (clearAllRes.status !== 200 || clearAllRes.data.success !== true || Number(clearAllRes.data.clearedCount) !== 1) {
      throw new Error('Expected clear-all by category to clear one remaining notification');
    }

    const postClearAllRes = await axios.get(`${API_BASE_URL}/drivers/${driverUser.userId}/notifications`, {
      params: { category: clearCategory },
    });
    if (postClearAllRes.data.notifications.length !== 0) {
      throw new Error('Expected no notifications in clear validation category after clear-all');
    }

    log('TEST 8: clear missing notification should 404', `DELETE /api/drivers/${driverUser.userId}/notifications/999999999`);
    try {
      await axios.delete(`${API_BASE_URL}/drivers/${driverUser.userId}/notifications/999999999`);
      throw new Error('Expected clear missing notification request to fail with 404');
    } catch (error) {
      if (error?.response?.status !== 404) {
        throw error;
      }
    }

    log('TEST 9: mismatched session should be rejected', `GET /api/drivers/${driverUser.userId}/notifications`);
    try {
      await axios.get(`${API_BASE_URL}/drivers/${driverUser.userId}/notifications`, {
        headers: { Cookie: mismatchCookie },
      });
      throw new Error('Expected mismatched session request to fail with 403');
    } catch (error) {
      if (error?.response?.status !== 403) {
        throw error;
      }
    }

    console.log('\nDriver notifications API tests completed successfully!');
  } catch (error) {
    console.error('\nDriver notifications API tests failed:');
    if (error?.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error?.message ?? error);
    }
    process.exitCode = 1;
  } finally {
    delete axios.defaults.headers.Cookie;
    await cleanupUsers(createdUserIds);
    await closePool();
    process.exit(process.exitCode ?? 0);
  }
}

runTests();
