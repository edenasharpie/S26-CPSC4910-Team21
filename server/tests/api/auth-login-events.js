import axios from 'axios';
import {
  BASE_URL,
  closePool,
  createTestUser,
  log,
} from '../setup.js';
import { hashPassword } from '../../src/utils/auth.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;

const createdUserIds = [];
const createdEventIds = [];

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
    console.error('Error cleaning up users:', error.message);
  } finally {
    connection.release();
  }
}

async function cleanupEvents(eventIds) {
  if (!eventIds || eventIds.length === 0) return;

  const connection = await pool.getConnection();
  try {
    for (const eventId of eventIds) {
      await connection.query('DELETE FROM EVENTS WHERE EventID = ?', [eventId]);
    }
  } catch (error) {
    console.error('Error cleaning up events:', error.message);
  } finally {
    connection.release();
  }
}

async function getSystemAccount() {
  const [rows] = await pool.query(
    'SELECT UserID, Username, ActiveStatus, Permissions FROM USERS WHERE IsSystemAccount = 1'
  );

  if (rows.length !== 1) {
    throw new Error(`Expected exactly one system account row, found ${rows.length}`);
  }

  return rows[0];
}

async function fetchLatestLoginEventByIp(ipAddress) {
  const [rows] = await pool.query(
    `SELECT EventID, UserID, EventType, Properties, Timestamp
     FROM EVENTS
     WHERE EventType = 'LoginAttempt'
       AND JSON_UNQUOTE(JSON_EXTRACT(Properties, '$.ipAddress')) = ?
     ORDER BY EventID DESC
     LIMIT 1`,
    [ipAddress]
  );

  return rows[0] ?? null;
}

