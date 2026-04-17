import axios from 'axios';
import jwt from 'jsonwebtoken';
import {
  BASE_URL,
  log,
  createTestSponsor,
  cleanupSponsorCompanies,
  closePool,
  getEventsByUserId,
} from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-fleetscore';

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

async function createTestSponsorProfile(userId, sponsorCompanyId) {
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

    await connection.query(
      `INSERT INTO DRIVER_COMPANY_ENROLLMENT
        (DriverID, SponsorCompanyID, PointBalance, EnrollmentStatus, JoinedAt, LeftAt)
       VALUES (?, ?, ?, 'active', NOW(), NULL)
       ON DUPLICATE KEY UPDATE
         EnrollmentStatus = 'active',
         LeftAt = NULL,
         PointBalance = VALUES(PointBalance)`,
      [licenseNumber, sponsorCompanyId, pointBalance]
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

async function createLegacyOrder(driverLicense, sponsorCompanyId, itemId) {
  const connection = await pool.getConnection();
  try {
    const [orderResult] = await connection.query(
      `INSERT INTO ORDERS
       (DriverID, SponsorCompanyID, OrderDate, OrderPointsSpent, OrderDollarsSpent, OrderStatus)
       VALUES (?, ?, ?, ?, ?, 'confirmed')`,
      [driverLicense, sponsorCompanyId, '1970-01-01 00:00:00', 25, 0.25]
    );

    const orderId = orderResult.insertId;

    await connection.query(
      `INSERT INTO ORDER_ITEMS
       (OrderID, ItemID, Quantity, UnitPointCost, UnitDollarCost)
       VALUES (?, ?, 1, 25, 0.25)`,
      [orderId, itemId]
    );

    return orderId;
  } finally {
    connection.release();
  }
}

async function getDriverPointBalance(userId, sponsorCompanyId) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT
         COALESCE(e.PointBalance, d.PointBalance) AS PointBalance
       FROM DRIVERS d
       LEFT JOIN DRIVER_COMPANY_ENROLLMENT e
         ON e.DriverID = d.LicenseNumber
        AND e.SponsorCompanyID = ?
        AND e.EnrollmentStatus = 'active'
       WHERE d.UserID = ?
       LIMIT 1`,
      [sponsorCompanyId, userId]
    );
    return rows[0]?.PointBalance ?? null;
  } finally {
    connection.release();
  }
}

async function setDriverAlertOrders(userId, enabled) {
  const connection = await pool.getConnection();
  try {
    await connection.query('UPDATE DRIVERS SET AlertOrders = ? WHERE UserID = ?', [enabled ? 1 : 0, userId]);
  } finally {
    connection.release();
  }
}

async function getLatestOrderPointTransaction(orderId, expectedReason) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT TransactionID, UserChanged, PointChange, ReasonForChange
       FROM POINT_TRANSACTIONS
       WHERE ReasonForChange = ?
       ORDER BY TransactionID DESC
       LIMIT 1`,
      [expectedReason ?? `Order #${orderId} updated`]
    );
    return rows[0] ?? null;
  } finally {
    connection.release();
  }
}

function buildSessionCookie(user, originalUser = null) {
  const payload = {
    UserID: user.userId,
    UserType: user.userType,
    Username: user.username,
  };

  if (originalUser) {
    payload.OriginalUser = {
      UserID: originalUser.userId,
      UserType: originalUser.userType,
      Username: originalUser.username,
    };
  }

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: 60 * 60 * 24 });
  return `sessionId=${token}`;
}

