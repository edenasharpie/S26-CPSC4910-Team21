import axios from 'axios';
import { BASE_URL, log, createTestSponsor, cleanupSponsorCompanies, closePool } from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;

// track created resources for cleanup
const createdUserIds = [];
const createdCatalogIds = [];
const createdSponsorIds = [];

/**
 * Create a test user in the database
 */
async function createTestUser(userType = 'driver') {
  const connection = await pool.getConnection();
  
  try {
    const username = `test_${userType}_${Date.now()}`;
    const email = `${username}@test.com`;
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    
    const [userResult] = await connection.query(
      `INSERT INTO USERS (Username, Email, PassHash, UserType, FirstName, LastName, 
       ActiveStatus, LastLogin, LastPasswordChange, Permissions) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        username,
        email,
        'test_hash',
        userType,
        'Test',
        'User',
        1,
        timestamp,
        timestamp,
        JSON.stringify({})
      ]
    );
    
    return userResult.insertId;
  } finally {
    connection.release();
  }
}

/**
 * Create a driver entry and link to sponsor company
 */
async function createTestDriver(userId, sponsorCompanyId) {
  const connection = await pool.getConnection();
  
  try {
    await connection.query(
      `INSERT INTO DRIVERS (LicenseNumber, UserID, SponsorCompanyID, PointBalance, 
       PerformanceStatus, AlertStatus, AlertOrders) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`LICENSE_${userId}`, userId, sponsorCompanyId, 1000, 'good', 0, 0]
    );
  } finally {
    connection.release();
  }
}

/**
 * Create a catalog for testing
 */
async function createTestCatalog(sponsorCompanyId) {
  const connection = await pool.getConnection();
  
  try {
    const [catalogResult] = await connection.query(
      'INSERT INTO CATALOGS (SponsorCompanyID) VALUES (?)',
      [sponsorCompanyId]
    );
    
    return catalogResult.insertId;
  } finally {
    connection.release();
  }
}

/**
 * Add an item to a catalog
 */
