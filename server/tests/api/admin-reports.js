import axios from 'axios';
import { BASE_URL, log, createTestSponsor, closePool } from '../setup.js';
import { pool } from '../../src/db.js';

const API_URL = `${BASE_URL}/api/admin/reports`;

// Track created resources for cleanup
const createdUserIds = [];
const createdSponsorIds = [];
const createdApplicationIds = [];

/**
 * Cleanup created test data
 */
async function cleanupTestData() {
  const connection = await pool.getConnection();
  
  try {
    // Delete applications
    for (const appId of createdApplicationIds) {
      await connection.query('DELETE FROM DRIVER_APPLICATIONS WHERE ApplicationID = ?', [appId]);
      console.log(`Deleted application ${appId}`);
    }
    
    // Delete drivers
    for (const userId of createdUserIds) {
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
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [userId]);
      console.log(`Deleted user ${userId}`);
    }
    
    // Delete sponsor companies
    for (const sponsorId of createdSponsorIds) {
      try {
        await connection.query('DELETE FROM DRIVER_COMPANY_ENROLLMENT WHERE SponsorCompanyID = ?', [sponsorId]);
      } catch (error) {
        if (error?.code !== 'ER_NO_SUCH_TABLE' && error?.code !== 'ER_BAD_FIELD_ERROR') {
          throw error;
        }
      }
      await connection.query('DELETE FROM SPONSOR_COMPANIES WHERE SponsorCompanyID = ?', [sponsorId]);
      console.log(`Deleted sponsor company ${sponsorId}`);
    }
  } catch (error) {
    console.error('Error cleaning up test data:', error.message);
  } finally {
    connection.release();
  }
}

/**
 * Create a test driver user
 */
