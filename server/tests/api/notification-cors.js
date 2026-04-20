import axios from 'axios';

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const API_BASE_URL = `${BASE_URL}/api`;
const TEST_ORIGIN = process.env.TEST_CLIENT_ORIGIN || 'http://localhost:5173';

function getHeader(headers, name) {
  return headers?.[name.toLowerCase()];
}

async function assertNotificationPreflight(path, label) {
  const response = await axios.options(`${API_BASE_URL}${path}`, {
    headers: {
      Origin: TEST_ORIGIN,
      'Access-Control-Request-Method': 'PATCH',
      'Access-Control-Request-Headers': 'content-type',
    },
    validateStatus: () => true,
  });

  if (response.status !== 204) {
    throw new Error(`${label} expected status 204, got ${response.status}`);
  }

  const allowOrigin = getHeader(response.headers, 'access-control-allow-origin');
  if (allowOrigin !== TEST_ORIGIN) {
    throw new Error(`${label} expected allow-origin ${TEST_ORIGIN}, got ${String(allowOrigin)}`);
  }

  if (allowOrigin === '*') {
    throw new Error(`${label} expected non-wildcard allow-origin for credentialed requests`);
  }

  const allowCredentials = getHeader(response.headers, 'access-control-allow-credentials');
  if (String(allowCredentials).toLowerCase() !== 'true') {
    throw new Error(`${label} expected allow-credentials true, got ${String(allowCredentials)}`);
  }

  const allowMethods = String(getHeader(response.headers, 'access-control-allow-methods') || '').toUpperCase();
  if (!allowMethods.includes('PATCH')) {
    throw new Error(`${label} expected allow-methods to include PATCH, got ${allowMethods}`);
  }
}

async function runTests() {
  try {
    console.log('Starting notification CORS API tests...\n');

    await assertNotificationPreflight(
      '/driver/999999/notifications/read-all',
      'Driver notifications preflight'
    );

    await assertNotificationPreflight(
      '/drivers/999999/notifications/read-all',
      'Drivers notifications preflight (plural alias)'
    );

    await assertNotificationPreflight(
      '/sponsors/999999/notifications/read-all',
      'Sponsor notifications preflight'
    );

    await assertNotificationPreflight(
      '/driver/999999/notifications/123/read',
      'Driver single-read preflight'
    );

    await assertNotificationPreflight(
      '/drivers/999999/notifications/123/read',
      'Drivers single-read preflight (plural alias)'
    );

    await assertNotificationPreflight(
      '/sponsors/999999/notifications/123/read',
      'Sponsor single-read preflight'
    );

    console.log('Notification CORS API tests completed successfully!');
  } catch (error) {
    console.error('\nNotification CORS API tests failed:');
    if (error?.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error?.message ?? error);
    }
    process.exitCode = 1;
  } finally {
    process.exit(process.exitCode ?? 0);
  }
}

runTests();
