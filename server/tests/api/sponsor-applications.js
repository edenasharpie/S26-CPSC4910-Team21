/**
 * sponsor-applications.js
 *
 * Tests for the driver application accept/deny flow:
 *   GET  /api/sponsors/:userId/driver-applications
 *   POST /api/sponsors/:userId/process-application
 *
 * Verifies:
 *  - Sponsor sees only their own company's applications
 *  - Sponsor can accept and reject applications
 *  - Sponsor cannot process applications belonging to another company (403)
 */

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
} from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;

const createdUserIds = [];
const createdSponsorIds = [];
const createdApplicationIds = [];

async function cleanupUsers(userIds) {
  if (!userIds || userIds.length === 0) return;
  const connection = await pool.getConnection();
  try {
    for (const userId of userIds) {
      await connection.query('DELETE FROM EVENTS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM DRIVERS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM SPONSORS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [userId]);
    }
  } catch (error) {
    console.error('Error cleaning up users:', error.message);
  } finally {
    connection.release();
  }
}

async function cleanupApplications(applicationIds) {
  if (!applicationIds || applicationIds.length === 0) return;
  const connection = await pool.getConnection();
  try {
    for (const id of applicationIds) {
      await connection.query('DELETE FROM DRIVER_APPLICATIONS WHERE ApplicationID = ?', [id]);
    }
  } catch (error) {
    console.error('Error cleaning up applications:', error.message);
  } finally {
    connection.release();
  }
}

async function createTestApplication(licenseNumber, sponsorCompanyId, status = 'pending') {
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      `INSERT INTO DRIVER_APPLICATIONS (DriverID, SponsorCompanyID, ApplicationStatus, DecisionExplanation, TimeSubmitted)
       VALUES (?, ?, ?, '', NOW())`,
      [licenseNumber, sponsorCompanyId, status]
    );
    return result.insertId;
  } finally {
    connection.release();
  }
}

async function runTests() {
  try {
    console.log('Starting sponsor application accept/deny tests...\n');

    // Setup: two companies, one sponsor each, one driver per company
    const companyA = await createTestSponsor({ companyName: `App Co A ${Date.now()}` });
    const companyB = await createTestSponsor({ companyName: `App Co B ${Date.now()}` });
    createdSponsorIds.push(companyA, companyB);

    const sponsorA = await createTestUser({ userType: 'sponsor' });
    const sponsorB = await createTestUser({ userType: 'sponsor' });
    const driver = await createTestUser({ userType: 'driver' });
    createdUserIds.push(sponsorA.userId, sponsorB.userId, driver.userId);

    await createTestSponsorProfile({ userId: sponsorA.userId, sponsorCompanyId: companyA });
    await createTestSponsorProfile({ userId: sponsorB.userId, sponsorCompanyId: companyB });

    const driverProfile = await createTestDriverProfile({
      userId: driver.userId,
      sponsorCompanyId: companyA,
      licenseNumber: `APP_DRV_${driver.userId}`,
    });

    // Create two applications: one for Company A, one for Company B
    const appForA = await createTestApplication(driverProfile.licenseNumber, companyA, 'pending');
    const appForB = await createTestApplication(driverProfile.licenseNumber, companyB, 'pending');
    createdApplicationIds.push(appForA, appForB);

    // TEST 1: Sponsor A sees their application, not Company B's
    log('TEST 1: Sponsor A sees only Company A applications', `GET /api/sponsors/${sponsorA.userId}/driver-applications`);
    const resA = await axios.get(`${API_BASE_URL}/sponsors/${sponsorA.userId}/driver-applications`);
    if (resA.status !== 200 || !Array.isArray(resA.data)) {
      throw new Error('Expected 200 and array from Sponsor A driver-applications');
    }
    const appIdsSeenByA = resA.data.map((a) => Number(a.ApplicationID));
    if (!appIdsSeenByA.includes(appForA)) {
      throw new Error('Sponsor A should see their own application');
    }
    if (appIdsSeenByA.includes(appForB)) {
      throw new Error('Sponsor A must NOT see Company B\'s application');
    }
    console.log('PASS: Sponsor A sees only Company A applications');

    // TEST 2: Sponsor B sees their application, not Company A's
    log('TEST 2: Sponsor B sees only Company B applications', `GET /api/sponsors/${sponsorB.userId}/driver-applications`);
    const resB = await axios.get(`${API_BASE_URL}/sponsors/${sponsorB.userId}/driver-applications`);
    if (resB.status !== 200 || !Array.isArray(resB.data)) {
      throw new Error('Expected 200 and array from Sponsor B driver-applications');
    }
    const appIdsSeenByB = resB.data.map((a) => Number(a.ApplicationID));
    if (!appIdsSeenByB.includes(appForB)) {
      throw new Error('Sponsor B should see their own application');
    }
    if (appIdsSeenByB.includes(appForA)) {
      throw new Error('Sponsor B must NOT see Company A\'s application');
    }
    console.log('PASS: Sponsor B sees only Company B applications');

    // TEST 3: Sponsor A can accept their own application
    log('TEST 3: Sponsor A accepts application', `POST /api/sponsors/${sponsorA.userId}/process-application`);
    const acceptRes = await axios.post(`${API_BASE_URL}/sponsors/${sponsorA.userId}/process-application`, {
      applicationId: appForA,
      status: 'accepted',
      explanation: 'Great safety record',
    });
    if (acceptRes.status !== 200) {
      throw new Error(`Expected 200 on accept, got ${acceptRes.status}`);
    }
    console.log('PASS: Sponsor A accepted their application');

    // TEST 4: Sponsor B can reject their own application
    log('TEST 4: Sponsor B rejects application', `POST /api/sponsors/${sponsorB.userId}/process-application`);
    const rejectRes = await axios.post(`${API_BASE_URL}/sponsors/${sponsorB.userId}/process-application`, {
      applicationId: appForB,
      status: 'rejected',
      explanation: 'Too many violations',
    });
    if (rejectRes.status !== 200) {
      throw new Error(`Expected 200 on reject, got ${rejectRes.status}`);
    }
    console.log('PASS: Sponsor B rejected their application');

    // TEST 5: Sponsor B cannot process Sponsor A's application (403)
    log('TEST 5: Cross-company process-application returns 403', `POST /api/sponsors/${sponsorB.userId}/process-application`);
    try {
      await axios.post(`${API_BASE_URL}/sponsors/${sponsorB.userId}/process-application`, {
        applicationId: appForA,
        status: 'rejected',
        explanation: 'Unauthorized attempt',
      });
      throw new Error('Expected 403 for cross-company application process');
    } catch (err) {
      if (err.response?.status !== 403) throw err;
      console.log('PASS: Cross-company process-application correctly returns 403');
    }

    // TEST 6: Invalid status returns 400
    log('TEST 6: Invalid status returns 400', `POST /api/sponsors/${sponsorA.userId}/process-application`);
    try {
      await axios.post(`${API_BASE_URL}/sponsors/${sponsorA.userId}/process-application`, {
        applicationId: appForA,
        status: 'banana',
        explanation: 'wat',
      });
      throw new Error('Expected 400 for invalid status');
    } catch (err) {
      if (err.response?.status !== 400) throw err;
      console.log('PASS: Invalid status returns 400');
    }

    console.log('\nSponsor application accept/deny tests completed successfully!');
  } catch (error) {
    console.error('\nSponsor application tests FAILED:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    process.exitCode = 1;
  } finally {
    await cleanupApplications(createdApplicationIds);
    await cleanupUsers(createdUserIds);
    await cleanupSponsorCompanies(createdSponsorIds);
    await closePool();
  }
}

runTests();