async function addTestCatalogItem(catalogId) {
  const connection = await pool.getConnection();
  
  try {
    const [itemResult] = await connection.query(
      `INSERT INTO CATALOG_ITEMS 
       (CatalogID, APIID, ItemName, OriginalSource, Description, PointCost, ImageUrl) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [catalogId, '', 'Test Product', 'manual', 'Test description', 500, 'https://example.com/image.jpg']
    );
    
    return itemResult.insertId;
  } finally {
    connection.release();
  }
}

/**
 * Cleanup created users
 */
async function cleanupUsers(userIds) {
  if (!userIds || userIds.length === 0) return;
  
  const connection = await pool.getConnection();
  
  try {
    for (const id of userIds) {
      // Delete driver records first (foreign key constraint)
      await connection.query('DELETE FROM DRIVERS WHERE UserID = ?', [id]);
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

/**
 * Cleanup created catalogs
 */
async function cleanupCatalogs(catalogIds) {
  if (!catalogIds || catalogIds.length === 0) return;
  
  const connection = await pool.getConnection();
  
  try {
    for (const id of catalogIds) {
      // Delete catalog items first (foreign key constraint)
      await connection.query('DELETE FROM CATALOG_ITEMS WHERE CatalogID = ?', [id]);
      // Delete catalog
      await connection.query('DELETE FROM CATALOGS WHERE CatalogID = ?', [id]);
      console.log(`Deleted catalog ${id}`);
    }
  } catch (error) {
    console.error('Error cleaning up catalogs:', error.message);
  } finally {
    connection.release();
  }
}

async function runTests() {
  try {
    console.log('Starting driver catalog endpoint tests...\n');

    // Test setup: create sponsor company
    log('TEST SETUP: Creating sponsor company...', 'Setup');
    const sponsorCompanyId = await createTestSponsor({
      companyName: 'Driver Test Sponsor Company',
      pointDollarValue: 0.01
    });
    createdSponsorIds.push(sponsorCompanyId);
    log('Created sponsor company:', { id: sponsorCompanyId });

    // Create test driver user
    log('TEST SETUP: Creating test driver user...', 'Setup');
    const driverUserId = await createTestUser('driver');
    createdUserIds.push(driverUserId);
    await createTestDriver(driverUserId, sponsorCompanyId);
    log('Created driver user:', { id: driverUserId, sponsorCompanyId });

    // Create test catalog with items
    log('TEST SETUP: Creating test catalog...', 'Setup');
    const catalogId = await createTestCatalog(sponsorCompanyId);
    createdCatalogIds.push(catalogId);
    const itemId = await addTestCatalogItem(catalogId);
    log('Created catalog with item:', { catalogId, itemId });

    // Test 1: Driver gets list of catalogs
    log('TEST 1: Driver fetching catalogs...', `GET /api/driver/${driverUserId}/catalogs`);
    const catalogsResponse = await axios.get(`${API_BASE_URL}/driver/${driverUserId}/catalogs`);
    log('Driver catalogs:', catalogsResponse.data);
    
    if (catalogsResponse.data.length === 0) {
      throw new Error('Expected at least one catalog, got none');
    }

    // Test 2: Driver gets specific catalog with items
    log('TEST 2: Driver fetching specific catalog...', `GET /api/driver/${driverUserId}/catalogs/${catalogId}`);
    const catalogDetailResponse = await axios.get(`${API_BASE_URL}/driver/${driverUserId}/catalogs/${catalogId}`);
    log('Catalog details:', catalogDetailResponse.data);
    
    if (!catalogDetailResponse.data.items || catalogDetailResponse.data.items.length === 0) {
      throw new Error('Expected catalog to have items');
    }

    // Test 3: Driver gets specific item
    log('TEST 3: Driver fetching specific item...', `GET /api/driver/${driverUserId}/catalogs/${catalogId}/items/${itemId}`);
    const itemResponse = await axios.get(`${API_BASE_URL}/driver/${driverUserId}/catalogs/${catalogId}/items/${itemId}`);
    log('Item details:', itemResponse.data);

    // Test 4: Driver with pagination
    log('TEST 4: Driver fetching catalogs with pagination...', `GET /api/driver/${driverUserId}/catalogs?limit=5&offset=0`);
    const paginatedResponse = await axios.get(`${API_BASE_URL}/driver/${driverUserId}/catalogs?limit=5&offset=0`);
    log('Paginated catalogs:', paginatedResponse.data);

    // Test 5: Invalid user ID (should return 404)
    log('TEST 5: Testing invalid user ID...', 'GET /api/driver/99999/catalogs');
    try {
      await axios.get(`${API_BASE_URL}/driver/99999/catalogs`);
      throw new Error('Expected 404 error for invalid user');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        log('Correctly returned 404 for invalid user', { status: 404 });
      } else {
        throw error;
      }
    }

    // Test 6: Create driver without sponsor company
    log('TEST 6: Testing driver without sponsor company...', 'Setup');
    const orphanDriverUserId = await createTestUser('driver');
    createdUserIds.push(orphanDriverUserId);
    // Don't link to sponsor company - just create user
    const connection = await pool.getConnection();
    try {
      await connection.query(
        `INSERT INTO DRIVERS (LicenseNumber, UserID, SponsorCompanyID, PointBalance, 
         PerformanceStatus, AlertStatus, AlertOrders) 
         VALUES (?, ?, NULL, ?, ?, ?, ?)`,
        [`LICENSE_${orphanDriverUserId}`, orphanDriverUserId, 1000, 'good', 0, 0]
      );
    } finally {
      connection.release();
    }
    
    try {
      await axios.get(`${API_BASE_URL}/driver/${orphanDriverUserId}/catalogs`);
      throw new Error('Expected 403 error for driver without sponsor company');
    } catch (error) {
      if (error.response && error.response.status === 403) {
        log('Correctly returned 403 for driver without sponsor company', { status: 403 });
      } else {
        throw error;
      }
    }

    // Test 7: Create catalog for different sponsor company
    log('TEST 7: Testing access control across sponsor companies...', 'Setup');
    const otherSponsorCompanyId = await createTestSponsor({
      companyName: 'Other Sponsor Company',
      pointDollarValue: 0.01
    });
    createdSponsorIds.push(otherSponsorCompanyId);
    const otherCatalogId = await createTestCatalog(otherSponsorCompanyId);
    createdCatalogIds.push(otherCatalogId);
    
    try {
      await axios.get(`${API_BASE_URL}/driver/${driverUserId}/catalogs/${otherCatalogId}`);
      throw new Error('Expected 404 for catalog from different sponsor company');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        log('Correctly returned 404 for catalog from different sponsor company', { status: 404 });
      } else {
        throw error;
      }
    }

    console.log('\nAll driver catalog tests completed successfully!');
  } catch (error) {
    console.error('\nTest failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    // Cleanup
    console.log('\nCleaning up test data...');
    await cleanupCatalogs(createdCatalogIds);
    await cleanupUsers(createdUserIds);
    await cleanupSponsorCompanies(createdSponsorIds);
    await closePool();
    process.exit(0);
  }
}

runTests();