async function countZeroUserIdEventsByIp(ipAddresses) {
  const placeholders = ipAddresses.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS zeroCount
     FROM EVENTS
     WHERE EventType = 'LoginAttempt'
       AND UserID = 0
       AND JSON_UNQUOTE(JSON_EXTRACT(Properties, '$.ipAddress')) IN (${placeholders})`,
    ipAddresses
  );

  return Number(rows[0]?.zeroCount ?? 0);
}

async function expectLoginFailure(username, password, ipAddress, expectedStatus) {
  try {
    await axios.post(
      `${API_BASE_URL}/auth/login`,
      { username, password },
      { headers: { 'x-forwarded-for': ipAddress } }
    );
    throw new Error(`Expected login to fail with ${expectedStatus} for ${username}`);
  } catch (error) {
    if (!error.response || error.response.status !== expectedStatus) {
      throw error;
    }
    return error.response;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function expectEventWithRetries({
  username,
  password,
  expectedStatus,
  expectedUserId,
  expectedResult,
  expectedSuccess,
  ipBase,
  ipMarkers,
  validateResponse,
  maxAttempts = 5,
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptIp = `${ipBase}-attempt-${attempt}`;
    ipMarkers.push(attemptIp);

    let response;
    try {
      response = await axios.post(
        `${API_BASE_URL}/auth/login`,
        { username, password },
        { headers: { 'x-forwarded-for': attemptIp } }
      );

      if (expectedStatus !== 200) {
        if (attempt === maxAttempts) {
          throw new Error(`Expected status ${expectedStatus}, received 200 for ${username}.`);
        }
        await sleep(250);
        continue;
      }
    } catch (error) {
      if (expectedStatus === 200) {
        if (attempt === maxAttempts) {
          throw error;
        }
        await sleep(250);
        continue;
      }

      if (!error.response || error.response.status !== expectedStatus) {
        if (attempt === maxAttempts) {
          throw error;
        }
        await sleep(250);
        continue;
      }

      response = error.response;
    }

    if (typeof validateResponse === 'function') {
      validateResponse(response);
    }

    const event = await fetchLatestLoginEventByIp(attemptIp);
    if (!event) {
      if (attempt === maxAttempts) {
        throw new Error(`Expected LoginAttempt event for ${ipBase}, but none was found.`);
      }
      await sleep(250);
      continue;
    }

    createdEventIds.push(event.EventID);
    const properties = parseProperties(event.Properties);
    const actorMatches = Number(event.UserID) === Number(expectedUserId);
    const payloadMatches = properties.result === expectedResult && properties.success === expectedSuccess;

    if (actorMatches && payloadMatches) {
      return { response, event, properties };
    }

    const isTransientLookupLag = properties.result === 'username_not_found';
    if (isTransientLookupLag && attempt < maxAttempts) {
      await sleep(250);
      continue;
    }

    throw new Error(
      `Unexpected login event for ${ipBase}: userId=${event.UserID}, result=${properties.result}, success=${properties.success}`
    );
  }

  throw new Error(`Unable to validate login event after ${maxAttempts} attempts for ${ipBase}.`);
}

async function runTests() {
  const ipMarkers = [];

  try {
    console.log('Starting auth login event tests...\n');

    const systemAccount = await getSystemAccount();
    const systemPermissions = parseProperties(systemAccount.Permissions);

    if (Number(systemAccount.ActiveStatus) !== 0) {
      throw new Error('Expected IsSystemAccount user to be inactive.');
    }

    if (systemPermissions.canLogin === true) {
      throw new Error('Expected IsSystemAccount user to not allow canLogin=true.');
    }

    const activePassword = 'DriverPass!123';
    const activePassHash = await hashPassword(activePassword);
    const activeDriver = await createTestUser({
      userType: 'driver',
      passHash: activePassHash,
    });
    createdUserIds.push(activeDriver.userId);

    const inactivePassword = 'InactivePass!123';
    const inactivePassHash = await hashPassword(inactivePassword);
    const inactiveDriver = await createTestUser({
      userType: 'driver',
      activeStatus: 0,
      passHash: inactivePassHash,
    });
    createdUserIds.push(inactiveDriver.userId);

    const runTag = Date.now();

    // Test 1: Unknown username uses system account fallback
    const unknownIp = `auth-login-events-${runTag}-unknown`;
    ipMarkers.push(unknownIp);
    log('TEST 1: Unknown username login logs to system account', unknownIp);
    await expectLoginFailure('missing_user_for_login_event_test', 'NopePass!123', unknownIp, 401);

    const unknownEvent = await fetchLatestLoginEventByIp(unknownIp);
    if (!unknownEvent) {
      throw new Error('Expected LoginAttempt event for unknown username flow.');
    }
    createdEventIds.push(unknownEvent.EventID);

    const unknownProps = parseProperties(unknownEvent.Properties);
    if (Number(unknownEvent.UserID) !== Number(systemAccount.UserID)) {
      throw new Error('Expected unknown username LoginAttempt to use IsSystemAccount UserID.');
    }
    if (unknownProps.result !== 'username_not_found' || unknownProps.success !== false) {
      throw new Error('Expected unknown username LoginAttempt properties to match failure contract.');
    }

    // Test 2: Wrong password logs against real user
    const wrongPasswordIpBase = `auth-login-events-${runTag}-wrong-password`;
    log('TEST 2: Wrong password logs against real user', wrongPasswordIpBase);
    await expectEventWithRetries({
      username: activeDriver.username,
      password: 'WrongPass!123',
      expectedStatus: 401,
      expectedUserId: activeDriver.userId,
      expectedResult: 'failed',
      expectedSuccess: false,
      ipBase: wrongPasswordIpBase,
      ipMarkers,
    });

    // Test 3: Successful login logs success event
    const successIpBase = `auth-login-events-${runTag}-success`;
    log('TEST 3: Successful login logs success event', successIpBase);
    await expectEventWithRetries({
      username: activeDriver.username,
      password: activePassword,
      expectedStatus: 200,
      expectedUserId: activeDriver.userId,
      expectedResult: 'success',
      expectedSuccess: true,
      ipBase: successIpBase,
      ipMarkers,
      validateResponse: (response) => {
        if (response.status !== 200 || response.data?.success !== true) {
          throw new Error('Expected successful login response payload.');
        }
      },
    });

    // Test 4: Inactive user login blocked and logged
    const inactiveIpBase = `auth-login-events-${runTag}-inactive`;
    log('TEST 4: Inactive user login remains blocked', inactiveIpBase);
    await expectEventWithRetries({
      username: inactiveDriver.username,
      password: inactivePassword,
      expectedStatus: 403,
      expectedUserId: inactiveDriver.userId,
      expectedResult: 'failed',
      expectedSuccess: false,
      ipBase: inactiveIpBase,
      ipMarkers,
      validateResponse: (response) => {
        if (response.data?.errorCode !== 'ACCOUNT_DEACTIVATED') {
          throw new Error('Expected inactive login response to return ACCOUNT_DEACTIVATED errorCode.');
        }
      },
    });

    // Test 5: System account cannot log in
    const systemIp = `auth-login-events-${runTag}-system`;
    ipMarkers.push(systemIp);
    log('TEST 5: IsSystemAccount user cannot log in', systemIp);
    await expectLoginFailure(systemAccount.Username, 'AnyPassword!123', systemIp, 401);

    const systemEvent = await fetchLatestLoginEventByIp(systemIp);
    if (!systemEvent) {
      throw new Error('Expected LoginAttempt event for system account login attempt.');
    }
    createdEventIds.push(systemEvent.EventID);

    if (Number(systemEvent.UserID) !== Number(systemAccount.UserID)) {
      throw new Error('Expected system login attempt event to reference IsSystemAccount user.');
    }

    // Guard: no test-run login events should contain UserID = 0
    const zeroCount = await countZeroUserIdEventsByIp(ipMarkers);
    if (zeroCount !== 0) {
      throw new Error(`Expected zero UserID=0 LoginAttempt events, found ${zeroCount}.`);
    }

    console.log('\nAuth login event tests completed successfully!');
  } catch (error) {
    console.error('\nAuth login event tests FAILED:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    process.exitCode = 1;
  } finally {
    await cleanupEvents(createdEventIds);
    await cleanupUsers(createdUserIds);
    await closePool();
  }
}

runTests();