function parseEventProperties(rawProperties) {
  if (!rawProperties) return {};
  if (typeof rawProperties === 'object') return rawProperties;
  try {
    return JSON.parse(rawProperties);
  } catch {
    return {};
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
      await connection.query('DELETE FROM EVENTS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM POINT_TRANSACTIONS WHERE UserChanged = ?', [userId]);
      await connection.query('DELETE FROM DRIVERS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM SPONSORS WHERE UserID = ?', [userId]);
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

    const sponsorUserId = await createTestUser('sponsor');
    createdUserIds.push(sponsorUserId);
    await createTestSponsorProfile(sponsorUserId, sponsorCompanyId);

    const license = await createTestDriver(driverUserId, sponsorCompanyId, 1000);
    createdDriverLicenses.push(license);

    const driverIdentity = { userId: driverUserId, userType: 'driver', username: `drv_${driverUserId}` };
    const sponsorIdentity = { userId: sponsorUserId, userType: 'sponsor', username: `sps_${sponsorUserId}` };
    const assumedSponsorCookie = buildSessionCookie(driverIdentity, sponsorIdentity);

    const catalogId = await createTestCatalog(sponsorCompanyId);
    createdCatalogIds.push(catalogId);

    const itemA = await createTestCatalogItem(catalogId, 'Safety Gloves', 100);
    const itemB = await createTestCatalogItem(catalogId, 'Dash Cam', 300);
    createdItemIds.push(itemA, itemB);

    const otherCatalogId = await createTestCatalog(otherSponsorCompanyId);
    createdCatalogIds.push(otherCatalogId);
    const forbiddenItem = await createTestCatalogItem(otherCatalogId, 'Other Sponsor Item', 50);
    createdItemIds.push(forbiddenItem);

    const legacyOrderId = await createLegacyOrder(license, sponsorCompanyId, itemA);
    createdOrderIds.push(legacyOrderId);

    const scopeParams = { sponsorCompanyId };

    // Test 1: list orders initially empty
    log('TEST 1: Listing orders before creation...', `GET /api/driver/${driverUserId}/orders`);
    const emptyListResponse = await axios.get(`${API_BASE_URL}/driver/${driverUserId}/orders`, {
      params: scopeParams,
    });
    log('Initial orders response:', emptyListResponse.data);
    if (!Array.isArray(emptyListResponse.data) || emptyListResponse.data.length !== 0) {
      throw new Error('Expected initial orders list to be empty');
    }

    // Test 2: create order successfully
    log('TEST 2: Creating driver order...', `POST /api/driver/${driverUserId}/orders`);
    const createOrderResponse = await axios.post(
      `${API_BASE_URL}/driver/${driverUserId}/orders`,
      {
        items: [
          { itemId: itemA, quantity: 2 },
          { itemId: itemB, quantity: 1 },
        ],
      },
      { params: scopeParams }
    );
    log('Created order response:', createOrderResponse.data);

    if (createOrderResponse.status !== 201 || createOrderResponse.data.orderStatus !== 'confirmed') {
      throw new Error('Expected successful order creation with confirmed status');
    }

    const orderId = createOrderResponse.data.orderId;
    createdOrderIds.push(orderId);

    const balanceAfterCreate = await getDriverPointBalance(driverUserId, sponsorCompanyId);
    if (balanceAfterCreate !== 500) {
      throw new Error(`Expected point balance 500 after creation, got ${balanceAfterCreate}`);
    }

    // Test 3: list returns created order + items
    log('TEST 3: Listing orders after creation...', `GET /api/driver/${driverUserId}/orders`);
    const listResponse = await axios.get(`${API_BASE_URL}/driver/${driverUserId}/orders`, {
      params: scopeParams,
    });
    log('Orders after create:', listResponse.data);

    if (!Array.isArray(listResponse.data) || listResponse.data.length < 1) {
      throw new Error('Expected at least one order after creation');
    }

    const createdOrder = listResponse.data.find((o) => o.orderId === orderId);
    if (!createdOrder || !Array.isArray(createdOrder.items) || createdOrder.items.length !== 2) {
      throw new Error('Expected created order with two items in listing');
    }

    if (typeof createdOrder.orderDate !== 'string' || !createdOrder.orderDate.trim()) {
      throw new Error('Expected orderDate to be a non-empty string in order listing');
    }

    const createdOrderDate = new Date(createdOrder.orderDate);
    if (Number.isNaN(createdOrderDate.getTime()) || createdOrderDate.getUTCFullYear() < 2000) {
      throw new Error(`Expected orderDate to be a valid modern timestamp, got ${createdOrder.orderDate}`);
    }

    // Test 4: update confirmed order
    log('TEST 4: Updating confirmed order...', `PATCH /api/driver/${driverUserId}/orders/${orderId}`);
    const updateResponse = await axios.patch(
      `${API_BASE_URL}/driver/${driverUserId}/orders/${orderId}`,
      {
        items: [
          { itemId: itemA, quantity: 1 },
          { itemId: itemB, quantity: 1 },
        ],
      },
      { params: scopeParams }
    );
    log('Order update response:', updateResponse.data);

    const balanceAfterUpdate = await getDriverPointBalance(driverUserId, sponsorCompanyId);
    if (balanceAfterUpdate !== 600) {
      throw new Error(`Expected point balance 600 after update, got ${balanceAfterUpdate}`);
    }

    // Test 5: reject foreign sponsor item
    log('TEST 5: Rejecting foreign sponsor item...', `POST /api/driver/${driverUserId}/orders`);
    try {
      await axios.post(
        `${API_BASE_URL}/driver/${driverUserId}/orders`,
        { items: [{ itemId: forbiddenItem, quantity: 1 }] },
        { params: scopeParams }
      );
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
      await axios.post(
        `${API_BASE_URL}/driver/${driverUserId}/orders`,
        { items: [{ itemId: itemB, quantity: 10 }] },
        { params: scopeParams }
      );
      throw new Error('Expected insufficient points failure');
    } catch (error) {
      if (!error.response || error.response.status !== 400) {
        throw error;
      }
      log('Expected insufficient points rejection:', error.response.data);
    }

    // Test 7: cancel confirmed order
    log('TEST 7: Cancelling confirmed order...', `DELETE /api/driver/${driverUserId}/orders/${orderId}`);
    const cancelResponse = await axios.delete(`${API_BASE_URL}/driver/${driverUserId}/orders/${orderId}`, {
      params: scopeParams,
    });
    log('Order cancel response:', cancelResponse.data);

    const balanceAfterCancel = await getDriverPointBalance(driverUserId, sponsorCompanyId);
    if (balanceAfterCancel !== 1000) {
      throw new Error(`Expected point balance 1000 after cancellation, got ${balanceAfterCancel}`);
    }

    // Test 8: update cancelled order should fail
    log('TEST 8: Updating cancelled order should fail...', `PATCH /api/driver/${driverUserId}/orders/${orderId}`);
    try {
      await axios.patch(
        `${API_BASE_URL}/driver/${driverUserId}/orders/${orderId}`,
        { items: [{ itemId: itemA, quantity: 1 }] },
        { params: scopeParams }
      );
      throw new Error('Expected update on cancelled order to fail');
    } catch (error) {
      if (!error.response || error.response.status !== 409) {
        throw error;
      }
      log('Expected cancelled order update rejection:', error.response.data);
    }

    // Test 9: sponsor-assumed update attributes UserChanged and notifies driver
    log('TEST 9: Sponsor assumed-view update records actor and notifies driver', `PATCH /api/driver/${driverUserId}/orders/:orderId`);
    const sponsorManagedOrderResponse = await axios.post(
      `${API_BASE_URL}/driver/${driverUserId}/orders`,
      { items: [{ itemId: itemA, quantity: 1 }] },
      { params: scopeParams }
    );

    const sponsorManagedOrderId = sponsorManagedOrderResponse.data.orderId;
    createdOrderIds.push(sponsorManagedOrderId);

    const sponsorUpdateResponse = await axios.patch(
      `${API_BASE_URL}/driver/${driverUserId}/orders/${sponsorManagedOrderId}`,
      {
        items: [
          { itemId: itemA, quantity: 1 },
          { itemId: itemB, quantity: 1 },
        ],
      },
      {
        params: scopeParams,
        headers: { Cookie: assumedSponsorCookie },
      }
    );

    if (sponsorUpdateResponse.status !== 200) {
      throw new Error('Expected sponsor-assumed order update to succeed');
    }

    const updatedOrderTransaction = await getLatestOrderPointTransaction(
      sponsorManagedOrderId,
      `Order #${sponsorManagedOrderId} updated`
    );
    if (!updatedOrderTransaction) {
      throw new Error('Expected point transaction for sponsor-assumed order update');
    }

    if (Number(updatedOrderTransaction.UserChanged) !== Number(sponsorUserId)) {
      throw new Error('Expected UserChanged to be sponsor user for assumed sponsor order update');
    }

    const driverNotificationsAfterSponsorUpdate = await getEventsByUserId(driverUserId, 'Notification', 50);
    const sponsorUpdateNotification = driverNotificationsAfterSponsorUpdate.find((event) => {
      const properties = parseEventProperties(event.Properties);
      return (
        properties.category === 'driver_order_changed_by_sponsor' &&
        Number(properties.orderId) === Number(sponsorManagedOrderId) &&
        properties.changeType === 'updated_by_sponsor'
      );
    });

    if (!sponsorUpdateNotification) {
      throw new Error('Expected driver notification for sponsor-assumed order update');
    }

    // Test 10: sponsor-assumed order status update notifies driver
    log('TEST 10: Sponsor assumed-view status update notifies driver', `PATCH /api/driver/${driverUserId}/orders/:orderId/status`);
    const beforeStatusNotifications = await getEventsByUserId(driverUserId, 'Notification', 80);
    const beforeStatusCount = beforeStatusNotifications.length;

    const statusResponse = await axios.patch(
      `${API_BASE_URL}/driver/${driverUserId}/orders/${sponsorManagedOrderId}/status`,
      { orderStatus: 'shipped' },
      {
        params: scopeParams,
        headers: { Cookie: assumedSponsorCookie },
      }
    );

    if (statusResponse.status !== 200 || statusResponse.data.orderStatus !== 'shipped') {
      throw new Error('Expected sponsor-assumed order status update to shipped');
    }

    const afterStatusNotifications = await getEventsByUserId(driverUserId, 'Notification', 90);
    const statusNotification = afterStatusNotifications.find((event) => {
      const properties = parseEventProperties(event.Properties);
      return (
        properties.category === 'driver_order_status_changed' &&
        Number(properties.orderId) === Number(sponsorManagedOrderId) &&
        properties.newStatus === 'shipped'
      );
    });

    if (!statusNotification) {
      throw new Error('Expected driver notification for sponsor-assumed order status change');
    }

    // Test 11: alertOrders disables status notifications
    log('TEST 11: Driver AlertOrders disables status notifications', `PATCH /api/driver/${driverUserId}/orders/:orderId/status`);
    await setDriverAlertOrders(driverUserId, false);

    await axios.patch(
      `${API_BASE_URL}/driver/${driverUserId}/orders/${sponsorManagedOrderId}/status`,
      { orderStatus: 'delivered' },
      {
        params: scopeParams,
        headers: { Cookie: assumedSponsorCookie },
      }
    );

    const afterSuppressedStatusNotifications = await getEventsByUserId(driverUserId, 'Notification', 100);
    if (afterSuppressedStatusNotifications.length !== beforeStatusCount + 1) {
      throw new Error('Expected no additional status notification when AlertOrders is disabled');
    }

    await setDriverAlertOrders(driverUserId, true);

    // Test 12: invalid user id
    log('TEST 12: Invalid user id should fail...', 'GET /api/driver/abc/orders');
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
    process.exitCode = 1;
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
    process.exit(process.exitCode ?? 0);
  }
}

runTests();
