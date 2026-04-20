import axios from 'axios';
import {
  BASE_URL,
  closePool,
  createTestDriverProfile,
  createTestSponsor,
  createTestSponsorProfile,
  createTestUser,
  cleanupSponsorCompanies,
  getEventsByUserId,
  log,
  setUserActiveStatus,
  setUserPermissions,
} from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;

const createdUserIds = [];
const createdSponsorCompanyIds = [];

function parseEventProperties(rawProperties) {
  if (!rawProperties) return {};
  if (typeof rawProperties === 'object') return rawProperties;
  try {
    return JSON.parse(rawProperties);
  } catch {
    return {};
  }
}

function countNotificationsByTrigger(events, { category, trigger, driverUserId = null }) {
  return events.filter((event) => {
    const properties = parseEventProperties(event.Properties);
    const hasCategoryAndTrigger = properties.category === category && properties.trigger === trigger;
    if (!hasCategoryAndTrigger) {
      return false;
    }

    if (driverUserId === null) {
      return true;
    }

    return Number(properties.driverUserId) === Number(driverUserId);
  }).length;
}

async function getDriverSponsorCompanyId(driverUserId) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      'SELECT SponsorCompanyID FROM DRIVERS WHERE UserID = ? LIMIT 1',
      [driverUserId]
    );
    return rows[0]?.SponsorCompanyID ?? null;
  } finally {
    connection.release();
  }
}

