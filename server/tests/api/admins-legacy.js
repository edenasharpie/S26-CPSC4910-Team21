import axios from 'axios';
import { BASE_URL, log, closePool } from '../setup.js';

const INVOICES_URL = `${BASE_URL}/api/admin/invoices`;
const DRIVER_REPORT_URL = `${BASE_URL}/api/admin/driver-report`;

async function expectArrayOrHandledError(requestFactory, contextLabel) {
  try {
    const response = await requestFactory();
    if (response.status !== 200 || !Array.isArray(response.data)) {
      throw new Error(`${contextLabel}: expected 200 array response.`);
    }

    return { status: 200, rows: response.data.length };
  } catch (error) {
    const status = error?.response?.status;
    const body = error?.response?.data;

    if (status === 500 && body && typeof body === 'object' && body.error) {
      return { status, error: body.error };
    }

    throw error;
  }
}

async function runTests() {
  try {
    console.log('Starting admins legacy endpoint tests...\n');

    log('TEST 1: Fetching invoices report...', `GET ${INVOICES_URL}`);
    const invoicesResult = await expectArrayOrHandledError(
      () => axios.get(INVOICES_URL),
      'Invoices endpoint'
    );
    log('Invoices result:', invoicesResult);

    log('TEST 2: Fetching driver report with date window...', `GET ${DRIVER_REPORT_URL}/1`);
    const driverReportResult = await expectArrayOrHandledError(
      () => axios.get(`${DRIVER_REPORT_URL}/1`, {
        params: {
          startDate: '2024-01-01 00:00:00',
          endDate: '2030-01-01 00:00:00',
        },
      }),
      'Driver report endpoint'
    );
    log('Driver report result:', driverReportResult);

    console.log('\nAll admins legacy endpoint tests passed successfully.');
  } catch (error) {
    console.error('\nAdmins legacy endpoint tests failed.');
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
