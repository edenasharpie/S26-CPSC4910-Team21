import axios from 'axios';
import { BASE_URL, log, createTestSponsor, cleanupSponsorCompanies, closePool } from '../setup.js';
import { pool } from '../../src/db.js';

const API_URL = `${BASE_URL}/api/admin/users`;

// track created resources for cleanup
const createdUserIds = [];
const createdSponsorIds = [];

/**
 * Cleanup created users and their role-specific records
 */
async function cleanupUsers(userIds) {
  if (!userIds || userIds.length === 0) return;
  
  const connection = await pool.getConnection();
  
  try {
    for (const id of userIds) {
      // Delete role-specific records first (foreign key constraints)
      try {
        await connection.query(
          'DELETE FROM DRIVER_COMPANY_ENROLLMENT WHERE DriverID IN (SELECT LicenseNumber FROM DRIVERS WHERE UserID = ?)',
          [id]
        );
      } catch (error) {
        if (error?.code !== 'ER_NO_SUCH_TABLE' && error?.code !== 'ER_BAD_FIELD_ERROR') {
          throw error;
        }
      }
      await connection.query('DELETE FROM DRIVERS WHERE UserID = ?', [id]);
      await connection.query('DELETE FROM SPONSORS WHERE UserID = ?', [id]);
      await connection.query('DELETE FROM ADMINS WHERE UserID = ?', [id]);
      // Delete user
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [id]);
      console.log(`Deleted user ${id}`);
    }
  } catch (error) {
    console.error('Error cleaning up users:', error.message);
  } finally {
    connection.release();
  }
}

