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
import jwt from 'jsonwebtoken';
import {
  BASE_URL,
  log,
  createTestSponsor,
  cleanupSponsorCompanies,
  closePool,
  createTestUser,
  createTestDriverProfile,
  createTestSponsorProfile,
  getEventsByUserId,
  setUserPermissions,
} from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-fleetscore';

const createdUserIds = [];
const createdSponsorIds = [];
const createdApplicationIds = [];

function buildSessionCookie(user, originalUser = null) {
  const payload = {
    UserID: user.userId,
    UserType: user.userType,
    Username: user.username,
  };

  if (originalUser) {
    payload.OriginalUser = {
      UserID: originalUser.userId,
      UserType: originalUser.userType,
      Username: originalUser.username,
    };
  }

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: 60 * 60 * 24 });
  return `sessionId=${token}`;
}

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

async function getApplicationById(applicationId) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT ApplicationID, DriverID, SponsorCompanyID, ApplicationStatus
       FROM DRIVER_APPLICATIONS
       WHERE ApplicationID = ?`,
      [applicationId]
    );
    return rows[0] ?? null;
  } finally {
    connection.release();
  }
}

async function getDriverByLicense(licenseNumber) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT LicenseNumber, SponsorCompanyID
       FROM DRIVERS
       WHERE LicenseNumber = ?`,
      [licenseNumber]
    );
    return rows[0] ?? null;
  } finally {
    connection.release();
  }
}

