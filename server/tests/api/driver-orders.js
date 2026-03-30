import axios from 'axios';
import { BASE_URL, log, createTestSponsor, cleanupSponsorCompanies, closePool } from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;

const createdSponsorIds = [];
const createdUserIds = [];
const createdCatalogIds = [];
const createdItemIds = [];
const createdOrderIds = [];
const createdDriverLicenses = [];

async function createTestUser(userType = 'driver') {
  const connection = await pool.getConnection();
  try {
    const username = `orders_${userType}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const email = `${username}@example.com`;
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const [result] = await connection.query(
      `INSERT INTO USERS
       (Username, Email, PassHash, UserType, FirstName, LastName, ActiveStatus, LastLogin, LastPasswordChange, Permissions)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [username, email, 'test_hash', userType, 'Test', 'Driver', timestamp, timestamp, JSON.stringify({})]
    );

    return result.insertId;
  } finally {
    connection.release();
  }
}

async function createTestDriver(userId, sponsorCompanyId, pointBalance = 1000) {
  const connection = await pool.getConnection();
  try {
    const licenseNumber = `DL${Date.now()}${Math.floor(Math.random() * 1000)}`;
    await connection.query(
      `INSERT INTO DRIVERS
       (LicenseNumber, UserID, SponsorCompanyID, PointBalance, PerformanceStatus, AlertPoints, AlertOrders)
       VALUES (?, ?, ?, ?, 'good', 1, 1)`,
      [licenseNumber, userId, sponsorCompanyId, pointBalance]
    );

    return licenseNumber;
  } finally {
    connection.release();
  }
}

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

async function createTestCatalogItem(catalogId, itemName, pointCost) {
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      `INSERT INTO CATALOG_ITEMS
       (CatalogID, APIID, ItemName, OriginalSource, Description, PointCost, ImageUrl)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [catalogId, `api_${Date.now()}`, itemName, 'manual', 'Order endpoint test item', pointCost, 'https://example.com/item.jpg']
    );
    return result.insertId;
  } finally {
    connection.release();
  }
}

async function getDriverPointBalance(userId) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query('SELECT PointBalance FROM DRIVERS WHERE UserID = ?', [userId]);
    return rows[0]?.PointBalance ?? null;
  } finally {
    connection.release();
  }
}

async function cleanupTestData() {
  const connection = await pool.getConnection();
  try {
    for (const orderId of createdOrderIds) {
      await connection.query('DELETE FROM ORDER_ITEMS WHERE OrderID = ?', [orderId]);
      await connection.query('DELETE FROM ORDERS WHERE OrderID = ?', [orderId]);
      await connection.query('DELETE FROM POINT_TRANSACTIONS WHERE ReasonForChange LIKE ?', [`%#${orderId}%`]);
      console.log(`Deleted order ${orderId}`);
    }

    for (const itemId of createdItemIds) {
      await connection.query('DELETE FROM CATALOG_ITEMS WHERE ItemID = ?', [itemId]);
      console.log(`Deleted catalog item ${itemId}`);
    }

    for (const catalogId of createdCatalogIds) {
      await connection.query('DELETE FROM CATALOGS WHERE CatalogID = ?', [catalogId]);
      console.log(`Deleted catalog ${catalogId}`);
    }

    for (const userId of createdUserIds) {
      await connection.query('DELETE FROM POINT_TRANSACTIONS WHERE UserChanged = ?', [userId]);
      await connection.query('DELETE FROM DRIVERS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [userId]);
      console.log(`Deleted user ${userId}`);
    }
  } catch (error) {
    console.error('Error cleaning up test data:', error.message);
  } finally {
    connection.release();
  }

  await cleanupSponsorCompanies(createdSponsorIds);
}

