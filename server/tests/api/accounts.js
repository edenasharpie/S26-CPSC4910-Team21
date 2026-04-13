import axios from 'axios';
import { BASE_URL, log, closePool } from '../setup.js';

const API_URL = `${BASE_URL}/api/accounts/admin-list`;

async function runTests() {
  try {
    console.log('Starting accounts endpoint tests...\n');

    log('TEST 1: Fetching admin list data...', `GET ${API_URL}`);
    const response = await axios.get(API_URL);
    log('Admin list response summary:', {
      status: response.status,
      isArray: Array.isArray(response.data),
      count: Array.isArray(response.data) ? response.data.length : null,
    });

    if (response.status !== 200) {
      throw new Error(`Expected status 200, received ${response.status}`);
    }

    if (!Array.isArray(response.data)) {
      throw new Error('Expected /admin-list to return an array.');
    }

    if (response.data.length > 0) {
      const sample = response.data[0];
      if (!Object.prototype.hasOwnProperty.call(sample, 'UserID')) {
        throw new Error('Expected returned rows to include UserID.');
      }
    }

    console.log('\nAll accounts endpoint tests passed successfully.');
  } catch (error) {
    console.error('\nAccounts endpoint tests failed.');
    if (error?.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    process.exitCode = 1;
  } finally {
    await closePool();
    process.exit(process.exitCode ?? 0);
  }
}

runTests();
