import axios from 'axios';
import { BASE_URL, log, closePool } from '../setup.js';

const API_URL = `${BASE_URL}/api/admin/settings/1`;

async function expectFailure(requestFactory, expectedStatus, messageIncludes) {
  try {
    await requestFactory();
    throw new Error(`Expected status ${expectedStatus}, but request succeeded.`);
  } catch (error) {
    const status = error?.response?.status;
    const responseError = error?.response?.data?.error;

    if (status !== expectedStatus) {
      throw new Error(`Expected status ${expectedStatus}, received ${status ?? 'unknown'}.`);
    }

    if (messageIncludes && !String(responseError ?? '').includes(messageIncludes)) {
      throw new Error(`Expected error message to include "${messageIncludes}", received "${responseError}".`);
    }
  }
}

async function runTests() {
  let baselineSettings = null;

  try {
    console.log('Starting admin settings endpoint tests...\n');

    log('TEST 1: Fetching baseline settings...', `GET ${API_URL}`);
    const baselineResponse = await axios.get(API_URL);
    baselineSettings = baselineResponse.data;
    log('Baseline settings:', baselineSettings);

    log('TEST 2: Updating settings with valid values...', `POST ${API_URL}`);
    const updateResponse = await axios.post(API_URL, {
      auditLogRetentionDays: 730,
      userDataRetentionDays: 180,
    });
    log('Update response:', updateResponse.data);

    log('TEST 3: Verifying persistence after update...', `GET ${API_URL}`);
    const verifyResponse = await axios.get(API_URL);
    log('Settings after update:', verifyResponse.data);

    if (verifyResponse.data.auditLogRetentionDays !== 730 || verifyResponse.data.userDataRetentionDays !== 180) {
      throw new Error('Retention settings were not persisted after update.');
    }

    log('TEST 4: Missing userDataRetentionDays should return 400...', `POST ${API_URL}`);
    await expectFailure(
      () => axios.post(API_URL, { auditLogRetentionDays: 365 }),
      400,
      'userDataRetentionDays'
    );

    log('TEST 5: Invalid type should return 400...', `POST ${API_URL}`);
    await expectFailure(
      () => axios.post(API_URL, {
        auditLogRetentionDays: 'invalid',
        userDataRetentionDays: 90,
      }),
      400,
      'auditLogRetentionDays'
    );

    log('TEST 6: Out-of-range value should return 400...', `POST ${API_URL}`);
    await expectFailure(
      () => axios.post(API_URL, {
        auditLogRetentionDays: 0,
        userDataRetentionDays: 90,
      }),
      400,
      'between'
    );

    log('TEST 7: Numeric string payload should be accepted...', `POST ${API_URL}`);
    const stringPayloadResponse = await axios.post(API_URL, {
      auditLogRetentionDays: '365',
      userDataRetentionDays: '90',
    });
    log('String payload response:', stringPayloadResponse.data);

    console.log('\nAll admin settings tests passed successfully.');
  } catch (error) {
    console.error('\nAdmin settings tests failed.');
    if (error?.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    process.exitCode = 1;
  } finally {
    if (baselineSettings && Number.isInteger(baselineSettings.auditLogRetentionDays) && Number.isInteger(baselineSettings.userDataRetentionDays)) {
      try {
        await axios.post(API_URL, {
          auditLogRetentionDays: baselineSettings.auditLogRetentionDays,
          userDataRetentionDays: baselineSettings.userDataRetentionDays,
        });
        console.log('Baseline admin settings restored.');
      } catch (restoreError) {
        console.error('Failed to restore baseline settings:', restoreError?.response?.data ?? restoreError.message);
      }
    }

    await closePool();
    process.exit(process.exitCode ?? 0);
  }
}

runTests();
