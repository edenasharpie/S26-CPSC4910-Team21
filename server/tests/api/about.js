import axios from 'axios';
import { BASE_URL, log, closePool } from '../setup.js';

const API_URL = `${BASE_URL}/api/about`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAboutWithRetry(maxAttempts = 8, retryMs = 1000) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await axios.get(API_URL);
    } catch (error) {
      lastError = error;

      const networkError = !error?.response;
      if (!networkError || attempt === maxAttempts) {
        throw error;
      }

      console.log(`About endpoint not reachable yet (attempt ${attempt}/${maxAttempts}), retrying...`);
      await sleep(retryMs);
    }
  }

  throw lastError;
}

async function runTests() {
  try {
    console.log('Starting about endpoint tests...\n');

    log('TEST 1: Fetching metadata record...', `GET ${API_URL}`);
    const response = await fetchAboutWithRetry();
    log('Metadata response:', response.data);

    if (response.status !== 200) {
      throw new Error(`Expected status 200, received ${response.status}`);
    }

    if (!response.data || typeof response.data !== 'object') {
      throw new Error('Expected metadata object response body.');
    }

    if (!response.data.ProductName) {
      throw new Error('Expected metadata response to include ProductName.');
    }

    console.log('\nAll about endpoint tests passed successfully.');
  } catch (error) {
    console.error('\nAbout endpoint tests failed.');
    if (error?.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error?.message ?? error);
      if (error?.stack) {
        console.error('Stack:', error.stack);
      }
    }
    process.exitCode = 1;
  } finally {
    await closePool();
    process.exit(process.exitCode ?? 0);
  }
}

runTests();
