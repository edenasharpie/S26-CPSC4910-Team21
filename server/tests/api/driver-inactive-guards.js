import axios from 'axios';
import {
  BASE_URL,
  log,
  createTestSponsor,
  cleanupSponsorCompanies,
  closePool,
  createTestUser,
  createTestDriverProfile,
  setUserActiveStatus,
} from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;

const createdUserIds = [];
const createdSponsorIds = [];
const createdCatalogIds = [];
const createdItemIds = [];

async function createTestCatalog(sponsorCompanyId) {
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      'INSERT INTO CATALOGS (SponsorCompanyID) VALUES (?)',
      [sponsorCompanyId]
    );
    return result.insertId;
  } finally {
    connection.release();
  }
}

async function createTestCatalogItem(catalogId) {
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      `INSERT INTO CATALOG_ITEMS
        (CatalogID, APIID, ItemName, OriginalSource, Description, PointCost, ImageUrl)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [catalogId, `API_${Date.now()}`, 'Inactive Guard Item', 'manual', 'Test item', 50, 'https://example.com/item.jpg']
    );
    return result.insertId;
  } finally {
    connection.release();
  }
}

async function cleanupData() {
  const connection = await pool.getConnection();
  try {
    for (const itemId of createdItemIds) {
      await connection.query('DELETE FROM CATALOG_ITEMS WHERE ItemID = ?', [itemId]);
    }

    for (const catalogId of createdCatalogIds) {
      await connection.query('DELETE FROM CATALOGS WHERE CatalogID = ?', [catalogId]);
    }

    for (const userId of createdUserIds) {
      await connection.query('DELETE FROM POINT_TRANSACTIONS WHERE UserChanged = ?', [userId]);
      await connection.query('DELETE FROM ORDERS WHERE DriverID IN (SELECT LicenseNumber FROM DRIVERS WHERE UserID = ?)', [userId]);
      await connection.query('DELETE FROM DRIVERS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [userId]);
    }
  } catch (error) {
    console.error('Error cleaning up inactive guard test data:', error.message);
  } finally {
    connection.release();
  }

  await cleanupSponsorCompanies(createdSponsorIds);
}

async function runTests() {
  try {
    console.log('Starting inactive driver guard tests...\n');

    const sponsorCompanyId = await createTestSponsor({
      companyName: `Inactive Guard Sponsor ${Date.now()}`,
      pointDollarValue: 0.01,
    });
    createdSponsorIds.push(sponsorCompanyId);

    const driverUser = await createTestUser({ userType: 'driver' });
    createdUserIds.push(driverUser.userId);

    await createTestDriverProfile({
      userId: driverUser.userId,
      sponsorCompanyId,
      licenseNumber: `GUARD_DL_${driverUser.userId}`,
      pointBalance: 1000,
    });

    const catalogId = await createTestCatalog(sponsorCompanyId);
    createdCatalogIds.push(catalogId);

    const itemId = await createTestCatalogItem(catalogId);
    createdItemIds.push(itemId);

    // Baseline checks while active
    log('TEST 1: Active driver can list catalogs', `GET /api/driver/${driverUser.userId}/catalogs`);
    const activeCatalogRes = await axios.get(`${API_BASE_URL}/driver/${driverUser.userId}/catalogs`, {
      params: { sponsorCompanyId },
    });
    if (activeCatalogRes.status !== 200) {
      throw new Error('Expected active driver to access catalogs');
    }

    log('TEST 2: Active driver can list orders', `GET /api/driver/${driverUser.userId}/orders`);
    const activeOrdersRes = await axios.get(`${API_BASE_URL}/driver/${driverUser.userId}/orders`, {
      params: { sponsorCompanyId },
    });
    if (activeOrdersRes.status !== 200) {
      throw new Error('Expected active driver to access orders');
    }

    await setUserActiveStatus(driverUser.userId, 0);

    // Catalog guards
    log('TEST 3: Inactive driver blocked from catalogs list', `GET /api/driver/${driverUser.userId}/catalogs`);
    try {
      await axios.get(`${API_BASE_URL}/driver/${driverUser.userId}/catalogs`, {
        params: { sponsorCompanyId },
      });
      throw new Error('Expected 403 for inactive driver catalog list');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }

    log('TEST 4: Inactive driver blocked from catalog details', `GET /api/driver/${driverUser.userId}/catalogs/${catalogId}`);
    try {
      await axios.get(`${API_BASE_URL}/driver/${driverUser.userId}/catalogs/${catalogId}`, {
        params: { sponsorCompanyId },
      });
      throw new Error('Expected 403 for inactive driver catalog detail');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }

    log('TEST 5: Inactive driver blocked from catalog item details', `GET /api/driver/${driverUser.userId}/catalogs/${catalogId}/items/${itemId}`);
    try {
      await axios.get(`${API_BASE_URL}/driver/${driverUser.userId}/catalogs/${catalogId}/items/${itemId}`, {
        params: { sponsorCompanyId },
      });
      throw new Error('Expected 403 for inactive driver catalog item detail');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }

    // Order guards
    log('TEST 6: Inactive driver blocked from order list', `GET /api/driver/${driverUser.userId}/orders`);
    try {
      await axios.get(`${API_BASE_URL}/driver/${driverUser.userId}/orders`, {
        params: { sponsorCompanyId },
      });
      throw new Error('Expected 403 for inactive driver order list');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }

    log('TEST 7: Inactive driver blocked from order creation', `POST /api/driver/${driverUser.userId}/orders`);
    try {
      await axios.post(
        `${API_BASE_URL}/driver/${driverUser.userId}/orders`,
        { items: [{ itemId, quantity: 1 }] },
        { params: { sponsorCompanyId } }
      );
      throw new Error('Expected 403 for inactive driver order creation');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }

    console.log('\nInactive driver guard tests completed successfully!');
  } catch (error) {
    console.error('\nInactive driver guard tests failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    await cleanupData();
    await closePool();
  }
}

runTests();
