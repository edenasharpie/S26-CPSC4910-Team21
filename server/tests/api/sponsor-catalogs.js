import axios from 'axios';
import { BASE_URL, log, createTestSponsor, cleanupSponsorCompanies, closePool } from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;

// Track created resources for cleanup
const createdUserIds = [];
const createdCatalogIds = [];
const createdSponsorIds = [];

/**
 * Create a test user in the database
 */
async function createTestUser(userType = 'sponsor') {
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
        'Sponsor',
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
 * Create a sponsor entry and link to sponsor company
 */
async function createTestSponsorUser(userId, sponsorCompanyId) {
  const connection = await pool.getConnection();
  
  try {
    await connection.query(
      'INSERT INTO SPONSORS (UserID, SponsorCompanyID) VALUES (?, ?)',
      [userId, sponsorCompanyId]
    );
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
      // Delete sponsor records first (foreign key constraint)
      await connection.query('DELETE FROM SPONSORS WHERE UserID = ?', [id]);
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
    console.log('Starting sponsor catalog endpoint tests...\n');

    // Test setup: create sponsor company
    log('TEST SETUP: Creating sponsor company...', 'Setup');
    const sponsorCompanyId = await createTestSponsor({
      companyName: 'Sponsor Test Company',
      pointDollarValue: 0.01
    });
    createdSponsorIds.push(sponsorCompanyId);
    log('Created sponsor company:', { id: sponsorCompanyId });

    // Create test sponsor user
    log('TEST SETUP: Creating test sponsor user...', 'Setup');
    const sponsorUserId = await createTestUser('sponsor');
    createdUserIds.push(sponsorUserId);
    await createTestSponsorUser(sponsorUserId, sponsorCompanyId);
    log('Created sponsor user:', { id: sponsorUserId, sponsorCompanyId });

    // Test 1: Sponsor creates a catalog
    log('TEST 1: Sponsor creating catalog...', `POST /api/sponsor/${sponsorUserId}/catalogs`);
    const createResponse = await axios.post(`${API_BASE_URL}/sponsor/${sponsorUserId}/catalogs`, {
      externalProductIds: [],
      pointCost: 100
    });
    const catalogId = createResponse.data.id;
    createdCatalogIds.push(catalogId);
    log('Created catalog:', createResponse.data);
    
    if (createResponse.data.sponsorCompanyId !== sponsorCompanyId) {
      throw new Error('Catalog not assigned to correct sponsor company');
    }

    // Test 2: Sponsor gets list of their catalogs
    log('TEST 2: Sponsor fetching catalogs...', `GET /api/sponsor/${sponsorUserId}/catalogs`);
    const catalogsResponse = await axios.get(`${API_BASE_URL}/sponsor/${sponsorUserId}/catalogs`);
    log('Sponsor catalogs:', catalogsResponse.data);
    
    if (catalogsResponse.data.length === 0) {
      throw new Error('Expected at least one catalog');
    }

    // Test 3: Sponsor adds item to catalog
    log('TEST 3: Sponsor adding item to catalog...', `POST /api/sponsor/${sponsorUserId}/catalogs/${catalogId}/items`);
    const addItemResponse = await axios.post(`${API_BASE_URL}/sponsor/${sponsorUserId}/catalogs/${catalogId}/items`, {
      name: 'Test Product',
      description: 'A test product for sponsors',
      pointCost: 250,
      imageUrl: 'https://example.com/product.jpg',
      originalSource: 'manual'
    });
    const itemId = addItemResponse.data.id;
    log('Added item:', addItemResponse.data);

    // Test 4: Sponsor gets catalog with items
    log('TEST 4: Sponsor fetching catalog with items...', `GET /api/sponsor/${sponsorUserId}/catalogs/${catalogId}`);
    const catalogDetailResponse = await axios.get(`${API_BASE_URL}/sponsor/${sponsorUserId}/catalogs/${catalogId}`);
    log('Catalog details:', catalogDetailResponse.data);
    
    if (!catalogDetailResponse.data.items || catalogDetailResponse.data.items.length === 0) {
      throw new Error('Expected catalog to have items');
    }

    // Test 5: Sponsor gets specific item
    log('TEST 5: Sponsor fetching specific item...', `GET /api/sponsor/${sponsorUserId}/catalogs/${catalogId}/items/${itemId}`);
    const itemResponse = await axios.get(`${API_BASE_URL}/sponsor/${sponsorUserId}/catalogs/${catalogId}/items/${itemId}`);
    log('Item details:', itemResponse.data);

    // Test 6: Sponsor updates item
    log('TEST 6: Sponsor updating item...', `PATCH /api/sponsor/${sponsorUserId}/catalogs/${catalogId}/items/${itemId}`);
    const updateItemResponse = await axios.patch(
      `${API_BASE_URL}/sponsor/${sponsorUserId}/catalogs/${catalogId}/items/${itemId}`,
      {
        pointCost: 300,
        description: 'Updated test product description'
      }
    );
    log('Updated item:', updateItemResponse.data);
    
    if (updateItemResponse.data.pointCost !== 300) {
      throw new Error('Item point cost not updated correctly');
    }

    // Test 7: Sponsor updates catalog
    log('TEST 7: Sponsor updating catalog...', `PATCH /api/sponsor/${sponsorUserId}/catalogs/${catalogId}`);
    const updateCatalogResponse = await axios.patch(
      `${API_BASE_URL}/sponsor/${sponsorUserId}/catalogs/${catalogId}`,
      {}
    );
    log('Updated catalog:', updateCatalogResponse.data);

    // Test 8: Sponsor with pagination
    log('TEST 8: Sponsor fetching catalogs with pagination...', `GET /api/sponsor/${sponsorUserId}/catalogs?limit=5&offset=0`);
    const paginatedResponse = await axios.get(`${API_BASE_URL}/sponsor/${sponsorUserId}/catalogs?limit=5&offset=0`);
    log('Paginated catalogs:', paginatedResponse.data);

    // Test 9: Invalid user ID (should return 404)
    log('TEST 9: Testing invalid user ID...', 'GET /api/sponsor/99999/catalogs');
    try {
      await axios.get(`${API_BASE_URL}/sponsor/99999/catalogs`);
      throw new Error('Expected 404 error for invalid user');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        log('Correctly returned 404 for invalid user', { status: 404 });
      } else {
        throw error;
      }
    }

    // Test 10: Non-sponsor user trying to access sponsor endpoints
    log('TEST 10: Testing non-sponsor user access...', 'Setup');
    const regularUserId = await createTestUser('driver');
    createdUserIds.push(regularUserId);
    
    try {
      await axios.get(`${API_BASE_URL}/sponsor/${regularUserId}/catalogs`);
      throw new Error('Expected 403 error for non-sponsor user');
    } catch (error) {
      if (error.response && error.response.status === 403) {
        log('Correctly returned 403 for non-sponsor user', { status: 403 });
      } else {
        throw error;
      }
    }

    // Test 11: Cross-company access control
    log('TEST 11: Testing access control across sponsor companies...', 'Setup');
    const otherSponsorCompanyId = await createTestSponsor({
      companyName: 'Other Sponsor Company',
      pointDollarValue: 0.01
    });
    createdSponsorIds.push(otherSponsorCompanyId);
    
    const otherSponsorUserId = await createTestUser('sponsor');
    createdUserIds.push(otherSponsorUserId);
    await createTestSponsorUser(otherSponsorUserId, otherSponsorCompanyId);
    
    // Create catalog for other sponsor
    const otherCatalogResponse = await axios.post(`${API_BASE_URL}/sponsor/${otherSponsorUserId}/catalogs`, {});
    const otherCatalogId = otherCatalogResponse.data.id;
    createdCatalogIds.push(otherCatalogId);
    
    // Try to access other sponsor's catalog
    try {
      await axios.get(`${API_BASE_URL}/sponsor/${sponsorUserId}/catalogs/${otherCatalogId}`);
      throw new Error('Expected 404 for catalog from different sponsor company');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        log('Correctly returned 404 for catalog from different sponsor company', { status: 404 });
      } else {
        throw error;
      }
    }

    // Try to update other sponsor's catalog
    try {
      await axios.patch(`${API_BASE_URL}/sponsor/${sponsorUserId}/catalogs/${otherCatalogId}`, {});
      throw new Error('Expected 403 for updating catalog from different sponsor company');
    } catch (error) {
      if (error.response && error.response.status === 403) {
        log('Correctly returned 403 for updating catalog from different sponsor company', { status: 403 });
      } else {
        throw error;
      }
    }

    // Test 12: Delete item
    log('TEST 12: Sponsor deleting item...', `DELETE /api/sponsor/${sponsorUserId}/catalogs/${catalogId}/items/${itemId}`);
    await axios.delete(`${API_BASE_URL}/sponsor/${sponsorUserId}/catalogs/${catalogId}/items/${itemId}`);
    log('Item deleted successfully', { status: 204 });

    // Verify item is deleted
    try {
      await axios.get(`${API_BASE_URL}/sponsor/${sponsorUserId}/catalogs/${catalogId}/items/${itemId}`);
      throw new Error('Expected 404 for deleted item');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        log('Verified item deletion', { status: 404 });
      } else {
        throw error;
      }
    }

    // Test 13: Delete catalog
    log('TEST 13: Sponsor deleting catalog...', `DELETE /api/sponsor/${sponsorUserId}/catalogs/${catalogId}`);
    await axios.delete(`${API_BASE_URL}/sponsor/${sponsorUserId}/catalogs/${catalogId}`);
    log('Catalog deleted successfully', { status: 204 });
    
    // Remove from cleanup list since we deleted it
    const index = createdCatalogIds.indexOf(catalogId);
    if (index > -1) {
      createdCatalogIds.splice(index, 1);
    }

    // Verify catalog is deleted
    try {
      await axios.get(`${API_BASE_URL}/sponsor/${sponsorUserId}/catalogs/${catalogId}`);
      throw new Error('Expected 404 for deleted catalog');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        log('Verified catalog deletion', { status: 404 });
      } else {
        throw error;
      }
    }

    console.log('\nAll sponsor catalog tests completed successfully!');
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
