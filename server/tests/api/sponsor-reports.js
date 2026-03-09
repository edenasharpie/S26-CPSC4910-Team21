import axios from 'axios';
import { BASE_URL, log, createTestSponsor, closePool } from '../setup.js';
import { pool } from '../../src/db.js';

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
    
    // Delete drivers and sponsors
    for (const userId of createdUserIds) {
      await connection.query('DELETE FROM DRIVERS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM SPONSORS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [userId]);
      console.log(`Deleted user ${userId}`);
    }
    
    // Delete sponsor companies
    for (const sponsorId of createdSponsorIds) {
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
 * Create a test sponsor user
 */
async function createTestSponsorUser(sponsorCompanyId) {
  const connection = await pool.getConnection();
  
  try {
    const username = `testsponsor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const email = `${username}@example.com`;
    
    // Create user
    const [userResult] = await connection.query(
      `INSERT INTO USERS (Username, Email, PassHash, FirstName, LastName, UserType, ActiveStatus) 
       VALUES (?, ?, ?, ?, ?, 'sponsor', 1)`,
      [username, email, 'hash', 'Test', 'Sponsor']
    );
    
    const userId = userResult.insertId;
    
    // Create sponsor
    await connection.query(
      `INSERT INTO SPONSORS (UserID, SponsorCompanyID) VALUES (?, ?)`,
      [userId, sponsorCompanyId]
    );
    
    return userId;
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
    console.log('Starting sponsor reports endpoint tests...\n');

    // Test setup: Create sponsor companies
    log('TEST SETUP: Creating sponsor companies...', 'Setup');
    const sponsorCompany1 = await createTestSponsor({
      companyName: 'Test Sponsor Company 1 for Sponsor Reports',
      pointDollarValue: 0.01
    });
    createdSponsorIds.push(sponsorCompany1);
    
    const sponsorCompany2 = await createTestSponsor({
      companyName: 'Test Sponsor Company 2 for Sponsor Reports',
      pointDollarValue: 0.02
    });
    createdSponsorIds.push(sponsorCompany2);
    log('Created sponsor companies:', { company1: sponsorCompany1, company2: sponsorCompany2 });

    // Create sponsor users
    log('TEST SETUP: Creating sponsor users...', 'Setup');
    const sponsor1UserId = await createTestSponsorUser(sponsorCompany1);
    createdUserIds.push(sponsor1UserId);
    
    const sponsor2UserId = await createTestSponsorUser(sponsorCompany2);
    createdUserIds.push(sponsor2UserId);
    log('Created sponsor users:', { sponsor1: sponsor1UserId, sponsor2: sponsor2UserId });

    // Create test drivers
    log('TEST SETUP: Creating test drivers...', 'Setup');
    const driver1 = await createTestDriver(sponsorCompany1, `DL${Date.now()}A`);
    createdUserIds.push(driver1.userId);
    
    const driver2 = await createTestDriver(sponsorCompany1, `DL${Date.now()}B`);
    createdUserIds.push(driver2.userId);
    
    const driver3 = await createTestDriver(sponsorCompany2, `DL${Date.now()}C`);
    createdUserIds.push(driver3.userId);
    log('Created drivers:', { driver1: driver1.licenseNumber, driver2: driver2.licenseNumber, driver3: driver3.licenseNumber });

    // Create test applications
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
    
    const app6 = await createTestApplication(driver3.licenseNumber, sponsorCompany2, 'pending', 2);
    createdApplicationIds.push(app6);
    
    log('Created applications:', { total: createdApplicationIds.length });

    // Test 1: Get sponsor 1 applications report (no additional filters)
    log('TEST 1: Getting sponsor 1 applications report...', `GET /api/sponsor/${sponsor1UserId}/reports/driver-applications`);
    const sponsor1Report = await axios.get(`${BASE_URL}/api/sponsor/${sponsor1UserId}/reports/driver-applications`);
    log('Sponsor 1 applications report:', sponsor1Report.data);
    console.log('Status:', sponsor1Report.status);
    console.log('Total:', sponsor1Report.data.totalApplications, '(should be 4 for company 1)');
    console.log('Pending:', sponsor1Report.data.pendingCount);
    console.log('Accepted:', sponsor1Report.data.acceptedCount);
    console.log('Rejected:', sponsor1Report.data.rejectedCount);
    console.log('SponsorCompanyId in response:', sponsor1Report.data.sponsorCompanyId, '(should be undefined)');

    // Test 2: Get sponsor 2 applications report
    log('TEST 2: Getting sponsor 2 applications report...', `GET /api/sponsor/${sponsor2UserId}/reports/driver-applications`);
    const sponsor2Report = await axios.get(`${BASE_URL}/api/sponsor/${sponsor2UserId}/reports/driver-applications`);
    log('Sponsor 2 applications report:', sponsor2Report.data);
    console.log('Total:', sponsor2Report.data.totalApplications, '(should be 2 for company 2)');
    console.log('Pending:', sponsor2Report.data.pendingCount);
    console.log('Accepted:', sponsor2Report.data.acceptedCount);

    // Test 3: Filter by status = pending
    log('TEST 3: Getting sponsor 1 report filtered by status=pending...', `GET /api/sponsor/${sponsor1UserId}/reports/driver-applications?status=pending`);
    const pendingReport = await axios.get(`${BASE_URL}/api/sponsor/${sponsor1UserId}/reports/driver-applications`, {
      params: { status: 'pending' }
    });
    log('Pending applications report:', pendingReport.data);
    console.log('Total:', pendingReport.data.totalApplications, '(should only include pending from company 1)');
    console.log('Pending:', pendingReport.data.pendingCount);

    // Test 4: Filter by status = accepted
    log('TEST 4: Getting sponsor 1 report filtered by status=accepted...', `GET /api/sponsor/${sponsor1UserId}/reports/driver-applications?status=accepted`);
    const acceptedReport = await axios.get(`${BASE_URL}/api/sponsor/${sponsor1UserId}/reports/driver-applications`, {
      params: { status: 'accepted' }
    });
    log('Accepted applications report:', acceptedReport.data);
    console.log('Total:', acceptedReport.data.totalApplications);
    console.log('Accepted:', acceptedReport.data.acceptedCount);

    // Test 5: Filter by date range
    log('TEST 5: Getting sponsor 1 report filtered by date range...', 'GET /api/sponsor/:userId/reports/driver-applications?startDate=...&endDate=...');
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dateRangeReport = await axios.get(`${BASE_URL}/api/sponsor/${sponsor1UserId}/reports/driver-applications`, {
      params: {
        startDate: sevenDaysAgo.toISOString(),
        endDate: now.toISOString()
      }
    });
    log('Date range applications report:', dateRangeReport.data);
    console.log('Total:', dateRangeReport.data.totalApplications);
    console.log('DateRangeStart:', dateRangeReport.data.dateRangeStart);
    console.log('DateRangeEnd:', dateRangeReport.data.dateRangeEnd);

    // Test 6: Multiple filters combined
    log('TEST 6: Getting report with multiple filters...', 'GET /api/sponsor/:userId/reports/driver-applications?status=pending&startDate=...');
    const multiFilterReport = await axios.get(`${BASE_URL}/api/sponsor/${sponsor1UserId}/reports/driver-applications`, {
      params: {
        status: 'pending',
        startDate: sevenDaysAgo.toISOString()
      }
    });
    log('Multi-filter applications report:', multiFilterReport.data);
    console.log('Total:', multiFilterReport.data.totalApplications);

    // Test 7: Invalid userId
    log('TEST 7: Testing with invalid userId...', 'GET /api/sponsor/abc/reports/driver-applications');
    try {
      await axios.get(`${BASE_URL}/api/sponsor/abc/reports/driver-applications`);
      console.log('ERROR: Should have failed with 400');
    } catch (error) {
      console.log('Status:', error.response.status);
      log('Expected error response:', error.response.data);
    }

    // Test 8: Non-existent userId
    log('TEST 8: Testing with non-existent userId...', 'GET /api/sponsor/999999/reports/driver-applications');
    try {
      await axios.get(`${BASE_URL}/api/sponsor/999999/reports/driver-applications`);
      console.log('ERROR: Should have failed with 404');
    } catch (error) {
      console.log('Status:', error.response.status);
      log('Expected error response:', error.response.data);
    }

    // Test 9: Driver user trying to access sponsor endpoint
    log('TEST 9: Testing with driver userId (should fail)...', `GET /api/sponsor/${driver1.userId}/reports/driver-applications`);
    try {
      await axios.get(`${BASE_URL}/api/sponsor/${driver1.userId}/reports/driver-applications`);
      console.log('ERROR: Should have failed with 403');
    } catch (error) {
      console.log('Status:', error.response.status);
      log('Expected error response:', error.response.data);
    }

    // Test 10: Invalid status validation
    log('TEST 10: Testing invalid status validation...', 'GET /api/sponsor/:userId/reports/driver-applications?status=invalid');
    try {
      await axios.get(`${BASE_URL}/api/sponsor/${sponsor1UserId}/reports/driver-applications`, {
        params: { status: 'invalid' }
      });
      console.log('ERROR: Should have failed with 400');
    } catch (error) {
      console.log('Status:', error.response.status);
      log('Expected error response:', error.response.data);
    }

    // Test 11: Invalid date format validation
    log('TEST 11: Testing invalid date format validation...', 'GET /api/sponsor/:userId/reports/driver-applications?startDate=invalid-date');
    try {
      await axios.get(`${BASE_URL}/api/sponsor/${sponsor1UserId}/reports/driver-applications`, {
        params: { startDate: 'invalid-date' }
      });
      console.log('ERROR: Should have failed with 400');
    } catch (error) {
      console.log('Status:', error.response.status);
      log('Expected error response:', error.response.data);
    }

    // Test 12: Verify sponsor can't see other sponsor's data
    log('TEST 12: Verifying data isolation between sponsors...', 'Comparing sponsor 1 and sponsor 2 reports');
    console.log('Sponsor 1 total:', sponsor1Report.data.totalApplications);
    console.log('Sponsor 2 total:', sponsor2Report.data.totalApplications);
    console.log('These should be different and match their respective company applications');

    console.log('\n' + '='.repeat(50));
    console.log('All sponsor reports tests completed successfully!');
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
