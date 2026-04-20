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
  setUserActiveStatus,
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
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [userId]);
      console.log(`Deleted user ${userId}`);
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
    console.log('Starting sponsor assume endpoint tests...\n');

    const companyA = await createTestSponsor({
      companyName: `Sponsor Assume A ${Date.now()}`,
      pointDollarValue: 0.01,
    });
    const companyB = await createTestSponsor({
      companyName: `Sponsor Assume B ${Date.now()}`,
      pointDollarValue: 0.01,
    });
    createdSponsorIds.push(companyA, companyB);

    const sponsorUser = await createTestUser({ userType: 'sponsor' });
    const otherRoleRequester = await createTestUser({ userType: 'admin' });
    const sameCompanyDriver = await createTestUser({ userType: 'driver' });
    const otherCompanyDriver = await createTestUser({ userType: 'driver' });

    createdUserIds.push(
      sponsorUser.userId,
      otherRoleRequester.userId,
      sameCompanyDriver.userId,
      otherCompanyDriver.userId
    );

    await createTestSponsorProfile({ userId: sponsorUser.userId, sponsorCompanyId: companyA });

    const sponsorIdentity = { ...sponsorUser, userType: 'sponsor' };

    await createTestDriverProfile({
      userId: sameCompanyDriver.userId,
      sponsorCompanyId: companyA,
      licenseNumber: `SPA_DL_${sameCompanyDriver.userId}`,
    });

    await createTestDriverProfile({
      userId: otherCompanyDriver.userId,
      sponsorCompanyId: companyB,
      licenseNumber: `SPB_DL_${otherCompanyDriver.userId}`,
    });

    const adminIdentity = { ...otherRoleRequester, userType: 'admin' };
    const assumedDriverIdentity = { ...sameCompanyDriver, userType: 'driver' };
    const assumedDriverCookie = buildSessionCookie(assumedDriverIdentity, sponsorIdentity);

    // Seed applications so sponsor-assumed filtering can be validated.
    const appForA = await createTestApplication(`SPA_DL_${sameCompanyDriver.userId}`, companyA, 'pending');
    const appForB = await createTestApplication(`SPA_DL_${sameCompanyDriver.userId}`, companyB, 'pending');
    createdApplicationIds.push(appForA, appForB);

    // Test 1: sponsor assumes same-company driver
    log('TEST 1: Sponsor assume same-company driver success', `POST /api/sponsors/${sponsorUser.userId}/assume-driver/${sameCompanyDriver.userId}`);
    const happyPathRes = await axios.post(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/assume-driver/${sameCompanyDriver.userId}`);
    if (happyPathRes.status !== 200 || happyPathRes.data?.assumedUser?.UserType !== 'driver') {
      throw new Error('Expected sponsor assume success with driver payload');
    }

    // Test 1b: Sponsor-assumed driver can load dashboard points widgets
    log('TEST 1b: Assumed driver dashboard points data loads', 'GET /api/drivers/my-points/:userId, /api/drivers/performance/:userId');
    const assumedDriverUserId = happyPathRes.data.assumedUser.UserID;
    const pointsWidgetRes = await axios.get(`${API_BASE_URL}/drivers/my-points/${assumedDriverUserId}`, {
      params: { sponsorCompanyId: companyA },
    });
    if (
      pointsWidgetRes.status !== 200 ||
      typeof pointsWidgetRes.data?.balance !== 'number' ||
      !Array.isArray(pointsWidgetRes.data?.history)
    ) {
      throw new Error('Expected assumed driver points payload with numeric balance and history array');
    }

    const performanceWidgetRes = await axios.get(`${API_BASE_URL}/drivers/performance/${assumedDriverUserId}`);
    if (
      performanceWidgetRes.status !== 200 ||
      typeof performanceWidgetRes.data?.performanceStatus !== 'string'
    ) {
      throw new Error('Expected assumed driver performance payload with performanceStatus');
    }

    // Test 1c: Sponsor-assumed context sees only own-company applications for driver
    log('TEST 1c: Sponsor-assumed context filters my-applications by sponsor company', 'GET /api/user/my-applications/:driverId');
    const scopedAppsRes = await axios.get(
      `${API_BASE_URL}/user/my-applications/${sameCompanyDriver.userId}`,
      { headers: { Cookie: assumedDriverCookie } }
    );

    if (scopedAppsRes.status !== 200 || !Array.isArray(scopedAppsRes.data)) {
      throw new Error('Expected 200 and array from my-applications in sponsor-assumed context');
    }

    const scopedCompanyIds = scopedAppsRes.data.map((row) => Number(row.SponsorCompanyID));
    if (scopedCompanyIds.some((companyId) => companyId !== Number(companyA))) {
      throw new Error('Sponsor-assumed my-applications must only include the assuming sponsor company');
    }
    if (!scopedCompanyIds.includes(Number(companyA))) {
      throw new Error('Expected at least one company A application in scoped result');
    }
    if (scopedCompanyIds.includes(Number(companyB))) {
      throw new Error('Sponsor-assumed my-applications must not expose other sponsor companies');
    }

    // Test 1d: Sponsor-assumed context does not expose unexpected sponsor IDs in driver sponsors payload
    log('TEST 1d: Sponsor-assumed context keeps driver sponsors payload sponsor-scoped', 'GET /api/drivers/sponsors/:userId');
    const scopedSponsorsRes = await axios.get(
      `${API_BASE_URL}/drivers/sponsors/${sameCompanyDriver.userId}`,
      { headers: { Cookie: assumedDriverCookie } }
    );

    if (scopedSponsorsRes.status !== 200 || !Array.isArray(scopedSponsorsRes.data)) {
      throw new Error('Expected 200 and array from driver sponsors endpoint');
    }

    if (scopedSponsorsRes.data.some((row) => Number(row.SponsorCompanyID) !== Number(companyA))) {
      throw new Error('Sponsor-assumed driver sponsors payload must only include the assuming sponsor company');
    }

    // Test 1e: Mismatched assumed-driver session cannot read another driver sponsors payload
    log('TEST 1e: Mismatched effective driver in session returns 403', 'GET /api/drivers/sponsors/:userId');
    const mismatchedDriverCookie = buildSessionCookie({ ...otherCompanyDriver, userType: 'driver' }, sponsorIdentity);
    try {
      await axios.get(`${API_BASE_URL}/drivers/sponsors/${sameCompanyDriver.userId}`, {
        headers: { Cookie: mismatchedDriverCookie },
      });
      throw new Error('Expected 403 for mismatched effective driver session on driver sponsors endpoint');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }

    // Test 2: missing permission returns 403
    log('TEST 2: Missing canAssumeDriverView returns 403', 'POST /api/sponsors/:userId/assume-driver/:driverId');
    await setUserPermissions(sponsorUser.userId, { canAssumeDriverView: false });
    try {
      await axios.post(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/assume-driver/${sameCompanyDriver.userId}`);
      throw new Error('Expected 403 when sponsor lacks canAssumeDriverView');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }
    await setUserPermissions(sponsorUser.userId, {});

    // Test 3: inactive sponsor returns 403
    log('TEST 3: Inactive sponsor requester returns 403', 'POST /api/sponsors/:userId/assume-driver/:driverId');
    await setUserActiveStatus(sponsorUser.userId, 0);
    try {
      await axios.post(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/assume-driver/${sameCompanyDriver.userId}`);
      throw new Error('Expected 403 for inactive sponsor requester');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }
    await setUserActiveStatus(sponsorUser.userId, 1);

    // Test 4: out-of-company driver returns 404
    log('TEST 4: Out-of-company driver returns 404', 'POST /api/sponsors/:userId/assume-driver/:driverId');
    try {
      await axios.post(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/assume-driver/${otherCompanyDriver.userId}`);
      throw new Error('Expected 404 for out-of-company driver');
    } catch (error) {
      if (!error.response || error.response.status !== 404) {
        throw error;
      }
    }

    // Test 5: inactive target driver returns 409
    log('TEST 5: Inactive target driver returns 409', 'POST /api/sponsors/:userId/assume-driver/:driverId');
    await setUserActiveStatus(sameCompanyDriver.userId, 0);
    try {
      await axios.post(`${API_BASE_URL}/sponsors/${sponsorUser.userId}/assume-driver/${sameCompanyDriver.userId}`);
      throw new Error('Expected 409 for inactive target driver');
    } catch (error) {
      if (!error.response || error.response.status !== 409) {
        throw error;
      }
    }
    await setUserActiveStatus(sameCompanyDriver.userId, 1);

    // Test 6: non-sponsor requester returns 403
    log('TEST 6: Non-sponsor requester returns 403', 'POST /api/sponsors/:userId/assume-driver/:driverId');
    try {
      await axios.post(`${API_BASE_URL}/sponsors/${otherRoleRequester.userId}/assume-driver/${sameCompanyDriver.userId}`);
      throw new Error('Expected 403 for non-sponsor requester');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }

    // Test 7: Route user mismatch with assumed sponsor cookie returns 403
    log('TEST 7: Assumed sponsor cannot spoof route userId', 'POST /api/sponsors/:userId/assume-driver/:driverId');
    const assumedSponsorCookie = buildSessionCookie(sponsorIdentity, adminIdentity);
    try {
      await axios.post(
        `${API_BASE_URL}/sponsors/${otherRoleRequester.userId}/assume-driver/${sameCompanyDriver.userId}`,
        {},
        { headers: { Cookie: assumedSponsorCookie } }
      );
      throw new Error('Expected 403 for mismatched assumed sponsor route userId');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }

    console.log('\nSponsor assume endpoint tests completed successfully!');
  } catch (error) {
    console.error('\nSponsor assume tests failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    await cleanupApplications(createdApplicationIds);
    await cleanupUsers(createdUserIds);
    await cleanupSponsorCompanies(createdSponsorIds);
    await closePool();
  }
}

runTests();