async function runTests() {
  try {
    console.log('Starting admin users endpoint tests...\n');

    // test setup: create a sponsor company for testing driver and sponsor creation
    log('TEST SETUP: Creating sponsor company...', 'Setup');
    const sponsorCompanyId = await createTestSponsor({
      companyName: 'Test Sponsor Company for Users',
      pointDollarValue: 0.01
    });
    createdSponsorIds.push(sponsorCompanyId);
    log('Created sponsor company:', { id: sponsorCompanyId, companyName: 'Test Sponsor Company for Users' });

    // test 1: create a driver user
    log('TEST 1: Creating driver user...', 'POST /api/admin/users');
    const createDriverResponse = await axios.post(API_URL, {
      username: `testdriver_${Date.now()}`,
      email: `testdriver_${Date.now()}@example.com`,
      phone: '+1234567890',
      password: 'TestPassword123!',
      firstName: 'John',
      middleName: 'D',
      lastName: 'Doe',
      pronouns: 'he/him',
      bio: 'Test driver bio',
      userType: 'driver',
      activeStatus: 1,
      licenseNumber: `DL${Date.now()}`,
      sponsorCompanyId: sponsorCompanyId,
      performanceStatus: 'excellent',
      alertPoints: 1,
      alertOrders: 1
    });
    const driverId = createDriverResponse.data.id;
    createdUserIds.push(driverId);
    log('Created driver user:', createDriverResponse.data);
    console.log('Status:', createDriverResponse.status);

    // test 2: create a sponsor user
    log('TEST 2: Creating sponsor user...', 'POST /api/admin/users');
    const createSponsorResponse = await axios.post(API_URL, {
      username: `testsponsor_${Date.now()}`,
      email: `testsponsor_${Date.now()}@example.com`,
      firstName: 'Jane',
      lastName: 'Smith',
      userType: 'sponsor',
      sponsorCompanyId: sponsorCompanyId
    });
    const sponsorId = createSponsorResponse.data.id;
    createdUserIds.push(sponsorId);
    log('Created sponsor user:', createSponsorResponse.data);
    console.log('Status:', createSponsorResponse.status);

    // test 3: create an admin user
    log('TEST 3: Creating admin user...', 'POST /api/admin/users');
    const createAdminResponse = await axios.post(API_URL, {
      username: `testadmin_${Date.now()}`,
      email: `testadmin_${Date.now()}@example.com`,
      firstName: 'Admin',
      lastName: 'User',
      userType: 'admin',
      activeStatus: 1
    });
    const adminId = createAdminResponse.data.id;
    createdUserIds.push(adminId);
    log('Created admin user:', createAdminResponse.data);
    console.log('Status:', createAdminResponse.status);

    // test 3b: create a pagination probe dataset and verify users are discoverable across pages
    const paginationProbePrefix = `pg${Date.now().toString().slice(-6)}`;
    const paginationProbeIds = [];
    for (let i = 0; i < 21; i += 1) {
      const probeUsername = `${paginationProbePrefix}_${i}`;
      const probeEmail = `${paginationProbePrefix}${i}@ex.com`;

      const probeResponse = await axios.post(API_URL, {
        username: probeUsername,
        email: probeEmail,
        firstName: 'Page',
        lastName: `Probe${i}`,
        userType: 'admin',
        activeStatus: 1,
      });

      paginationProbeIds.push(probeResponse.data.id);
      createdUserIds.push(probeResponse.data.id);
    }

    log('TEST 3b: Validating pagination dataset across pages...', 'GET /api/admin/users with search+limit+offset');
    const probePage1 = await axios.get(API_URL, {
      params: {
        search: paginationProbePrefix,
        activeStatus: 'all',
        limit: 10,
        offset: 0,
      },
    });

    const probePage2 = await axios.get(API_URL, {
      params: {
        search: paginationProbePrefix,
        activeStatus: 'all',
        limit: 10,
        offset: 10,
      },
    });

    const probePage3 = await axios.get(API_URL, {
      params: {
        search: paginationProbePrefix,
        activeStatus: 'all',
        limit: 10,
        offset: 20,
      },
    });

    const discoveredProbeUserIds = new Set([
      ...probePage1.data.users,
      ...probePage2.data.users,
      ...probePage3.data.users,
    ].map((user) => Number(user.UserID)));

    if (Number(probePage1.data.totalCount) !== paginationProbeIds.length) {
      throw new Error(
        `Expected pagination probe totalCount ${paginationProbeIds.length}, got ${probePage1.data.totalCount}`
      );
    }

    if (discoveredProbeUserIds.size !== paginationProbeIds.length) {
      throw new Error(
        `Expected to discover ${paginationProbeIds.length} pagination probe users across pages, got ${discoveredProbeUserIds.size}`
      );
    }

    if (probePage3.data.users.length < 1) {
      throw new Error('Expected at least one result on page 3 of pagination probe dataset');
    }

    // test 4: get all users with pagination
    log('TEST 4: Fetching all users with default pagination...', 'GET /api/admin/users');
    const allUsersResponse = await axios.get(API_URL, {
      params: {
        limit: 10,
        offset: 0
      }
    });
    log('All users (paginated):', {
      totalCount: allUsersResponse.data.totalCount,
      limit: allUsersResponse.data.limit,
      offset: allUsersResponse.data.offset,
      userCount: allUsersResponse.data.users.length
    });

    // test 5: filter users by userType
    log('TEST 5: Filtering users by userType=driver...', 'GET /api/admin/users?userType=driver');
    const driverUsersResponse = await axios.get(API_URL, {
      params: {
        userType: 'driver',
        limit: 10,
        offset: 0
      }
    });
    log('Filtered driver users:', {
      totalCount: driverUsersResponse.data.totalCount,
      userCount: driverUsersResponse.data.users.length
    });

    // test 6: filter users by activeStatus
    log('TEST 6: Filtering users by activeStatus=1...', 'GET /api/admin/users?activeStatus=1');
    const activeUsersResponse = await axios.get(API_URL, {
      params: {
        activeStatus: 1,
        limit: 10,
        offset: 0
      }
    });
    log('Filtered active users:', {
      totalCount: activeUsersResponse.data.totalCount,
      userCount: activeUsersResponse.data.users.length
    });

    // test 7: search users by name
    log('TEST 7: Searching users by firstName...', 'GET /api/admin/users?search=John');
    const searchUsersResponse = await axios.get(API_URL, {
      params: {
        search: 'John',
        limit: 10,
        offset: 0
      }
    });
    log('Search results:', {
      totalCount: searchUsersResponse.data.totalCount,
      userCount: searchUsersResponse.data.users.length
    });

    // test 8: get specific user by ID
    log('TEST 8: Fetching specific driver user by ID...', `GET /api/admin/users/${driverId}`);
    const userByIdResponse = await axios.get(`${API_URL}/${driverId}`);
    log('User details:', userByIdResponse.data);

    // test 9: update driver user profile
    log('TEST 9: Updating driver user profile...', `PATCH /api/admin/users/${driverId}`);
    const updateDriverResponse = await axios.patch(`${API_URL}/${driverId}`, {
      firstName: 'Updated John',
      bio: 'Updated bio for test driver',
      performanceStatus: 'good',
      alertPoints: 0
    });
    log('Updated driver user:', updateDriverResponse.data);

    // test 10: update sponsor user profile
    log('TEST 10: Updating sponsor user profile...', `PATCH /api/admin/users/${sponsorId}`);
    const updateSponsorResponse = await axios.patch(`${API_URL}/${sponsorId}`, {
      lastName: 'Updated Smith',
      phone: '+9876543210'
    });
    log('Updated sponsor user:', updateSponsorResponse.data);

    // test 11: get updated user to verify changes
    log('TEST 11: Verifying updated user...', `GET /api/admin/users/${driverId}`);
    const verifyUpdateResponse = await axios.get(`${API_URL}/${driverId}`);
    log('Verified updated user:', {
      firstName: verifyUpdateResponse.data.firstName,
      bio: verifyUpdateResponse.data.bio
    });

    // test 12: soft delete user (set ActiveStatus = 0)
    log('TEST 12: Soft deleting admin user...', `DELETE /api/admin/users/${adminId}`);
    const deleteResponse = await axios.delete(`${API_URL}/${adminId}`);
    log('Soft delete successful', { status: deleteResponse.status });

    // test 13: verify soft delete - user should be inactive
    log('TEST 13: Verifying soft delete...', `GET /api/admin/users/${adminId}`);
    const deletedUserResponse = await axios.get(`${API_URL}/${adminId}`);
    log('Deleted user status:', {
      id: deletedUserResponse.data.id,
      activeStatus: deletedUserResponse.data.activeStatus,
      message: deletedUserResponse.data.activeStatus === 0 ? 'Successfully deactivated' : 'Still active'
    });

    // test 14: filter inactive users
    log('TEST 14: Filtering users by activeStatus=0...', 'GET /api/admin/users?activeStatus=0');
    const inactiveUsersResponse = await axios.get(API_URL, {
      params: {
        activeStatus: 0,
        limit: 10,
        offset: 0
      }
    });
    log('Filtered inactive users:', {
      totalCount: inactiveUsersResponse.data.totalCount,
      userCount: inactiveUsersResponse.data.users.length
    });

    // test 15: test validation - missing required fields for driver
    log('TEST 15: Testing validation - missing licenseNumber for driver...', 'POST /api/admin/users');
    try {
      await axios.post(API_URL, {
        username: `invaliddriver_${Date.now()}`,
        email: `invaliddriver_${Date.now()}@example.com`,
        firstName: 'Invalid',
        lastName: 'Driver',
        userType: 'driver',
        // missing licenseNumber and performanceStatus
      });
      console.log('ERROR: Should have failed validation');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        log('Validation correctly failed:', {
          status: error.response.status,
          error: error.response.data.error
        });
      } else {
        throw error;
      }
    }

    // test 16: test validation - missing required fields for sponsor
    log('TEST 16: Testing validation - missing sponsorCompanyId for sponsor...', 'POST /api/admin/users');
    try {
      await axios.post(API_URL, {
        username: `invalidsponsor_${Date.now()}`,
        email: `invalidsponsor_${Date.now()}@example.com`,
        firstName: 'Invalid',
        lastName: 'Sponsor',
        userType: 'sponsor',
        // missing sponsorCompanyId
      });
      console.log('ERROR: Should have failed validation');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        log('Validation correctly failed:', {
          status: error.response.status,
          error: error.response.data.error
        });
      } else {
        throw error;
      }
    }

    // test 17: test duplicate username/email
    log('TEST 17: Testing duplicate username/email...', 'POST /api/admin/users');
    try {
      const duplicateUsername = `duplicate_${Date.now()}`;
      const duplicateEmail = `duplicate_${Date.now()}@example.com`;
      
      // Create first user
      const firstUserResponse = await axios.post(API_URL, {
        username: duplicateUsername,
        email: duplicateEmail,
        firstName: 'First',
        lastName: 'User',
        userType: 'admin'
      });
      createdUserIds.push(firstUserResponse.data.id);
      
      // Try to create duplicate
      await axios.post(API_URL, {
        username: duplicateUsername,
        email: `different_${Date.now()}@example.com`,
        firstName: 'Second',
        lastName: 'User',
        userType: 'admin'
      });
      console.log('ERROR: Should have failed due to duplicate username');
    } catch (error) {
      if (error.response && error.response.status === 409) {
        log('Duplicate correctly prevented:', {
          status: error.response.status,
          error: error.response.data.error
        });
      } else {
        throw error;
      }
    }

    // test 18: test 404 error - non-existent user
    log('TEST 18: Testing 404 error - non-existent user...', 'GET /api/admin/users/999999');
    try {
      await axios.get(`${API_URL}/999999`);
      console.log('ERROR: Should have returned 404');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        log('404 error correctly returned:', {
          status: error.response.status,
          error: error.response.data.error
        });
      } else {
        throw error;
      }
    }

    // ===== POINTS ENDPOINTS TESTS =====

    // test 19: get driver points (initial state - 0 balance, no history)
    log('TEST 19: Getting driver points (initial state)...', `GET /api/admin/users/${driverId}/points`);
    const initialPointsResponse = await axios.get(`${API_URL}/${driverId}/points`);
    log('Initial driver points:', {
      userId: initialPointsResponse.data.driver.UserID,
      pointBalance: initialPointsResponse.data.driver.PointBalance,
      historyCount: initialPointsResponse.data.history.length
    });

    // test 20: add positive point transaction
    log('TEST 20: Adding positive point transaction...', `POST /api/admin/users/${driverId}/points`);
    const addPositivePointsResponse = await axios.post(`${API_URL}/${driverId}/points`, {
      pointChange: 100,
      reason: 'Monthly bonus',
      adminUserId: adminId
    });
    log('Added positive points:', {
      message: addPositivePointsResponse.data.message,
      newBalance: addPositivePointsResponse.data.driver.PointBalance,
      historyCount: addPositivePointsResponse.data.history.length
    });
    console.log('Status:', addPositivePointsResponse.status);
    const firstTransactionId = addPositivePointsResponse.data.history[0].TransactionID;

    // test 21: verify points were added correctly
    log('TEST 21: Verifying points were added...', `GET /api/admin/users/${driverId}/points`);
    const verifyPointsResponse = await axios.get(`${API_URL}/${driverId}/points`);
    log('Current driver points:', {
      pointBalance: verifyPointsResponse.data.driver.PointBalance,
      historyCount: verifyPointsResponse.data.history.length,
      lastTransaction: verifyPointsResponse.data.history[0]
    });

    // test 22: add negative point transaction
    log('TEST 22: Adding negative point transaction...', `POST /api/admin/users/${driverId}/points`);
    const addNegativePointsResponse = await axios.post(`${API_URL}/${driverId}/points`, {
      pointChange: -25,
      reason: 'Product purchase',
      adminUserId: adminId
    });
    log('Added negative points:', {
      message: addNegativePointsResponse.data.message,
      newBalance: addNegativePointsResponse.data.driver.PointBalance,
      historyCount: addNegativePointsResponse.data.history.length
    });
    const secondTransactionId = addNegativePointsResponse.data.history[0].TransactionID;

    // test 23: add another transaction to have more history
    log('TEST 23: Adding another transaction...', `POST /api/admin/users/${driverId}/points`);
    const addThirdPointsResponse = await axios.post(`${API_URL}/${driverId}/points`, {
      pointChange: 50,
      reason: 'Safety milestone',
      adminUserId: adminId
    });
    log('Added third transaction:', {
      newBalance: addThirdPointsResponse.data.driver.PointBalance,
      historyCount: addThirdPointsResponse.data.history.length
    });

    // test 24: update existing point transaction
    log('TEST 24: Updating point transaction...', `PATCH /api/admin/users/${driverId}/points/${firstTransactionId}`);
    const updateTransactionResponse = await axios.patch(`${API_URL}/${driverId}/points/${firstTransactionId}`, {
      pointChange: 150,
      reason: 'Monthly bonus (adjusted)',
      adminUserId: adminId
    });
    log('Updated transaction:', {
      message: updateTransactionResponse.data.message,
      newBalance: updateTransactionResponse.data.driver.PointBalance,
      balanceChange: 'Should increase by 50 (150 - 100)'
    });

    // test 25: verify balance recalculated correctly after update
    log('TEST 25: Verifying balance recalculation...', `GET /api/admin/users/${driverId}/points`);
    const verifyRecalcResponse = await axios.get(`${API_URL}/${driverId}/points`);
    const expectedBalance = 150 - 25 + 50; // 175
    log('Balance verification:', {
      currentBalance: verifyRecalcResponse.data.driver.PointBalance,
      expectedBalance: expectedBalance,
      correct: verifyRecalcResponse.data.driver.PointBalance === expectedBalance
    });

    // test 26: update transaction to negative value
    log('TEST 26: Updating transaction to negative value...', `PATCH /api/admin/users/${driverId}/points/${secondTransactionId}`);
    const updateToNegativeResponse = await axios.patch(`${API_URL}/${driverId}/points/${secondTransactionId}`, {
      pointChange: -50,
      reason: 'Larger purchase (corrected)',
      adminUserId: adminId
    });
    log('Updated to larger negative:', {
      newBalance: updateToNegativeResponse.data.driver.PointBalance,
      balanceChange: 'Should decrease by 25 (from -25 to -50)'
    });

    // test 27: get full transaction history
    log('TEST 27: Getting full transaction history...', `GET /api/admin/users/${driverId}/points`);
    const fullHistoryResponse = await axios.get(`${API_URL}/${driverId}/points`);
    log('Full transaction history:', {
      pointBalance: fullHistoryResponse.data.driver.PointBalance,
      transactionCount: fullHistoryResponse.data.history.length,
      transactions: fullHistoryResponse.data.history.map(t => ({
        id: t.TransactionID,
        points: t.PointChange,
        reason: t.ReasonForChange
      }))
    });

    // test 28: test validation - missing required fields
    log('TEST 28: Testing validation - missing required fields...', `POST /api/admin/users/${driverId}/points`);
    try {
      await axios.post(`${API_URL}/${driverId}/points`, {
        pointChange: 100
        // missing reason
      });
      console.log('ERROR: Should have failed validation');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        log('Validation correctly failed:', {
          status: error.response.status,
          error: error.response.data.error
        });
      } else {
        throw error;
      }
    }

    // test 29: test validation - reason too long (>45 chars)
    log('TEST 29: Testing validation - reason too long...', `POST /api/admin/users/${driverId}/points`);
    try {
      await axios.post(`${API_URL}/${driverId}/points`, {
        pointChange: 100,
        reason: 'This is a very long reason that exceeds the 45 character limit for the database field'
      });
      console.log('ERROR: Should have failed validation');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        log('Validation correctly failed:', {
          status: error.response.status,
          error: error.response.data.error
        });
      } else {
        throw error;
      }
    }

    // test 30: test validation - reason too long on update
    log('TEST 30: Testing validation - reason too long on update...', `PATCH /api/admin/users/${driverId}/points/${firstTransactionId}`);
    try {
      await axios.patch(`${API_URL}/${driverId}/points/${firstTransactionId}`, {
        pointChange: 100,
        reason: 'Another very long reason that definitely exceeds the maximum allowed length'
      });
      console.log('ERROR: Should have failed validation');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        log('Validation correctly failed:', {
          status: error.response.status,
          error: error.response.data.error
        });
      } else {
        throw error;
      }
    }

    // test 31: test 404 - get points for non-driver user
    log('TEST 31: Testing 404 - get points for non-driver user...', `GET /api/admin/users/${sponsorId}/points`);
    try {
      await axios.get(`${API_URL}/${sponsorId}/points`);
      console.log('ERROR: Should have returned 404 for non-driver');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        log('404 correctly returned for non-driver:', {
          status: error.response.status,
          error: error.response.data.error
        });
      } else {
        throw error;
      }
    }

    // test 32: test 404 - add points for non-existent user
    log('TEST 32: Testing 404 - add points for non-existent user...', 'POST /api/admin/users/999999/points');
    try {
      await axios.post(`${API_URL}/999999/points`, {
        pointChange: 100,
        reason: 'Test transaction'
      });
      console.log('ERROR: Should have returned error for non-existent user');
    } catch (error) {
      if (error.response && (error.response.status === 404 || error.response.status === 500)) {
        log('Error correctly returned for non-existent user:', {
          status: error.response.status,
          error: error.response.data.error
        });
      } else {
        throw error;
      }
    }

    // test 33: test error - update non-existent transaction
    log('TEST 33: Testing error - update non-existent transaction...', `PATCH /api/admin/users/${driverId}/points/999999`);
    try {
      await axios.patch(`${API_URL}/${driverId}/points/999999`, {
        pointChange: 100,
        reason: 'Updated reason'
      });
      console.log('ERROR: Should have returned error for non-existent transaction');
    } catch (error) {
      if (error.response && error.response.status === 500) {
        log('Error correctly returned for non-existent transaction:', {
          status: error.response.status,
          error: error.response.data.error
        });
      } else {
        throw error;
      }
    }

    // test 34: test zero point transaction (edge case)
    log('TEST 34: Testing zero point transaction...', `POST /api/admin/users/${driverId}/points`);
    const zeroPointsResponse = await axios.post(`${API_URL}/${driverId}/points`, {
      pointChange: 0,
      reason: 'Correction entry',
      adminUserId: adminId
    });
    log('Zero point transaction added:', {
      message: zeroPointsResponse.data.message,
      balanceUnchanged: zeroPointsResponse.data.driver.PointBalance === fullHistoryResponse.data.driver.PointBalance - 25
    });

    // test 35: test large point values
    log('TEST 35: Testing large point values...', `POST /api/admin/users/${driverId}/points`);
    const largePointsResponse = await axios.post(`${API_URL}/${driverId}/points`, {
      pointChange: 10000,
      reason: 'Year-end bonus',
      adminUserId: adminId
    });
    log('Large point transaction added:', {
      message: largePointsResponse.data.message,
      newBalance: largePointsResponse.data.driver.PointBalance
    });

    // test 36: final balance verification
    log('TEST 36: Final balance verification...', `GET /api/admin/users/${driverId}/points`);
    const finalPointsResponse = await axios.get(`${API_URL}/${driverId}/points`);
    log('Final driver points state:', {
      pointBalance: finalPointsResponse.data.driver.PointBalance,
      totalTransactions: finalPointsResponse.data.history.length,
      firstName: finalPointsResponse.data.driver.FirstName,
      lastName: finalPointsResponse.data.driver.LastName
    });

    // cleanup: delete created users
    log('CLEANUP: Deleting created users...', 'Cleanup');
    await cleanupUsers(createdUserIds);

    // cleanup: delete created sponsor companies
    log('CLEANUP: Deleting created sponsors...', 'Cleanup');
    await cleanupSponsorCompanies(createdSponsorIds);

    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('\nTest failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
      console.error('Headers:', error.response.headers);
    } else {
      console.error('Error:', error.message);
    }

    // attempt cleanup even on failure
    console.log('\nAttempting cleanup...');
    
    // cleanup users
    try {
      await cleanupUsers(createdUserIds);
    } catch (cleanupError) {
      console.error('Failed to cleanup users');
    }
    
    // cleanup sponsor companies
    try {
      await cleanupSponsorCompanies(createdSponsorIds);
    } catch (cleanupError) {
      console.error('Failed to cleanup sponsor companies');
    }
  } finally {
    // close the pool when done
    await closePool();
    process.exit(0);
  }
}

runTests();
