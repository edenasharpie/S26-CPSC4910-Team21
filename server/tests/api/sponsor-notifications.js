import axios from 'axios';
import jwt from 'jsonwebtoken';
import {
  BASE_URL,
  closePool,
  createTestSponsor,
  createTestSponsorProfile,
  createTestUser,
  cleanupSponsorCompanies,
  log,
} from '../setup.js';
import { pool } from '../../src/db.js';
import { serializeProperties } from '../../src/services/notification-service.js';

const API_BASE_URL = `${BASE_URL}/api`;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-fleetscore';

const createdUserIds = [];
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
    console.log('Starting sponsor notifications API tests...\n');

    const sponsorCompanyId = await createTestSponsor({ companyName: `Notif Co ${Date.now()}` });
    createdSponsorCompanyIds.push(sponsorCompanyId);

    const sponsorUser = await createTestUser({ userType: 'sponsor' });
    const otherSponsorUser = await createTestUser({ userType: 'sponsor' });
    createdUserIds.push(sponsorUser.userId, otherSponsorUser.userId);

    await createTestSponsorProfile({ userId: sponsorUser.userId, sponsorCompanyId });

    const sessionCookie = buildSessionCookie({ ...sponsorUser, userType: 'sponsor' });
    const mismatchCookie = buildSessionCookie({ ...otherSponsorUser, userType: 'sponsor' });

    axios.defaults.headers.Cookie = sessionCookie;

    const unreadOneId = await seedNotification(
      sponsorUser.userId,
      'A driver left your company.',
      'driver_left_company'
    );

    await seedNotification(
      sponsorUser.userId,
      'A point transaction was updated.',
      'sponsor_point_transaction_update',
      { readAt: '2026-04-15 12:00:00', readByAction: 'single' }
    );

    await seedNotification(
      sponsorUser.userId,
      'A driver application was submitted.',
      'driver_application_submitted'
    );

    log('TEST 1: List sponsor notifications', `GET /api/sponsors/${sponsorUser.userId}/notifications`);
    const listRes = await axios.get(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/notifications`, {
      params: { limit: 10, offset: 0 },
    });

    if (listRes.status !== 200) {
      throw new Error('Expected sponsor notifications list to return 200');
    }

    if (!Array.isArray(listRes.data.notifications) || listRes.data.notifications.length !== 3) {
      throw new Error('Expected exactly three notifications in sponsor list response');
    }

    if (Number(listRes.data.unreadCount) !== 2) {
      throw new Error(`Expected unreadCount 2, got ${listRes.data.unreadCount}`);
    }

    log('TEST 2: unreadOnly filter', `GET /api/sponsors/${sponsorUser.userId}/notifications?unreadOnly=true`);
    const unreadRes = await axios.get(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/notifications`, {
      params: { unreadOnly: true },
    });

    if (!Array.isArray(unreadRes.data.notifications) || unreadRes.data.notifications.length !== 2) {
      throw new Error('Expected unreadOnly sponsor list to return two notifications');
    }

    log('TEST 3: category filter', `GET /api/sponsors/${sponsorUser.userId}/notifications?category=driver_application_submitted`);
    const categoryRes = await axios.get(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/notifications`, {
      params: { category: 'driver_application_submitted' },
    });

    if (categoryRes.data.notifications.length !== 1) {
      throw new Error('Expected sponsor category filter to return one notification');
    }

    log('TEST 4: mark single as read', `PATCH /api/sponsors/${sponsorUser.userId}/notifications/${unreadOneId}/read`);
    const markOneRes = await axios.patch(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/notifications/${unreadOneId}/read`);

    if (markOneRes.status !== 200 || markOneRes.data.success !== true) {
      throw new Error('Expected sponsor mark single read to succeed');
    }

    const postSingleRes = await axios.get(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/notifications`);
    if (Number(postSingleRes.data.unreadCount) !== 1) {
      throw new Error(`Expected unreadCount 1 after sponsor mark single, got ${postSingleRes.data.unreadCount}`);
    }

    log('TEST 5: mark all as read', `PATCH /api/sponsors/${sponsorUser.userId}/notifications/read-all`);
    const markAllRes = await axios.patch(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/notifications/read-all`);

    if (markAllRes.status !== 200 || markAllRes.data.success !== true) {
      throw new Error('Expected sponsor mark all read to succeed');
    }

    const postAllRes = await axios.get(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/notifications`);
    if (Number(postAllRes.data.unreadCount) !== 0) {
      throw new Error(`Expected unreadCount 0 after sponsor mark all, got ${postAllRes.data.unreadCount}`);
    }

    const clearCategory = 'sponsor_clear_validation';
    const clearUnreadId = await seedNotification(
      sponsorUser.userId,
      'Sponsor clear target unread notification',
      clearCategory
    );

    await seedNotification(
      sponsorUser.userId,
      'Sponsor clear target already read notification',
      clearCategory,
      { readAt: '2026-04-16 10:00:00', readByAction: 'single' }
    );

    log('TEST 6: clear single notification', `DELETE /api/sponsors/${sponsorUser.userId}/notifications/${clearUnreadId}`);
    const clearOneRes = await axios.delete(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/notifications/${clearUnreadId}`);

    if (clearOneRes.status !== 200 || clearOneRes.data.success !== true || clearOneRes.data.cleared !== true) {
      throw new Error('Expected sponsor clear single notification to succeed');
    }

    const postClearSingleRes = await axios.get(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/notifications`, {
      params: { category: clearCategory },
    });
    if (postClearSingleRes.data.notifications.length !== 1) {
      throw new Error('Expected one sponsor notification to remain in clear validation category after single clear');
    }
    if (Number(postClearSingleRes.data.unreadCount) !== 0) {
      throw new Error(`Expected sponsor unreadCount 0 after single clear in category, got ${postClearSingleRes.data.unreadCount}`);
    }

    log('TEST 7: clear all notifications by category', `DELETE /api/sponsors/${sponsorUser.userId}/notifications/clear-all?category=${clearCategory}`);
    const clearAllRes = await axios.delete(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/notifications/clear-all`, {
      params: { category: clearCategory },
    });

    if (clearAllRes.status !== 200 || clearAllRes.data.success !== true || Number(clearAllRes.data.clearedCount) !== 1) {
      throw new Error('Expected sponsor clear-all by category to clear one remaining notification');
    }

    const postClearAllRes = await axios.get(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/notifications`, {
      params: { category: clearCategory },
    });
    if (postClearAllRes.data.notifications.length !== 0) {
      throw new Error('Expected no sponsor notifications in clear validation category after clear-all');
    }

    log('TEST 8: clear missing notification should 404', `DELETE /api/sponsors/${sponsorUser.userId}/notifications/999999999`);
    try {
      await axios.delete(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/notifications/999999999`);
      throw new Error('Expected sponsor clear missing notification request to fail with 404');
    } catch (error) {
      if (error?.response?.status !== 404) {
        throw error;
      }
    }

    log('TEST 9: mismatched session should be rejected', `GET /api/sponsors/${sponsorUser.userId}/notifications`);
    try {
      await axios.get(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/notifications`, {
        headers: { Cookie: mismatchCookie },
      });
      throw new Error('Expected mismatched sponsor session request to fail with 403');
    } catch (error) {
      if (error?.response?.status !== 403) {
        throw error;
      }
    }

    console.log('\nSponsor notifications API tests completed successfully!');
  } catch (error) {
    console.error('\nSponsor notifications API tests failed:');
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
    await cleanupSponsorCompanies(createdSponsorCompanyIds);
    await closePool();
    process.exit(process.exitCode ?? 0);
  }
}

runTests();
