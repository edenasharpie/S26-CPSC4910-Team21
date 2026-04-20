import axios from 'axios';

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const API_BASE_URL = `${BASE_URL}/api`;
const TEST_ORIGIN = process.env.TEST_CLIENT_ORIGIN || 'http://localhost:5173';

function getHeader(headers, name) {
  return headers?.[name.toLowerCase()];
}

async function assertPreflight(path, method, label) {
  const response = await axios.options(`${API_BASE_URL}${path}`, {
    headers: {
      Origin: TEST_ORIGIN,
      'Access-Control-Request-Method': method,
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

  const allowCredentials = String(getHeader(response.headers, 'access-control-allow-credentials') || '').toLowerCase();
  if (allowCredentials !== 'true') {
    throw new Error(`${label} expected allow-credentials true, got ${String(allowCredentials)}`);
  }

  const allowMethods = String(getHeader(response.headers, 'access-control-allow-methods') || '').toUpperCase();
  if (!allowMethods.includes(method)) {
    throw new Error(`${label} expected allow-methods to include ${method}, got ${allowMethods}`);
  }
}

async function runTests() {
  try {
    console.log('Starting catalog/review CORS API tests...\n');

    await assertPreflight(
      '/admin/catalogs',
      'GET',
      'Admin catalogs preflight'
    );

    await assertPreflight(
      '/sponsor/999999/catalogs',
      'GET',
      'Sponsor catalogs preflight'
    );

    await assertPreflight(
      '/driver/999999/catalogs',
      'GET',
      'Driver catalogs preflight'
    );

    await assertPreflight(
      '/sponsor/999999/reviews',
      'GET',
      'Sponsor reviews preflight'
    );

    await assertPreflight(
      '/driver/999999/reviews',
      'GET',
      'Driver reviews preflight'
    );

    await assertPreflight(
      '/sponsor/999999/reviews/1/visibility',
      'PATCH',
      'Sponsor review visibility preflight'
    );

    console.log('Catalog/review CORS API tests completed successfully!');
  } catch (error) {
    console.error('\nCatalog/review CORS API tests failed:');
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