async function createTestDriver(sponsorCompanyId, licenseNumber) {
  const connection = await pool.getConnection();
  
  try {
    const username = `testdriver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const email = `${username}@example.com`;
    
    // Create user
    const [userResult] = await connection.query(
      `INSERT INTO USERS (Username, Email, PassHash, FirstName, LastName, UserType, ActiveStatus) 
       VALUES (?, ?, ?, ?, ?, 'driver', 1)`,
      [username, email, 'hash', 'Test', 'Driver']
    );
    
    const userId = userResult.insertId;
    
    // Create driver
    await connection.query(
      `INSERT INTO DRIVERS (LicenseNumber, UserID, SponsorCompanyID, PointBalance, PerformanceStatus, AlertPoints, AlertOrders) 
       VALUES (?, ?, ?, 100, 'good', 1, 1)`,
      [licenseNumber, userId, sponsorCompanyId]
    );
    
    return { userId, licenseNumber };
  } finally {
    connection.release();
  }
}

/**
 * Create a test driver application
 */
async function createTestApplication(driverLicense, sponsorCompanyId, status, daysAgo = 0) {
  const connection = await pool.getConnection();
  
  try {
    const timeSubmitted = new Date();
    timeSubmitted.setDate(timeSubmitted.getDate() - daysAgo);
    const timeSubmittedStr = timeSubmitted.toISOString().slice(0, 19).replace('T', ' ');
    
    const [result] = await connection.query(
      `INSERT INTO DRIVER_APPLICATIONS (DriverID, SponsorCompanyID, ApplicationStatus, DecisionExplanation, TimeSubmitted) 
       VALUES (?, ?, ?, 'Test application', ?)`,
      [driverLicense, sponsorCompanyId, status, timeSubmittedStr]
    );
    
    return result.insertId;
  } finally {
    connection.release();
  }
}

async function runTests() {
  try {
    console.log('Starting admin reports endpoint tests...\n');

    // Test setup: Create sponsor companies
    log('TEST SETUP: Creating sponsor companies...', 'Setup');
    const sponsorCompany1 = await createTestSponsor({
      companyName: 'Test Sponsor Company 1 for Reports',
      pointDollarValue: 0.01
    });
    createdSponsorIds.push(sponsorCompany1);
    
    const sponsorCompany2 = await createTestSponsor({
      companyName: 'Test Sponsor Company 2 for Reports',
      pointDollarValue: 0.02
    });
    createdSponsorIds.push(sponsorCompany2);
    log('Created sponsor companies:', { company1: sponsorCompany1, company2: sponsorCompany2 });

    // Create test drivers
    log('TEST SETUP: Creating test drivers...', 'Setup');
    const driver1 = await createTestDriver(sponsorCompany1, `DL${Date.now()}A`);
    createdUserIds.push(driver1.userId);
    
    const driver2 = await createTestDriver(sponsorCompany1, `DL${Date.now()}B`);
    createdUserIds.push(driver2.userId);
    
    const driver3 = await createTestDriver(sponsorCompany2, `DL${Date.now()}C`);
    createdUserIds.push(driver3.userId);
    log('Created drivers:', { driver1: driver1.licenseNumber, driver2: driver2.licenseNumber, driver3: driver3.licenseNumber });

    // Create test applications with different statuses and dates
    log('TEST SETUP: Creating test applications...', 'Setup');
    
    // Company 1 applications
    const app1 = await createTestApplication(driver1.licenseNumber, sponsorCompany1, 'pending', 5);
    createdApplicationIds.push(app1);
    
    const app2 = await createTestApplication(driver1.licenseNumber, sponsorCompany1, 'accepted', 10);
    createdApplicationIds.push(app2);
    
    const app3 = await createTestApplication(driver2.licenseNumber, sponsorCompany1, 'rejected', 15);
    createdApplicationIds.push(app3);
    
    const app4 = await createTestApplication(driver2.licenseNumber, sponsorCompany1, 'pending', 1);
    createdApplicationIds.push(app4);
    
    // Company 2 applications
    const app5 = await createTestApplication(driver3.licenseNumber, sponsorCompany2, 'accepted', 3);
    createdApplicationIds.push(app5);
    
    log('Created applications:', { total: createdApplicationIds.length });

    // Test 1: Get all driver applications report (no filters)
    log('TEST 1: Getting all driver applications report...', 'GET /api/admin/reports/driver-applications');
    const allAppsReport = await axios.get(`${API_URL}/driver-applications`);
    log('All applications report:', allAppsReport.data);
    console.log('Status:', allAppsReport.status);
    console.log('Total:', allAppsReport.data.totalApplications);
    console.log('Pending:', allAppsReport.data.pendingCount);
    console.log('Accepted:', allAppsReport.data.acceptedCount);
    console.log('Rejected:', allAppsReport.data.rejectedCount);

    // Test 2: Filter by status = pending
    log('TEST 2: Getting report filtered by status=pending...', 'GET /api/admin/reports/driver-applications?status=pending');
    const pendingReport = await axios.get(`${API_URL}/driver-applications`, {
      params: { status: 'pending' }
    });
    log('Pending applications report:', pendingReport.data);
    console.log('Total:', pendingReport.data.totalApplications);
    console.log('Pending:', pendingReport.data.pendingCount);

    // Test 3: Filter by status = accepted
    log('TEST 3: Getting report filtered by status=accepted...', 'GET /api/admin/reports/driver-applications?status=accepted');
    const acceptedReport = await axios.get(`${API_URL}/driver-applications`, {
      params: { status: 'accepted' }
    });
    log('Accepted applications report:', acceptedReport.data);
    console.log('Total:', acceptedReport.data.totalApplications);
    console.log('Accepted:', acceptedReport.data.acceptedCount);

    // Test 4: Filter by sponsor company
    log('TEST 4: Getting report filtered by sponsorCompanyId...', `GET /api/admin/reports/driver-applications?sponsorCompanyId=${sponsorCompany1}`);
    const company1Report = await axios.get(`${API_URL}/driver-applications`, {
      params: { sponsorCompanyId: sponsorCompany1 }
    });
    log('Company 1 applications report:', company1Report.data);
    console.log('Total:', company1Report.data.totalApplications);
    console.log('SponsorCompanyId:', company1Report.data.sponsorCompanyId);

    // Test 5: Filter by driver ID
    log('TEST 5: Getting report filtered by driverId...', `GET /api/admin/reports/driver-applications?driverId=${driver1.licenseNumber}`);
    const driver1Report = await axios.get(`${API_URL}/driver-applications`, {
      params: { driverId: driver1.licenseNumber }
    });
    log('Driver 1 applications report:', driver1Report.data);
    console.log('Total:', driver1Report.data.totalApplications);
    console.log('DriverId:', driver1Report.data.driverId);

    // Test 6: Filter by date range
    log('TEST 6: Getting report filtered by date range...', 'GET /api/admin/reports/driver-applications?startDate=...&endDate=...');
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dateRangeReport = await axios.get(`${API_URL}/driver-applications`, {
      params: {
        startDate: sevenDaysAgo.toISOString(),
        endDate: now.toISOString()
      }
    });
    log('Date range applications report:', dateRangeReport.data);
    console.log('Total:', dateRangeReport.data.totalApplications);
    console.log('DateRangeStart:', dateRangeReport.data.dateRangeStart);
    console.log('DateRangeEnd:', dateRangeReport.data.dateRangeEnd);

    // Test 7: Multiple filters combined
    log('TEST 7: Getting report with multiple filters...', 'GET /api/admin/reports/driver-applications?status=pending&sponsorCompanyId=...');
    const multiFilterReport = await axios.get(`${API_URL}/driver-applications`, {
      params: {
        status: 'pending',
        sponsorCompanyId: sponsorCompany1
      }
    });
    log('Multi-filter applications report:', multiFilterReport.data);
    console.log('Total:', multiFilterReport.data.totalApplications);

    // Test 8: Invalid status validation
    log('TEST 8: Testing invalid status validation...', 'GET /api/admin/reports/driver-applications?status=invalid');
    try {
      await axios.get(`${API_URL}/driver-applications`, {
        params: { status: 'invalid' }
      });
      console.log('ERROR: Should have failed with 400');
    } catch (error) {
      console.log('Status:', error.response.status);
      log('Expected error response:', error.response.data);
    }

    // Test 9: Invalid sponsorCompanyId validation
    log('TEST 9: Testing invalid sponsorCompanyId validation...', 'GET /api/admin/reports/driver-applications?sponsorCompanyId=abc');
    try {
      await axios.get(`${API_URL}/driver-applications`, {
        params: { sponsorCompanyId: 'abc' }
      });
      console.log('ERROR: Should have failed with 400');
    } catch (error) {
      console.log('Status:', error.response.status);
      log('Expected error response:', error.response.data);
    }

    // Test 10: Invalid date format validation
    log('TEST 10: Testing invalid date format validation...', 'GET /api/admin/reports/driver-applications?startDate=invalid-date');
    try {
      await axios.get(`${API_URL}/driver-applications`, {
        params: { startDate: 'invalid-date' }
      });
      console.log('ERROR: Should have failed with 400');
    } catch (error) {
      console.log('Status:', error.response.status);
      log('Expected error response:', error.response.data);
    }

    // Test 11: Empty result set (future date filter)
    log('TEST 11: Getting report with no matching applications...', 'GET /api/admin/reports/driver-applications?startDate=future');
    const futureDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    const emptyReport = await axios.get(`${API_URL}/driver-applications`, {
      params: { startDate: futureDate.toISOString() }
    });
    log('Empty report:', emptyReport.data);
    console.log('Total:', emptyReport.data.totalApplications);
    console.log('All counts should be 0');

    console.log('\n' + '='.repeat(50));
    console.log('All admin reports tests completed successfully!');
    console.log('='.repeat(50));

  } catch (error) {
    console.error('\n' + '='.repeat(50));
    console.error('TEST FAILED:');
    console.error('='.repeat(50));
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  } finally {
    // Cleanup
    console.log('\nCleaning up test data...');
    await cleanupTestData();
    await closePool();
  }
}

// Run tests
runTests();