async function runTests() {
  try {
    console.log('Starting driver orders endpoint tests...\n');

    // Setup core data
    log('TEST SETUP: Creating sponsor companies...', 'Setup');
    const sponsorCompanyId = await createTestSponsor({
      companyName: `Driver Orders Sponsor ${Date.now()}`,
      pointDollarValue: 0.01,
    });
    createdSponsorIds.push(sponsorCompanyId);

    const otherSponsorCompanyId = await createTestSponsor({
      companyName: `Other Sponsor ${Date.now()}`,
      pointDollarValue: 0.02,
    });
    createdSponsorIds.push(otherSponsorCompanyId);

    const driverUserId = await createTestUser('driver');
    createdUserIds.push(driverUserId);
    const license = await createTestDriver(driverUserId, sponsorCompanyId, 1000);
    createdDriverLicenses.push(license);

    const catalogId = await createTestCatalog(sponsorCompanyId);
    createdCatalogIds.push(catalogId);

    const itemA = await createTestCatalogItem(catalogId, 'Safety Gloves', 100);
    const itemB = await createTestCatalogItem(catalogId, 'Dash Cam', 300);
    createdItemIds.push(itemA, itemB);

    const otherCatalogId = await createTestCatalog(otherSponsorCompanyId);
    createdCatalogIds.push(otherCatalogId);
    const forbiddenItem = await createTestCatalogItem(otherCatalogId, 'Other Sponsor Item', 50);
    createdItemIds.push(forbiddenItem);

    // Test 1: list orders initially empty
    log('TEST 1: Listing orders before creation...', `GET /api/driver/${driverUserId}/orders`);
    const emptyListResponse = await axios.get(`${API_BASE_URL}/driver/${driverUserId}/orders`);
    log('Initial orders response:', emptyListResponse.data);
    if (!Array.isArray(emptyListResponse.data) || emptyListResponse.data.length !== 0) {
      throw new Error('Expected initial orders list to be empty');
    }

    // Test 2: create order successfully
    log('TEST 2: Creating driver order...', `POST /api/driver/${driverUserId}/orders`);
    const createOrderResponse = await axios.post(`${API_BASE_URL}/driver/${driverUserId}/orders`, {
      items: [
        { itemId: itemA, quantity: 2 },
        { itemId: itemB, quantity: 1 },
      ],
    });
    log('Created order response:', createOrderResponse.data);

    if (createOrderResponse.status !== 201 || createOrderResponse.data.orderStatus !== 'confirmed') {
      throw new Error('Expected successful order creation with confirmed status');
    }

    const orderId = createOrderResponse.data.orderId;
    createdOrderIds.push(orderId);

    const balanceAfterCreate = await getDriverPointBalance(driverUserId);
    if (balanceAfterCreate !== 500) {
      throw new Error(`Expected point balance 500 after creation, got ${balanceAfterCreate}`);
    }

    // Test 3: list returns created order + items
    log('TEST 3: Listing orders after creation...', `GET /api/driver/${driverUserId}/orders`);
    const listResponse = await axios.get(`${API_BASE_URL}/driver/${driverUserId}/orders`);
    log('Orders after create:', listResponse.data);

    if (!Array.isArray(listResponse.data) || listResponse.data.length < 1) {
      throw new Error('Expected at least one order after creation');
    }

    const createdOrder = listResponse.data.find((o) => o.orderId === orderId);
    if (!createdOrder || !Array.isArray(createdOrder.items) || createdOrder.items.length !== 2) {
      throw new Error('Expected created order with two items in listing');
    }

    // Test 4: update confirmed order
    log('TEST 4: Updating confirmed order...', `PATCH /api/driver/${driverUserId}/orders/${orderId}`);
    const updateResponse = await axios.patch(`${API_BASE_URL}/driver/${driverUserId}/orders/${orderId}`, {
      items: [
        { itemId: itemA, quantity: 1 },
        { itemId: itemB, quantity: 1 },
      ],
    });
    log('Order update response:', updateResponse.data);

    const balanceAfterUpdate = await getDriverPointBalance(driverUserId);
    if (balanceAfterUpdate !== 600) {
      throw new Error(`Expected point balance 600 after update, got ${balanceAfterUpdate}`);
    }

    // Test 5: reject foreign sponsor item
    log('TEST 5: Rejecting foreign sponsor item...', `POST /api/driver/${driverUserId}/orders`);
    try {
      await axios.post(`${API_BASE_URL}/driver/${driverUserId}/orders`, {
        items: [{ itemId: forbiddenItem, quantity: 1 }],
      });
      throw new Error('Expected request to fail for foreign sponsor item');
    } catch (error) {
      if (!error.response || error.response.status !== 400) {
        throw error;
      }
      log('Expected foreign item rejection:', error.response.data);
    }

    // Test 6: reject insufficient points
    log('TEST 6: Rejecting order for insufficient points...', `POST /api/driver/${driverUserId}/orders`);
    try {
      await axios.post(`${API_BASE_URL}/driver/${driverUserId}/orders`, {
        items: [{ itemId: itemB, quantity: 10 }],
      });
      throw new Error('Expected insufficient points failure');
    } catch (error) {
      if (!error.response || error.response.status !== 400) {
        throw error;
      }
      log('Expected insufficient points rejection:', error.response.data);
    }

    // Test 7: cancel confirmed order
    log('TEST 7: Cancelling confirmed order...', `DELETE /api/driver/${driverUserId}/orders/${orderId}`);
    const cancelResponse = await axios.delete(`${API_BASE_URL}/driver/${driverUserId}/orders/${orderId}`);
    log('Order cancel response:', cancelResponse.data);

    const balanceAfterCancel = await getDriverPointBalance(driverUserId);
    if (balanceAfterCancel !== 1000) {
      throw new Error(`Expected point balance 1000 after cancellation, got ${balanceAfterCancel}`);
    }

    // Test 8: update cancelled order should fail
    log('TEST 8: Updating cancelled order should fail...', `PATCH /api/driver/${driverUserId}/orders/${orderId}`);
    try {
      await axios.patch(`${API_BASE_URL}/driver/${driverUserId}/orders/${orderId}`, {
        items: [{ itemId: itemA, quantity: 1 }],
      });
      throw new Error('Expected update on cancelled order to fail');
    } catch (error) {
      if (!error.response || error.response.status !== 409) {
        throw error;
      }
      log('Expected cancelled order update rejection:', error.response.data);
    }

    // Test 9: invalid user id
    log('TEST 9: Invalid user id should fail...', 'GET /api/driver/abc/orders');
    try {
      await axios.get(`${API_BASE_URL}/driver/abc/orders`);
      throw new Error('Expected invalid user id to fail');
    } catch (error) {
      if (!error.response || error.response.status !== 400) {
        throw error;
      }
      log('Expected invalid user rejection:', error.response.data);
    }

    console.log('\nAll driver orders tests completed successfully!');
  } catch (error) {
    console.error('\nDriver orders tests failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    console.log('\nCleaning up test data...');
    await cleanupTestData();
    await closePool();
    process.exit(0);
  }
}

runTests();
