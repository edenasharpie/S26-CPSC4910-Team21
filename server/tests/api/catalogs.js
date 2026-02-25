import axios from 'axios';
import { BASE_URL, log, createTestSponsor, cleanupSponsorCompanies, closePool } from '../setup.js';

const API_URL = `${BASE_URL}/api/admin/catalogs`;

// track created resources for cleanup
const createdCatalogIds = [];
const createdSponsorIds = [];

async function runTests() {
  try {
    console.log('Starting catalog endpoint tests...\n');

    // test setup: create a sponsor company
    log('TEST SETUP: Creating sponsor company...', 'Setup');
    const sponsorCompanyId = await createTestSponsor({
      companyName: 'Test Sponsor Company',
      pointDollarValue: 0.01
    });
    createdSponsorIds.push(sponsorCompanyId);
    log('Created sponsor company:', { id: sponsorCompanyId, companyName: 'Test Sponsor Company' });

    // test 1: create a catalog
    log('TEST 1: Creating catalog...', 'POST /api/admin/catalogs');
    const createResponse = await axios.post(API_URL, {
      sponsorCompanyId: sponsorCompanyId,
      externalProductIds: [],
      pointCost: 100
    });
    const catalogId = createResponse.data.id;
    createdCatalogIds.push(catalogId);
    log('Created catalog:', createResponse.data);

    // test 2: get all catalogs
    log('TEST 2: Fetching all catalogs...', 'GET /api/admin/catalogs');
    const allCatalogsResponse = await axios.get(API_URL);
    log('All catalogs:', allCatalogsResponse.data);

    // test 3: add item to catalog
    log('TEST 3: Adding item to catalog...', `POST /api/admin/catalogs/${catalogId}/items`);
    const addItemResponse = await axios.post(`${API_URL}/${catalogId}/items`, {
      name: 'Test Product',
      description: 'A test product description',
      pointCost: 150,
      imageUrl: 'https://example.com/image.jpg',
      originalSource: 'manual'
    });
    const itemId = addItemResponse.data.id;
    log('Added item:', addItemResponse.data);

    // test 4: get catalog with all items
    log('TEST 4: Fetching catalog with items...', `GET /api/admin/catalogs/${catalogId}`);
    const catalogWithItemsResponse = await axios.get(`${API_URL}/${catalogId}`);
    log('Catalog with items:', catalogWithItemsResponse.data);
    log('Items array:', catalogWithItemsResponse.data.items);

    // test 5: get specific item
    log('TEST 5: Fetching specific item...', `GET /api/admin/catalogs/${catalogId}/items/${itemId}`);
    const itemResponse = await axios.get(`${API_URL}/${catalogId}/items/${itemId}`);
    log('Specific item:', itemResponse.data);

    // test 6: update item
    log('TEST 6: Updating item...', `PATCH /api/admin/catalogs/${catalogId}/items/${itemId}`);
    const updateItemResponse = await axios.patch(`${API_URL}/${catalogId}/items/${itemId}`, {
      pointCost: 200,
      description: 'Updated description'
    });
    log('Updated item:', updateItemResponse.data);

    // test 7: update catalog
    log('TEST 7: Updating catalog...', `PATCH /api/admin/catalogs/${catalogId}`);
    const updateCatalogResponse = await axios.patch(`${API_URL}/${catalogId}`, {
      sponsorCompanyId: sponsorCompanyId
    });
    log('Updated catalog:', updateCatalogResponse.data);

    // test 8: delete item
    log('TEST 8: Deleting item...', `DELETE /api/admin/catalogs/${catalogId}/items/${itemId}`);
    await axios.delete(`${API_URL}/${catalogId}/items/${itemId}`);
    log('Item deleted successfully', { status: 204 });

    // cleanup: delete created catalogs
    log('CLEANUP: Deleting created catalogs...', 'Cleanup');
    for (const id of createdCatalogIds) {
      await axios.delete(`${API_URL}/${id}`);
      console.log(`Deleted catalog ${id}`);
    }

    // cleanup: delete created sponsor companies
    log('CLEANUP: Deleting created sponsors...', 'Cleanup');
    await cleanupSponsorCompanies(createdSponsorIds);

    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('\nTest failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }

    // attempt cleanup even on failure
    console.log('\nAttempting cleanup...');
    for (const id of createdCatalogIds) {
      try {
        await axios.delete(`${API_URL}/${id}`);
        console.log(`Cleaned up catalog ${id}`);
      } catch (cleanupError) {
        console.error(`Failed to cleanup catalog ${id}`);
      }
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