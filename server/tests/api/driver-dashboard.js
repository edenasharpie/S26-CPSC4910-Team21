import axios from 'axios';
import {
  BASE_URL,
  log,
  createTestSponsor,
  cleanupSponsorCompanies,
  closePool,
  createTestUser,
  createTestDriverProfile,
  setUserActiveStatus,
} from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;

const createdUserIds = [];
const createdSponsorIds = [];
const createdDriverLicenses = [];

async function insertPointTransaction({ driverId, userChanged, pointChange, reason, timeChanged = null }) {
  const connection = await pool.getConnection();
  try {
    if (timeChanged) {
      await connection.query(
        `INSERT INTO POINT_TRANSACTIONS
          (DriverID, UserChanged, PointChange, ReasonForChange, TimeChanged)
         VALUES (?, ?, ?, ?, ?)`,
        [driverId, userChanged, pointChange, reason, timeChanged]
      );
    } else {
      await connection.query(
        `INSERT INTO POINT_TRANSACTIONS
          (DriverID, UserChanged, PointChange, ReasonForChange, TimeChanged)
         VALUES (?, ?, ?, ?, NOW())`,
        [driverId, userChanged, pointChange, reason]
      );
    }
  } finally {
    connection.release();
  }
}

async function cleanupUsers(userIds, driverLicenses) {
  if (!userIds.length) return;

  const connection = await pool.getConnection();
  try {
    for (const license of driverLicenses) {
      await connection.query('DELETE FROM POINT_TRANSACTIONS WHERE DriverID = ?', [license]);
    }

    for (const userId of userIds) {
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
    console.log('Starting driver dashboard endpoint tests...\n');

    const sponsorCompanyId = await createTestSponsor({
      companyName: `Driver Dashboard Sponsor ${Date.now()}`,
      pointDollarValue: 0.01,
    });
    createdSponsorIds.push(sponsorCompanyId);

    const dashboardDriver = await createTestUser({ userType: 'driver' });
    createdUserIds.push(dashboardDriver.userId);

    const driverProfile = await createTestDriverProfile({
      userId: dashboardDriver.userId,
      sponsorCompanyId,
      pointBalance: 320,
      performanceStatus: 'good',
      licenseNumber: `DBDASH_${dashboardDriver.userId}`,
    });
    createdDriverLicenses.push(driverProfile.licenseNumber);

    await insertPointTransaction({
      driverId: driverProfile.licenseNumber,
      userChanged: dashboardDriver.userId,
      pointChange: 500,
      reason: 'Initial points',
    });

    await insertPointTransaction({
      driverId: driverProfile.licenseNumber,
      userChanged: dashboardDriver.userId,
      pointChange: -180,
      reason: 'Order #1 placed',
    });

    await insertPointTransaction({
      driverId: driverProfile.licenseNumber,
      userChanged: dashboardDriver.userId,
      pointChange: -80,
      reason: 'Legacy bad timestamp',
      timeChanged: '1970-01-01 00:00:00',
    });

    log('TEST 1: Fetching driver points history...', `GET /api/drivers/my-points/${dashboardDriver.userId}`);
    const pointsRes = await axios.get(`${API_BASE_URL}/drivers/my-points/${dashboardDriver.userId}`);

    if (typeof pointsRes.data?.balance !== 'number') {
      throw new Error('Expected points balance to be numeric');
    }

    if (!Array.isArray(pointsRes.data?.history) || pointsRes.data.history.length !== 2) {
      throw new Error(`Expected points history to exclude invalid-dated rows and contain 2 entries, got ${pointsRes.data.history.length}`);
    }

    for (const entry of pointsRes.data.history) {
      if (typeof entry.PointChange !== 'number') {
        throw new Error(`Expected numeric PointChange, got ${typeof entry.PointChange}`);
      }

      if (entry.TimeChanged !== null) {
        if (typeof entry.TimeChanged !== 'string' || !entry.TimeChanged.trim()) {
          throw new Error('Expected TimeChanged to be null or non-empty string');
        }

        const parsed = new Date(entry.TimeChanged);
        if (Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() < 2000) {
          throw new Error(`Expected modern valid TimeChanged value, got ${entry.TimeChanged}`);
        }
      }
    }

    const hasLegacyRow = pointsRes.data.history.some((entry) => entry.ReasonForChange === 'Legacy bad timestamp');
    if (hasLegacyRow) {
      throw new Error('Expected legacy invalid-dated point transaction to be excluded from response history');
    }

    log('TEST 2: Fetching driver performance...', `GET /api/drivers/performance/${dashboardDriver.userId}`);
    const performanceRes = await axios.get(`${API_BASE_URL}/drivers/performance/${dashboardDriver.userId}`);
    if (typeof performanceRes.data?.performanceStatus !== 'string') {
      throw new Error('Expected performanceStatus string');
    }

    log('TEST 3: Inactive driver points endpoint blocked...', `GET /api/drivers/my-points/${dashboardDriver.userId}`);
    await setUserActiveStatus(dashboardDriver.userId, 0);
    try {
      await axios.get(`${API_BASE_URL}/drivers/my-points/${dashboardDriver.userId}`);
      throw new Error('Expected inactive driver points request to fail with 403');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    } finally {
      await setUserActiveStatus(dashboardDriver.userId, 1);
    }

    log('TEST 4: Driver without profile returns 404...', 'GET /api/drivers/my-points/:userId');
    const noProfileDriver = await createTestUser({ userType: 'driver' });
    createdUserIds.push(noProfileDriver.userId);

    try {
      await axios.get(`${API_BASE_URL}/drivers/my-points/${noProfileDriver.userId}`);
      throw new Error('Expected missing driver profile to return 404');
    } catch (error) {
      if (!error.response || error.response.status !== 404) {
        throw error;
      }
    }

    console.log('\nDriver dashboard endpoint tests completed successfully!');
  } catch (error) {
    console.error('\nDriver dashboard tests failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    await cleanupUsers(createdUserIds, createdDriverLicenses);
    await cleanupSponsorCompanies(createdSponsorIds);
    await closePool();
    process.exit(0);
  }
}

runTests();
