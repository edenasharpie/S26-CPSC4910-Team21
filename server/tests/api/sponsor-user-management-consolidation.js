import axios from 'axios';
import jwt from 'jsonwebtoken';
import {
  BASE_URL,
  log,
  createTestSponsor,
  cleanupSponsorCompanies,
  closePool,
  createTestUser,
  createTestSponsorProfile,
} from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-fleetscore';

const createdUserIds = [];
const createdSponsorIds = [];

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

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getWithRetry(url, options = {}, retries = 4, delayMs = 150) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await axios.get(url, options);
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const canRetry = attempt < retries && (status === 404 || status === 500);
      if (!canRetry) {
        throw error;
      }
      await wait(delayMs);
    }
  }

  throw lastError;
}

async function runTests() {
  try {
    console.log('Starting sponsor user-management consolidation tests...\n');

    const suffix = Date.now().toString().slice(-6);

    const sponsorCompanyId = await createTestSponsor({
      companyName: `Consolidation Co ${suffix}`,
      pointDollarValue: 0.01,
    });
    createdSponsorIds.push(sponsorCompanyId);

    const sponsor = await createTestUser({
      userType: 'sponsor',
      username: `spn${suffix}a`,
      email: `a${suffix}@e.co`,
      firstName: 'Legacy',
      lastName: 'Owner',
    });

    const otherUser = await createTestUser({
      userType: 'sponsor',
      username: `spn${suffix}b`,
      email: `b${suffix}@e.co`,
      firstName: 'Other',
      lastName: 'User',
    });

    createdUserIds.push(sponsor.userId, otherUser.userId);

    await createTestSponsorProfile({
      userId: sponsor.userId,
      sponsorCompanyId,
    });

    // TEST 1: Legacy route should be removed.
    log('TEST 1: Legacy affiliated-users route is removed', 'GET /api/sponsors/affiliated-users');
    try {
      await axios.get(`${API_BASE_URL}/sponsors/affiliated-users`);
      throw new Error('Expected 404 when requesting removed /affiliated-users endpoint');
    } catch (error) {
      if (!error.response || error.response.status !== 404) {
        throw error;
      }
    }

    // TEST 2: Legacy edit mutation route should be removed.
    log('TEST 2: Legacy sponsor user PUT route is removed', `PUT /api/sponsors/user/${sponsor.userId}`);
    try {
      await axios.put(`${API_BASE_URL}/sponsors/user/${sponsor.userId}`, {
        firstName: 'Changed',
        lastName: 'Name',
        email: `chg${suffix}@e.co`,
      });
      throw new Error('Expected 404 when requesting removed PUT /api/sponsors/user/:id endpoint');
    } catch (error) {
      if (!error.response || error.response.status !== 404) {
        throw error;
      }
    }

    // TEST 3: Canonical sponsor company route still works.
    log('TEST 3: Canonical sponsor company route still returns payload', `GET /api/sponsors/user/${sponsor.userId}`);
    const companyRes = await getWithRetry(`${API_BASE_URL}/sponsors/user/${sponsor.userId}`);

    if (companyRes.status !== 200) {
      throw new Error(`Expected 200 from canonical sponsor user route, got ${companyRes.status}`);
    }

    if (Number(companyRes.data?.sponsorCompanyId) !== Number(sponsorCompanyId)) {
      throw new Error('Expected canonical sponsor route to return matching sponsorCompanyId');
    }

    if (typeof companyRes.data?.companyName !== 'string' || !companyRes.data.companyName.length) {
      throw new Error('Expected canonical sponsor route to include non-empty companyName');
    }

    // TEST 4: Canonical route still enforces session-context mismatch checks.
    log('TEST 4: Canonical route rejects mismatched session context', `GET /api/sponsors/user/${sponsor.userId}`);
    const mismatchedCookie = buildSessionCookie({
      userId: otherUser.userId,
      userType: 'sponsor',
      username: otherUser.username,
    });

    try {
      await axios.get(`${API_BASE_URL}/sponsors/user/${sponsor.userId}`, {
        headers: { Cookie: mismatchedCookie },
      });
      throw new Error('Expected 403 for mismatched effective-session user context');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }

    console.log('\nSponsor user-management consolidation tests completed successfully!');
  } catch (error) {
    console.error('\nSponsor user-management consolidation tests failed:');
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
