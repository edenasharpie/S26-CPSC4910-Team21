import axios from 'axios';
import {
  BASE_URL,
  log,
  createTestSponsor,
  cleanupSponsorCompanies,
  closePool,
  createTestUser,
  setUserActiveStatus,
  setUserPermissions,
  getEventsByUserId,
} from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;

const createdUserIds = [];
const createdSponsorIds = [];

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
  if (!userIds || userIds.length === 0) return;

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
    console.log('Starting admin assume endpoint tests...\n');

    const sponsorCompanyId = await createTestSponsor({
      companyName: `Assume Admin Sponsor ${Date.now()}`,
      pointDollarValue: 0.01,
    });
    createdSponsorIds.push(sponsorCompanyId);

    const admin = await createTestUser({ userType: 'admin' });
    const driver = await createTestUser({ userType: 'driver' });
    const sponsor = await createTestUser({ userType: 'sponsor' });

    createdUserIds.push(admin.userId, driver.userId, sponsor.userId);

    const connection = await pool.getConnection();
    try {
      await connection.query(
        `INSERT INTO DRIVERS (LicenseNumber, UserID, SponsorCompanyID, PointBalance, PerformanceStatus, AlertPoints, AlertOrders)
         VALUES (?, ?, ?, 0, 'good', 1, 1)`,
        [`ASSUME_DL_${driver.userId}`, driver.userId, sponsorCompanyId]
      );
    } finally {
      connection.release();
    }

    // Test 1: Admin assumes driver view
    log('TEST 1: Admin assume driver success', `POST /api/admin/assume-driver/${driver.userId}`);
    const assumeDriverRes = await axios.post(`${API_BASE_URL}/admin/assume-driver/${driver.userId}`, {
      requesterUserId: admin.userId,
    });
    if (assumeDriverRes.status !== 200 || assumeDriverRes.data?.assumedUser?.UserType !== 'driver') {
      throw new Error('Expected admin assume driver success with driver payload');
    }

    // Test 2: Admin assumes sponsor view
    log('TEST 2: Admin assume sponsor success', `POST /api/admin/assume-sponsor/${sponsor.userId}`);
    const assumeSponsorRes = await axios.post(`${API_BASE_URL}/admin/assume-sponsor/${sponsor.userId}`, {
      requesterUserId: admin.userId,
    });
    if (assumeSponsorRes.status !== 200 || assumeSponsorRes.data?.assumedUser?.UserType !== 'sponsor') {
      throw new Error('Expected admin assume sponsor success with sponsor payload');
    }

    // Test 3: Missing permission blocks assume-driver
    log('TEST 3: Missing assume permission returns 403', 'POST /api/admin/assume-driver/:targetUserId');
    await setUserPermissions(admin.userId, { canAssumeDriverView: false, canAssumeSponsorView: false });
    try {
      await axios.post(`${API_BASE_URL}/admin/assume-driver/${driver.userId}`, {
        requesterUserId: admin.userId,
      });
      throw new Error('Expected 403 for missing canAssumeDriverView permission');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }

    await setUserPermissions(admin.userId, {});

    // Test 4: Inactive admin cannot assume
    log('TEST 4: Inactive admin requester returns 403', 'POST /api/admin/assume-driver/:targetUserId');
    await setUserActiveStatus(admin.userId, 0);
    try {
      await axios.post(`${API_BASE_URL}/admin/assume-driver/${driver.userId}`, {
        requesterUserId: admin.userId,
      });
      throw new Error('Expected 403 for inactive admin requester');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }
    await setUserActiveStatus(admin.userId, 1);

    // Test 5: Non-admin requester rejected
    log('TEST 5: Non-admin requester returns 403', 'POST /api/admin/assume-driver/:targetUserId');
    try {
      await axios.post(`${API_BASE_URL}/admin/assume-driver/${driver.userId}`, {
        requesterUserId: sponsor.userId,
      });
      throw new Error('Expected 403 for non-admin requester');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }

    // Test 6: Missing target returns 404
    log('TEST 6: Missing target returns 404', 'POST /api/admin/assume-driver/:targetUserId');
    try {
      await axios.post(`${API_BASE_URL}/admin/assume-driver/99999999`, {
        requesterUserId: admin.userId,
      });
      throw new Error('Expected 404 for missing driver target');
    } catch (error) {
      if (!error.response || error.response.status !== 404) {
        throw error;
      }
    }

    // Test 7: Inactive target returns 409
    log('TEST 7: Inactive driver target returns 409', 'POST /api/admin/assume-driver/:targetUserId');
    await setUserActiveStatus(driver.userId, 0);
    try {
      await axios.post(`${API_BASE_URL}/admin/assume-driver/${driver.userId}`, {
        requesterUserId: admin.userId,
      });
      throw new Error('Expected 409 for inactive driver target');
    } catch (error) {
      if (!error.response || error.response.status !== 409) {
        throw error;
      }
    }
    await setUserActiveStatus(driver.userId, 1);

    // Test 8: Soft delete writes audit event
    log('TEST 8: Soft delete records AccountStatusChange event', `DELETE /api/admin/users/${driver.userId}`);
    const deleteRes = await axios.delete(`${API_BASE_URL}/admin/users/${driver.userId}`);
    if (deleteRes.status !== 204) {
      throw new Error('Expected 204 on soft delete');
    }

    const statusEvents = await getEventsByUserId(driver.userId, 'AccountStatusChange', 10);
    const matchingEvent = statusEvents.find((event) => {
      const properties = parseProperties(event.Properties);
      return properties?.adminNotes === 'admin_deactivate' && Number(properties?.targetUserId) === Number(driver.userId);
    });

    if (!matchingEvent) {
      throw new Error('Expected AccountStatusChange audit event for admin_deactivate');
    }

    console.log('\nAdmin assume endpoint tests completed successfully!');
  } catch (error) {
    console.error('\nAdmin assume tests failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    await cleanupUsers(createdUserIds);
    await cleanupSponsorCompanies(createdSponsorIds);
    await closePool();
  }
}

runTests();