async function getDriverEnrollmentStatus(driverUserId, sponsorCompanyId) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT e.EnrollmentStatus
       FROM DRIVERS d
       JOIN DRIVER_COMPANY_ENROLLMENT e ON e.DriverID = d.LicenseNumber
       WHERE d.UserID = ? AND e.SponsorCompanyID = ?
       LIMIT 1`,
      [driverUserId, sponsorCompanyId]
    );
    return rows[0]?.EnrollmentStatus ?? null;
  } finally {
    connection.release();
  }
}

async function setDriverEnrollmentActive(driverUserId, sponsorCompanyId, pointBalance = 0) {
  const connection = await pool.getConnection();
  try {
    const [driverRows] = await connection.query(
      'SELECT LicenseNumber FROM DRIVERS WHERE UserID = ? LIMIT 1',
      [driverUserId]
    );
    const licenseNumber = driverRows[0]?.LicenseNumber;
    if (!licenseNumber) return;

    const [updateResult] = await connection.query(
      `UPDATE DRIVER_COMPANY_ENROLLMENT
       SET EnrollmentStatus = 'active', LeftAt = NULL, PointBalance = ?
       WHERE DriverID = ? AND SponsorCompanyID = ?`,
      [pointBalance, licenseNumber, sponsorCompanyId]
    );

    if (Number(updateResult?.affectedRows ?? 0) === 0) {
      await connection.query(
        `INSERT INTO DRIVER_COMPANY_ENROLLMENT
          (DriverID, SponsorCompanyID, PointBalance, EnrollmentStatus, JoinedAt, LeftAt)
         VALUES (?, ?, ?, 'active', NOW(), NULL)`,
        [licenseNumber, sponsorCompanyId, pointBalance]
      );
    }
  } finally {
    connection.release();
  }
}

async function setDriverSponsorCompanyId(driverUserId, sponsorCompanyId) {
  const connection = await pool.getConnection();
  try {
    await connection.query('UPDATE DRIVERS SET SponsorCompanyID = ? WHERE UserID = ?', [sponsorCompanyId, driverUserId]);
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
  } catch (error) {
    console.error('Cleanup users error:', error.message);
  } finally {
    connection.release();
  }
}

async function runTests() {
  try {
    console.log('Starting sponsor/admin driver leaving notification tests...\n');

    const companyA = await createTestSponsor({ companyName: `Leave Co A ${Date.now()}` });
    const companyB = await createTestSponsor({ companyName: `Leave Co B ${Date.now()}` });
    createdSponsorCompanyIds.push(companyA, companyB);

    const sponsorA = await createTestUser({ userType: 'sponsor' });
    const sponsorB = await createTestUser({ userType: 'sponsor' });
    const admin = await createTestUser({ userType: 'admin' });
    const driver = await createTestUser({ userType: 'driver' });
    createdUserIds.push(sponsorA.userId, sponsorB.userId, admin.userId, driver.userId);

    await createTestSponsorProfile({ userId: sponsorA.userId, sponsorCompanyId: companyA });
    await createTestSponsorProfile({ userId: sponsorB.userId, sponsorCompanyId: companyB });

    await setUserPermissions(sponsorA.userId, {
      canEditDriverAccounts: true,
      canAssumeDriverView: true,
    });

    await createTestDriverProfile({
      userId: driver.userId,
      sponsorCompanyId: companyA,
      licenseNumber: `LEAVE_DRV_${driver.userId}`,
      pointBalance: 75,
    });

    // TEST 1: Sponsor removes driver and notifications are generated.
    log('TEST 1: Sponsor removes driver from company', `DELETE /api/sponsors/${sponsorA.userId}/drivers/${driver.userId}/company`);
    const sponsorRemoveResponse = await axios.delete(
      `${API_BASE_URL}/sponsors/${sponsorA.userId}/drivers/${driver.userId}/company`
    );

    if (sponsorRemoveResponse.status !== 200 || sponsorRemoveResponse.data?.success !== true) {
      throw new Error('Expected sponsor driver removal endpoint to succeed');
    }

    const enrollmentStatusAfterSponsorRemove = await getDriverEnrollmentStatus(driver.userId, companyA);
    if (String(enrollmentStatusAfterSponsorRemove).toLowerCase() !== 'inactive') {
      throw new Error(
        `Expected enrollment inactive after sponsor removal; got ${enrollmentStatusAfterSponsorRemove}`
      );
    }

    const sponsorNotificationsAfterRemove = await getEventsByUserId(sponsorA.userId, 'Notification', 30);
    const sponsorRemovalNotification = sponsorNotificationsAfterRemove.find((event) => {
      const properties = parseEventProperties(event.Properties);
      return (
        properties.category === 'driver_left_company' &&
        properties.trigger === 'sponsor_removed_driver' &&
        Number(properties.driverUserId) === Number(driver.userId)
      );
    });

    if (!sponsorRemovalNotification) {
      throw new Error('Expected sponsor notification for sponsor-driven driver removal');
    }

    const driverNotificationsAfterRemove = await getEventsByUserId(driver.userId, 'Notification', 30);
    const driverRemovalNotification = driverNotificationsAfterRemove.find((event) => {
      const properties = parseEventProperties(event.Properties);
      return (
        properties.category === 'driver_removed_from_company' &&
        properties.trigger === 'sponsor_removed_driver'
      );
    });

    if (!driverRemovalNotification) {
      throw new Error('Expected driver notification for sponsor-driven driver removal');
    }

    // Prepare for admin-triggered flow.
    // Admin patch currently operates on DRIVERS.SponsorCompanyID; keep that in sync for this test.
    await setDriverSponsorCompanyId(driver.userId, companyA);
    // Also reactivate enrollment so subsequent enrollment-based routes work.
    await setDriverEnrollmentActive(driver.userId, companyA, 75);

    // TEST 2: Admin updates driver sponsor company to NULL and notifications are generated.
    log('TEST 2: Admin unassigns driver from company', `PATCH /api/admin/users/${driver.userId}`);
    const adminPatchResponse = await axios.patch(`${API_BASE_URL}/admin/users/${driver.userId}`, {
      sponsorCompanyId: null,
    });

    if (adminPatchResponse.status !== 200) {
      throw new Error('Expected admin patch to succeed when unassigning driver company');
    }

    const sponsorAfterAdminPatch = await getDriverSponsorCompanyId(driver.userId);
    if (sponsorAfterAdminPatch !== null) {
      throw new Error(`Expected SponsorCompanyID NULL after admin patch, got ${sponsorAfterAdminPatch}`);
    }

    const enrollmentStatusAfterAdminPatch = await getDriverEnrollmentStatus(driver.userId, companyA);
    if (String(enrollmentStatusAfterAdminPatch).toLowerCase() !== 'inactive') {
      throw new Error(
        `Expected enrollment inactive after admin patch; got ${enrollmentStatusAfterAdminPatch}`
      );
    }

    const sponsorNotificationsAfterAdminPatch = await getEventsByUserId(sponsorA.userId, 'Notification', 60);
    const sponsorAdminNotification = sponsorNotificationsAfterAdminPatch.find((event) => {
      const properties = parseEventProperties(event.Properties);
      return (
        properties.category === 'driver_left_company' &&
        properties.trigger === 'admin_driver_company_change' &&
        Number(properties.driverUserId) === Number(driver.userId)
      );
    });

    if (!sponsorAdminNotification) {
      throw new Error('Expected sponsor notification for admin-driven driver company change');
    }

    const driverNotificationsAfterAdminPatch = await getEventsByUserId(driver.userId, 'Notification', 60);
    const driverAdminNotification = driverNotificationsAfterAdminPatch.find((event) => {
      const properties = parseEventProperties(event.Properties);
      return (
        properties.category === 'driver_removed_from_company' &&
        properties.trigger === 'admin_driver_company_change'
      );
    });

    if (!driverAdminNotification) {
      throw new Error('Expected driver notification for admin-driven driver company change');
    }

    // Prepare for driver self-leave flow.
    await setDriverSponsorCompanyId(driver.userId, companyA);
    await setDriverEnrollmentActive(driver.userId, companyA, 75);

    // TEST 3: Driver leaves company and notifications are generated.
    log('TEST 3: Driver leaves sponsor company', `DELETE /api/drivers/${driver.userId}/company`);
    const driverLeaveResponse = await axios.delete(
      `${API_BASE_URL}/drivers/${driver.userId}/company?sponsorCompanyId=${companyA}`
    );

    if (driverLeaveResponse.status !== 200 || driverLeaveResponse.data?.success !== true) {
      throw new Error('Expected driver leave endpoint to succeed');
    }

    const enrollmentStatusAfterDriverLeave = await getDriverEnrollmentStatus(driver.userId, companyA);
    if (String(enrollmentStatusAfterDriverLeave).toLowerCase() !== 'inactive') {
      throw new Error(
        `Expected enrollment inactive after driver leave; got ${enrollmentStatusAfterDriverLeave}`
      );
    }

    const sponsorNotificationsAfterDriverLeave = await getEventsByUserId(sponsorA.userId, 'Notification', 90);
    const sponsorDriverLeaveNotification = sponsorNotificationsAfterDriverLeave.find((event) => {
      const properties = parseEventProperties(event.Properties);
      return (
        properties.category === 'driver_left_company' &&
        properties.trigger === 'driver_left_company' &&
        Number(properties.driverUserId) === Number(driver.userId)
      );
    });

    if (!sponsorDriverLeaveNotification) {
      throw new Error('Expected sponsor notification for driver-initiated leave');
    }

    const driverNotificationsAfterDriverLeave = await getEventsByUserId(driver.userId, 'Notification', 90);
    const driverSelfLeaveNotification = driverNotificationsAfterDriverLeave.find((event) => {
      const properties = parseEventProperties(event.Properties);
      return (
        properties.category === 'driver_removed_from_company' &&
        properties.trigger === 'driver_left_company'
      );
    });

    if (!driverSelfLeaveNotification) {
      throw new Error('Expected driver confirmation notification for driver-initiated leave');
    }

    // Prepare for inactive driver guard flow.
    await setDriverSponsorCompanyId(driver.userId, companyA);
    await setDriverEnrollmentActive(driver.userId, companyA, 75);

    const sponsorNotificationsBeforeInactiveAttempt = await getEventsByUserId(sponsorA.userId, 'Notification', 120);
    const driverNotificationsBeforeInactiveAttempt = await getEventsByUserId(driver.userId, 'Notification', 120);
    const sponsorLeaveCountBeforeInactiveAttempt = countNotificationsByTrigger(sponsorNotificationsBeforeInactiveAttempt, {
      category: 'driver_left_company',
      trigger: 'driver_left_company',
      driverUserId: driver.userId,
    });
    const driverLeaveCountBeforeInactiveAttempt = countNotificationsByTrigger(driverNotificationsBeforeInactiveAttempt, {
      category: 'driver_removed_from_company',
      trigger: 'driver_left_company',
    });

    // TEST 4: Inactive driver cannot leave company and notifications are not emitted.
    log('TEST 4: Inactive driver leave is blocked', `DELETE /api/drivers/${driver.userId}/company`);
    await setUserActiveStatus(driver.userId, 0);
    try {
      await axios.delete(`${API_BASE_URL}/drivers/${driver.userId}/company?sponsorCompanyId=${companyA}`);
      throw new Error('Expected inactive driver leave to return 403');
    } catch (error) {
      if (error?.response?.status !== 403) {
        throw error;
      }
    } finally {
      await setUserActiveStatus(driver.userId, 1);
    }

    const enrollmentStatusAfterInactiveAttempt = await getDriverEnrollmentStatus(driver.userId, companyA);
    if (String(enrollmentStatusAfterInactiveAttempt).toLowerCase() !== 'active') {
      throw new Error(
        `Expected inactive leave attempt to preserve active enrollment; got ${enrollmentStatusAfterInactiveAttempt}`
      );
    }

    const sponsorNotificationsAfterInactiveAttempt = await getEventsByUserId(sponsorA.userId, 'Notification', 120);
    const driverNotificationsAfterInactiveAttempt = await getEventsByUserId(driver.userId, 'Notification', 120);
    const sponsorLeaveCountAfterInactiveAttempt = countNotificationsByTrigger(sponsorNotificationsAfterInactiveAttempt, {
      category: 'driver_left_company',
      trigger: 'driver_left_company',
      driverUserId: driver.userId,
    });
    const driverLeaveCountAfterInactiveAttempt = countNotificationsByTrigger(driverNotificationsAfterInactiveAttempt, {
      category: 'driver_removed_from_company',
      trigger: 'driver_left_company',
    });

    if (sponsorLeaveCountAfterInactiveAttempt !== sponsorLeaveCountBeforeInactiveAttempt) {
      throw new Error('Did not expect sponsor notifications for inactive driver leave attempt');
    }

    if (driverLeaveCountAfterInactiveAttempt !== driverLeaveCountBeforeInactiveAttempt) {
      throw new Error('Did not expect driver notifications for inactive driver leave attempt');
    }

    console.log('\nSponsor/admin driver leaving notification tests completed successfully!');
  } catch (error) {
    console.error('\nSponsor/admin driver leaving notification tests failed:');
    if (error?.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error?.message ?? error);
    }
    process.exitCode = 1;
  } finally {
    await cleanupUsers(createdUserIds);
    await cleanupSponsorCompanies(createdSponsorCompanyIds);
    await closePool();
    process.exit(process.exitCode ?? 0);
  }
}

runTests();
