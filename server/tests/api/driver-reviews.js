import axios from 'axios';
import jwt from 'jsonwebtoken';
import {
  BASE_URL,
  log,
  closePool,
  createTestSponsor,
  cleanupSponsorCompanies,
  createTestUser,
  createTestSponsorProfile,
  createTestDriverProfile,
} from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-fleetscore';

const createdSponsorCompanyIds = [];
const createdCatalogIds = [];
const createdItemIds = [];
const createdOrderIds = [];
const createdReviewIds = [];
const createdUserIds = [];

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

async function createCatalog(sponsorCompanyId) {
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

async function createCatalogItem(catalogId, suffix, pointCost = 100) {
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      `INSERT INTO CATALOG_ITEMS
        (CatalogID, APIID, ItemName, OriginalSource, Description, PointCost, ImageUrl)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        catalogId,
        `drv-review-api-${suffix}-${Date.now()}`,
        `Review Item ${suffix}`,
        'fakestoreapi',
        `Review Item ${suffix} description`,
        pointCost,
        'https://example.com/review-item.jpg',
      ]
    );
    return result.insertId;
  } finally {
    connection.release();
  }
}

async function createOrder(driverLicense, sponsorCompanyId, itemId, orderStatus = 'confirmed') {
  const connection = await pool.getConnection();
  try {
    const [orderResult] = await connection.query(
      `INSERT INTO ORDERS
        (DriverID, SponsorCompanyID, OrderDate, OrderPointsSpent, OrderDollarsSpent, OrderStatus)
       VALUES (?, ?, NOW(), ?, ?, ?)`,
      [driverLicense, sponsorCompanyId, 100, 1.0, orderStatus]
    );

    const orderId = orderResult.insertId;
    await connection.query(
      `INSERT INTO ORDER_ITEMS
        (OrderID, ItemID, Quantity, UnitPointCost, UnitDollarCost)
       VALUES (?, ?, 1, 100, 1.0)`,
      [orderId, itemId]
    );

    return orderId;
  } finally {
    connection.release();
  }
}

async function cleanupTestData() {
  const connection = await pool.getConnection();
  try {
    for (const reviewId of createdReviewIds) {
      await connection.query('DELETE FROM REVIEWS WHERE ReviewID = ?', [reviewId]);
      console.log(`Deleted review ${reviewId}`);
    }

    for (const orderId of createdOrderIds) {
      await connection.query('DELETE FROM ORDER_ITEMS WHERE OrderID = ?', [orderId]);
      await connection.query('DELETE FROM ORDERS WHERE OrderID = ?', [orderId]);
      console.log(`Deleted order ${orderId}`);
    }

    for (const itemId of createdItemIds) {
      await connection.query('DELETE FROM CATALOG_ITEMS WHERE ItemID = ?', [itemId]);
      console.log(`Deleted item ${itemId}`);
    }

    for (const catalogId of createdCatalogIds) {
      await connection.query('DELETE FROM CATALOGS WHERE CatalogID = ?', [catalogId]);
      console.log(`Deleted catalog ${catalogId}`);
    }

    for (const userId of createdUserIds) {
      await connection.query('DELETE FROM EVENTS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM DRIVER_COMPANY_ENROLLMENT WHERE DriverID IN (SELECT LicenseNumber FROM DRIVERS WHERE UserID = ?)', [userId]);
      await connection.query('DELETE FROM DRIVERS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM SPONSORS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [userId]);
      console.log(`Deleted user ${userId}`);
    }
  } catch (error) {
    console.error('Error cleaning up driver review test data:', error.message);
  } finally {
    connection.release();
  }

  await cleanupSponsorCompanies(createdSponsorCompanyIds);
}

async function runTests() {
  try {
    console.log('Starting driver reviews endpoint tests...\n');

    const sponsorCompanyId = await createTestSponsor({
      companyName: `Driver Reviews Sponsor ${Date.now()}`,
      pointDollarValue: 0.01,
    });
    createdSponsorCompanyIds.push(sponsorCompanyId);

    const otherSponsorCompanyId = await createTestSponsor({
      companyName: `Driver Reviews Other Sponsor ${Date.now()}`,
      pointDollarValue: 0.01,
    });
    createdSponsorCompanyIds.push(otherSponsorCompanyId);

    const driver = await createTestUser({ userType: 'driver' });
    const sponsor = await createTestUser({ userType: 'sponsor' });
    createdUserIds.push(driver.userId, sponsor.userId);

    await createTestDriverProfile({
      userId: driver.userId,
      sponsorCompanyId,
      licenseNumber: `DRVREV_${Date.now()}`,
      pointBalance: 1000,
      performanceStatus: 'good',
    });
    await createTestSponsorProfile({ userId: sponsor.userId, sponsorCompanyId });

    const sponsorCatalogId = await createCatalog(sponsorCompanyId);
    createdCatalogIds.push(sponsorCatalogId);

    const otherCatalogId = await createCatalog(otherSponsorCompanyId);
    createdCatalogIds.push(otherCatalogId);

    const orderedItemId = await createCatalogItem(sponsorCatalogId, 'ordered');
    const neverOrderedItemId = await createCatalogItem(sponsorCatalogId, 'never-ordered');
    const cancelledItemId = await createCatalogItem(sponsorCatalogId, 'cancelled');
    const foreignSponsorItemId = await createCatalogItem(otherCatalogId, 'foreign');
    createdItemIds.push(orderedItemId, neverOrderedItemId, cancelledItemId, foreignSponsorItemId);

    const [driverRows] = await pool.query('SELECT LicenseNumber FROM DRIVERS WHERE UserID = ? LIMIT 1', [driver.userId]);
    const driverLicense = String(driverRows[0]?.LicenseNumber ?? '');

    if (!driverLicense) {
      throw new Error('Failed to resolve driver license number during test setup');
    }

    const confirmedOrderId = await createOrder(driverLicense, sponsorCompanyId, orderedItemId, 'confirmed');
    const cancelledOrderId = await createOrder(driverLicense, sponsorCompanyId, cancelledItemId, 'cancelled');
    createdOrderIds.push(confirmedOrderId, cancelledOrderId);

    const scopeParams = { sponsorCompanyId };

    // Test 1: driver can review item that was ordered in an eligible order status.
    log('TEST 1: Driver can review an ordered item', `POST /api/driver/${driver.userId}/reviews`);
    const createReviewResponse = await axios.post(
      `${API_BASE_URL}/driver/${driver.userId}/reviews`,
      {
        itemId: orderedItemId,
        rating: 5,
        body: 'Great quality and arrived quickly.',
      },
      { params: scopeParams }
    );

    if (createReviewResponse.status !== 201 || !Number.isInteger(createReviewResponse.data?.reviewId)) {
      throw new Error('Expected 201 response with reviewId for valid driver review creation');
    }

    createdReviewIds.push(createReviewResponse.data.reviewId);

    // Test 2: duplicate reviews are allowed for the same ordered item.
    log('TEST 2: Duplicate reviews are allowed', `POST /api/driver/${driver.userId}/reviews`);
    const duplicateReviewResponse = await axios.post(
      `${API_BASE_URL}/driver/${driver.userId}/reviews`,
      {
        itemId: orderedItemId,
        rating: 4,
        body: 'Posting a second review for the same item.',
      },
      { params: scopeParams }
    );

    if (duplicateReviewResponse.status !== 201 || !Number.isInteger(duplicateReviewResponse.data?.reviewId)) {
      throw new Error('Expected duplicate review creation to succeed');
    }

    createdReviewIds.push(duplicateReviewResponse.data.reviewId);

    // Test 3: cannot review an item that has never been ordered.
    log('TEST 3: Reject review for non-ordered item', `POST /api/driver/${driver.userId}/reviews`);
    try {
      await axios.post(
        `${API_BASE_URL}/driver/${driver.userId}/reviews`,
        {
          itemId: neverOrderedItemId,
          rating: 3,
          body: 'I should not be allowed to post this review.',
        },
        { params: scopeParams }
      );
      throw new Error('Expected request to fail when item has not been ordered');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
      log('Expected non-ordered item rejection:', error.response.data);
    }

    // Test 4: cannot review items from a different sponsor company catalog context.
    log('TEST 4: Reject foreign sponsor item', `POST /api/driver/${driver.userId}/reviews`);
    try {
      await axios.post(
        `${API_BASE_URL}/driver/${driver.userId}/reviews`,
        {
          itemId: foreignSponsorItemId,
          rating: 5,
          body: 'This should fail due to sponsor scope mismatch.',
        },
        { params: scopeParams }
      );
      throw new Error('Expected request to fail for foreign sponsor catalog item');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
      log('Expected foreign sponsor rejection:', error.response.data);
    }

    // Test 5: cancelled-only orders are not eligible for review creation.
    log('TEST 5: Reject cancelled-only order item review', `POST /api/driver/${driver.userId}/reviews`);
    try {
      await axios.post(
        `${API_BASE_URL}/driver/${driver.userId}/reviews`,
        {
          itemId: cancelledItemId,
          rating: 2,
          body: 'This should fail because only cancelled orders exist.',
        },
        { params: scopeParams }
      );
      throw new Error('Expected request to fail when only cancelled orders exist for item');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
      log('Expected cancelled-order rejection:', error.response.data);
    }

    // Test 6: invalid payload validation.
    log('TEST 6: Reject invalid payload', `POST /api/driver/${driver.userId}/reviews`);
    try {
      await axios.post(
        `${API_BASE_URL}/driver/${driver.userId}/reviews`,
        {
          itemId: orderedItemId,
          rating: 8,
          body: 'Invalid rating value',
        },
        { params: scopeParams }
      );
      throw new Error('Expected invalid payload to fail');
    } catch (error) {
      if (!error.response || error.response.status !== 400) {
        throw error;
      }
      log('Expected invalid payload rejection:', error.response.data);
    }

    // Test 7: sponsor-assumed-driver can review under valid scope.
    log('TEST 7: Sponsor-assumed driver review submission', `POST /api/driver/${driver.userId}/reviews`);
    const driverIdentity = {
      userId: driver.userId,
      userType: 'driver',
      username: `drv_${driver.userId}`,
    };
    const sponsorIdentity = {
      userId: sponsor.userId,
      userType: 'sponsor',
      username: `sps_${sponsor.userId}`,
    };
    const assumedSponsorCookie = buildSessionCookie(driverIdentity, sponsorIdentity);

    const assumedResponse = await axios.post(
      `${API_BASE_URL}/driver/${driver.userId}/reviews`,
      {
        itemId: orderedItemId,
        rating: 5,
        body: 'Assumed sponsor review flow should still pass eligibility.',
      },
      {
        params: scopeParams,
        headers: { Cookie: assumedSponsorCookie },
      }
    );

    if (assumedResponse.status !== 201 || !Number.isInteger(assumedResponse.data?.reviewId)) {
      throw new Error('Expected assumed sponsor context review creation to succeed');
    }

    createdReviewIds.push(assumedResponse.data.reviewId);

    console.log('\nAll driver reviews tests completed successfully!');
  } catch (error) {
    console.error('\nDriver reviews tests failed:');
    process.exitCode = 1;

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    console.log('\nCleaning up driver reviews test data...');
    await cleanupTestData();
    await closePool();
    process.exit(process.exitCode ?? 0);
  }
}

runTests();