function parseEventProperties(rawProperties) {
  if (!rawProperties) return {};
  if (typeof rawProperties === 'object') return rawProperties;
  try {
    return JSON.parse(rawProperties);
  } catch {
    return {};
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
    if (resA.status !== 200 || !Array.isArray(resA.data?.applications)) {
      throw new Error('Expected 200 and payload with applications array from Sponsor A driver-applications');
    }
    if (resA.data?.permissions?.canViewDriverApplications !== true) {
      throw new Error('Expected canViewDriverApplications permission in Sponsor A response');
    }
    const appIdsSeenByA = resA.data.applications.map((a) => Number(a.ApplicationID));
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
    if (resB.status !== 200 || !Array.isArray(resB.data?.applications)) {
      throw new Error('Expected 200 and payload with applications array from Sponsor B driver-applications');
    }
    if (resB.data?.permissions?.canViewDriverApplications !== true) {
      throw new Error('Expected canViewDriverApplications permission in Sponsor B response');
    }
    const appIdsSeenByB = resB.data.applications.map((a) => Number(a.ApplicationID));
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

    const acceptedApp = await getApplicationById(appForA);
    if (!acceptedApp || acceptedApp.ApplicationStatus !== 'accepted') {
      throw new Error('Expected application status to update to accepted in DB');
    }

    const acceptedDriver = await getDriverByLicense(driverProfile.licenseNumber);
    if (!acceptedDriver || Number(acceptedDriver.SponsorCompanyID) !== Number(companyA)) {
      throw new Error('Expected accepted driver to be linked to Sponsor Company A in DB');
    }

    const sponsorAEvents = await getEventsByUserId(sponsorA.userId, 'ApplicationStatusUpdate', 20);
    const acceptedEvent = sponsorAEvents.find((event) => {
      const properties = parseEventProperties(event.Properties);
      return Number(properties.applicationId) === Number(appForA);
    });
    if (!acceptedEvent) {
      throw new Error('Expected an ApplicationStatusUpdate event for accepted application');
    }

    const acceptedEventProperties = parseEventProperties(acceptedEvent.Properties);
    if (acceptedEventProperties.status !== 'accepted') {
      throw new Error('Expected accepted event to include status=accepted');
    }
    if (acceptedEventProperties.reviewNotes !== 'Great safety record') {
      throw new Error('Expected accepted event to include reviewNotes');
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

    const rejectedApp = await getApplicationById(appForB);
    if (!rejectedApp || rejectedApp.ApplicationStatus !== 'rejected') {
      throw new Error('Expected application status to update to rejected in DB');
    }

    const sponsorBEvents = await getEventsByUserId(sponsorB.userId, 'ApplicationStatusUpdate', 20);
    const rejectedEvent = sponsorBEvents.find((event) => {
      const properties = parseEventProperties(event.Properties);
      return Number(properties.applicationId) === Number(appForB);
    });
    if (!rejectedEvent) {
      throw new Error('Expected an ApplicationStatusUpdate event for rejected application');
    }

    const rejectedEventProperties = parseEventProperties(rejectedEvent.Properties);
    if (rejectedEventProperties.status !== 'rejected') {
      throw new Error('Expected rejected event to include status=rejected');
    }
    if (rejectedEventProperties.reviewNotes !== 'Too many violations') {
      throw new Error('Expected rejected event to include reviewNotes');
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

    // TEST 7: session effective user mismatch returns 403 for list endpoint
    log('TEST 7: Mismatched session userId is rejected on driver-applications list', `GET /api/sponsors/${sponsorA.userId}/driver-applications`);

    const mismatchListCookie = buildSessionCookie({ ...driver, userType: 'driver' });
    try {
      await axios.get(`${API_BASE_URL}/sponsors/${sponsorA.userId}/driver-applications`, {
        headers: { Cookie: mismatchListCookie },
      });
      throw new Error('Expected 403 for mismatched effective session on driver-applications list');
    } catch (err) {
      if (err.response?.status !== 403) throw err;
      console.log('PASS: Session mismatch returns 403 for list endpoint');
    }

    // TEST 8: session effective user mismatch returns 403 for process endpoint
    log('TEST 8: Mismatched session userId is rejected on process-application', `POST /api/sponsors/${sponsorA.userId}/process-application`);
    const mismatchProcessCookie = buildSessionCookie({ ...driver, userType: 'driver' });
    try {
      await axios.post(
        `${API_BASE_URL}/sponsors/${sponsorA.userId}/process-application`,
        {
          applicationId: appForA,
          status: 'accepted',
          explanation: 'should fail by session guard',
        },
        {
          headers: { Cookie: mismatchProcessCookie },
        }
      );
      throw new Error('Expected 403 for mismatched effective session on process-application');
    } catch (err) {
      if (err.response?.status !== 403) throw err;
      console.log('PASS: Session mismatch returns 403 for process endpoint');
    }

    // TEST 9: A processed application cannot be re-processed
    log('TEST 9: Re-processing a finalized application returns 409', `POST /api/sponsors/${sponsorA.userId}/process-application`);
    try {
      await axios.post(`${API_BASE_URL}/sponsors/${sponsorA.userId}/process-application`, {
        applicationId: appForA,
        status: 'rejected',
        explanation: 'second decision should fail',
      });
      throw new Error('Expected 409 when re-processing a finalized application');
    } catch (err) {
      if (err.response?.status !== 409) throw err;
      console.log('PASS: Re-processing finalized application returns 409');
    }

    // TEST 10: Sponsor without canAcceptDriverApplications gets 403
    const permissionAppAccept = await createTestApplication(driverProfile.licenseNumber, companyA, 'pending');
    createdApplicationIds.push(permissionAppAccept);
    await setUserPermissions(sponsorA.userId, {
      canViewDriverApplications: true,
      canAcceptDriverApplications: false,
      canRejectDriverApplications: true,
    });

    log('TEST 10: Missing accept permission returns 403', `POST /api/sponsors/${sponsorA.userId}/process-application`);
    try {
      await axios.post(`${API_BASE_URL}/sponsors/${sponsorA.userId}/process-application`, {
        applicationId: permissionAppAccept,
        status: 'accepted',
        explanation: 'attempt without accept permission',
      });
      throw new Error('Expected 403 when accept permission is disabled');
    } catch (err) {
      if (err.response?.status !== 403) throw err;
      console.log('PASS: Missing accept permission returns 403');
    }

    // TEST 11: Sponsor without canRejectDriverApplications gets 403
    const permissionAppReject = await createTestApplication(driverProfile.licenseNumber, companyA, 'pending');
    createdApplicationIds.push(permissionAppReject);
    await setUserPermissions(sponsorA.userId, {
      canViewDriverApplications: true,
      canAcceptDriverApplications: true,
      canRejectDriverApplications: false,
    });

    log('TEST 11: Missing reject permission returns 403', `POST /api/sponsors/${sponsorA.userId}/process-application`);
    try {
      await axios.post(`${API_BASE_URL}/sponsors/${sponsorA.userId}/process-application`, {
        applicationId: permissionAppReject,
        status: 'rejected',
        explanation: 'attempt without reject permission',
      });
      throw new Error('Expected 403 when reject permission is disabled');
    } catch (err) {
      if (err.response?.status !== 403) throw err;
      console.log('PASS: Missing reject permission returns 403');
    }

    // TEST 12: Sponsor without canViewDriverApplications gets 403 on list endpoint
    await setUserPermissions(sponsorA.userId, {
      canViewDriverApplications: false,
      canAcceptDriverApplications: true,
      canRejectDriverApplications: true,
    });

    log('TEST 12: Missing view permission returns 403', `GET /api/sponsors/${sponsorA.userId}/driver-applications`);
    try {
      await axios.get(`${API_BASE_URL}/sponsors/${sponsorA.userId}/driver-applications`);
      throw new Error('Expected 403 when view permission is disabled');
    } catch (err) {
      if (err.response?.status !== 403) throw err;
      console.log('PASS: Missing view permission returns 403');
    }

    await setUserPermissions(sponsorA.userId, {});

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
