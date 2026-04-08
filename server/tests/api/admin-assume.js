import axios from 'axios';
import {
  BASE_URL,
  log,
  createTestSponsor,
  cleanupSponsorCompanies,
  closePool,
  createTestUser,
  createTestDriverProfile,
  createTestSponsorProfile,
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
    const sponsorWithoutProfile = await createTestUser({ userType: 'sponsor' });

    createdUserIds.push(admin.userId, driver.userId, sponsor.userId, sponsorWithoutProfile.userId);

    await createTestSponsorProfile({
      userId: sponsor.userId,
      sponsorCompanyId,
    });

    await createTestDriverProfile({
      userId: driver.userId,
      sponsorCompanyId,
      licenseNumber: `ASSUME_DL_${driver.userId}`,
      pointBalance: 0,
    });

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

    // Test 3: Admin-assumed sponsor can load downstream sponsor data used by dashboard/invoices/profile pages
    log('TEST 3: Assumed sponsor downstream data loads', 'GET /api/sponsors/user/:userId, /:userId/my-drivers, /point-transactions, /api/user/profile/:id');
    const assumedSponsorUserId = assumeSponsorRes.data.assumedUser.UserID;
    const sponsorContextRes = await axios.get(`${API_BASE_URL}/sponsors/user/${assumedSponsorUserId}`);
    if (sponsorContextRes.status !== 200 || !sponsorContextRes.data?.sponsorCompanyId) {
      throw new Error('Expected sponsor context with sponsorCompanyId for assumed sponsor');
    }

    const driversRes = await axios.get(`${API_BASE_URL}/sponsors/${assumedSponsorUserId}/my-drivers`);
    if (driversRes.status !== 200 || !Array.isArray(driversRes.data)) {
      throw new Error('Expected sponsor driver list for assumed sponsor');
    }

    const invoicesRes = await axios.get(`${API_BASE_URL}/sponsors/${assumedSponsorUserId}/point-transactions`);
    if (invoicesRes.status !== 200 || !Array.isArray(invoicesRes.data)) {
      throw new Error('Expected sponsor point-transactions list for assumed sponsor invoices');
    }

    const profileRes = await axios.get(`${API_BASE_URL}/user/profile/${assumedSponsorUserId}`);
    if (profileRes.status !== 200 || Number(profileRes.data?.UserID) !== Number(assumedSponsorUserId)) {
      throw new Error('Expected assumed sponsor profile data to load');
    }

    // Test 3b: Assumed sponsor can mutate sponsor-owned driver profile fields
    log('TEST 3b: Assumed sponsor can update driver profile', 'PATCH /api/sponsors/:userId/drivers/:driverId');
    const sponsorPatchRes = await axios.patch(
      `${API_BASE_URL}/sponsors/${assumedSponsorUserId}/drivers/${driver.userId}`,
      {
        firstName: 'AssumedSponsor',
        lastName: 'DriverEdit',
        email: `assumed-sponsor-driver-${Date.now()}@example.com`,
        phone: '5551002000',
      }
    );

    if (
      sponsorPatchRes.status !== 200 ||
      sponsorPatchRes.data?.FirstName !== 'AssumedSponsor' ||
      sponsorPatchRes.data?.LastName !== 'DriverEdit'
    ) {
      throw new Error('Expected assumed sponsor to update sponsor-owned driver profile fields');
    }

    // Test 3c: Assumed driver can mutate own profile fields
    log('TEST 3c: Assumed driver can update own profile', 'PATCH /api/user/profile/:id');
    const assumedDriverUserId = assumeDriverRes.data.assumedUser.UserID;
    const driverPatchRes = await axios.patch(
      `${API_BASE_URL}/user/profile/${assumedDriverUserId}`,
      {
        firstName: 'AssumedDriver',
        lastName: 'ProfileEdit',
        email: `assumed-driver-${Date.now()}@example.com`,
        phone: '5553004000',
      }
    );

    if (
      driverPatchRes.status !== 200 ||
      driverPatchRes.data?.FirstName !== 'AssumedDriver' ||
      driverPatchRes.data?.LastName !== 'ProfileEdit'
    ) {
      throw new Error('Expected assumed driver to update own profile fields');
    }

    // Test 3d: Assumed sponsor can mutate own profile fields
    log('TEST 3d: Assumed sponsor can update own profile', 'PATCH /api/user/profile/:id');
    const sponsorSelfPatchRes = await axios.patch(
      `${API_BASE_URL}/user/profile/${assumedSponsorUserId}`,
      {
        firstName: 'AssumedSponsor',
        lastName: 'ProfileEdit',
        email: `assumed-sponsor-self-${Date.now()}@example.com`,
        phone: '5557008000',
      }
    );

    if (
      sponsorSelfPatchRes.status !== 200 ||
      sponsorSelfPatchRes.data?.FirstName !== 'AssumedSponsor' ||
      sponsorSelfPatchRes.data?.LastName !== 'ProfileEdit'
    ) {
      throw new Error('Expected assumed sponsor to update own profile fields');
    }

    // Test 4: Missing sponsor profile linkage blocks assume-sponsor
    log('TEST 4: Missing sponsor profile linkage returns 409', 'POST /api/admin/assume-sponsor/:targetUserId');
    try {
      await axios.post(`${API_BASE_URL}/admin/assume-sponsor/${sponsorWithoutProfile.userId}`, {
        requesterUserId: admin.userId,
      });
      throw new Error('Expected 409 for sponsor target missing sponsor-company linkage');
    } catch (error) {
      if (!error.response || error.response.status !== 409) {
        throw error;
      }
    }

    // Test 5: Missing permission blocks assume-driver
    log('TEST 5: Missing assume permission returns 403', 'POST /api/admin/assume-driver/:targetUserId');
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

    // Test 6: Inactive admin cannot assume
    log('TEST 6: Inactive admin requester returns 403', 'POST /api/admin/assume-driver/:targetUserId');
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

    // Test 7: Non-admin requester rejected
    log('TEST 7: Non-admin requester returns 403', 'POST /api/admin/assume-driver/:targetUserId');
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

    // Test 8: Missing target returns 404
    log('TEST 8: Missing target returns 404', 'POST /api/admin/assume-driver/:targetUserId');
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

    // Test 9: Inactive target returns 409
    log('TEST 9: Inactive driver target returns 409', 'POST /api/admin/assume-driver/:targetUserId');
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

    // Test 10: Soft delete writes audit event
    log('TEST 10: Soft delete records AccountStatusChange event', `DELETE /api/admin/users/${driver.userId}`);
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
