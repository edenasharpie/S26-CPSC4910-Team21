import axios from 'axios';
import jwt from 'jsonwebtoken';
import {
  BASE_URL,
  log,
  createTestSponsor,
  cleanupSponsorCompanies,
  closePool,
  createTestUser,
  createTestSponsorProfile,
  createTestDriverProfile,
} from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-fleetscore';

const createdUserIds = [];
const createdSponsorCompanyIds = [];
const createdCatalogIds = [];
const createdItemIds = [];
const createdReviewIds = [];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryOnStatuses(requestFn, retryStatuses, maxAttempts = 6, delayMs = 250) {
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      return await requestFn();
    } catch (error) {
      const status = error.response?.status;
      attempt += 1;

      if (attempt >= maxAttempts || !retryStatuses.includes(status)) {
        throw error;
      }

      await sleep(delayMs);
    }
  }
}

async function cleanupUsers(userIds) {
  if (!userIds || userIds.length === 0) {
    return;
  }

  const connection = await pool.getConnection();
  try {
    for (const userId of userIds) {
      await connection.query('DELETE FROM EVENTS WHERE UserID = ?', [userId]);
      await connection.query(
        'DELETE FROM DRIVER_COMPANY_ENROLLMENT WHERE DriverID IN (SELECT LicenseNumber FROM DRIVERS WHERE UserID = ?)',
        [userId]
      );
      await connection.query('DELETE FROM DRIVERS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM SPONSORS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM ADMINS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [userId]);
      console.log(`Deleted user ${userId}`);
    }
  } catch (error) {
    console.error('Error cleaning up users:', error.message);
  } finally {
    connection.release();
  }
}

async function cleanupReviewsAndCatalogData() {
  const connection = await pool.getConnection();
  try {
    for (const reviewId of createdReviewIds) {
      await connection.query('DELETE FROM REVIEWS WHERE ReviewID = ?', [reviewId]);
      console.log(`Deleted review ${reviewId}`);
    }

    for (const itemId of createdItemIds) {
      await connection.query('DELETE FROM CATALOG_ITEMS WHERE ItemID = ?', [itemId]);
      console.log(`Deleted catalog item ${itemId}`);
    }

    for (const catalogId of createdCatalogIds) {
      await connection.query('DELETE FROM CATALOGS WHERE CatalogID = ?', [catalogId]);
      console.log(`Deleted catalog ${catalogId}`);
    }
  } catch (error) {
    console.error('Error cleaning up catalog/review data:', error.message);
  } finally {
    connection.release();
  }
}

async function createCatalogAndItemForCompany(sponsorCompanyId, itemSuffix) {
  const connection = await pool.getConnection();
  try {
    const [catalogResult] = await connection.query(
      'INSERT INTO CATALOGS (SponsorCompanyID) VALUES (?)',
      [sponsorCompanyId]
    );

    const catalogId = catalogResult.insertId;
    createdCatalogIds.push(catalogId);

    const [itemResult] = await connection.query(
      `INSERT INTO CATALOG_ITEMS
       (CatalogID, APIID, ItemName, OriginalSource, Description, PointCost, ImageUrl)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        catalogId,
        `api-${itemSuffix}`,
        `Item ${itemSuffix}`,
        'fakestoreapi',
        `Desc ${itemSuffix}`,
        100,
        'https://img.test/a.jpg',
      ]
    );

    const itemId = itemResult.insertId;
    createdItemIds.push(itemId);
    return { catalogId, itemId };
  } finally {
    connection.release();
  }
}

async function createReview(itemId, userId, isVisible, body) {
  const connection = await pool.getConnection();
  try {
    const [reviewResult] = await connection.query(
      `INSERT INTO REVIEWS (ItemID, UserID, Rating, ReviewBody, IsVisible, Timestamp)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [itemId, userId, 4, body, isVisible]
    );

    const reviewId = reviewResult.insertId;
    createdReviewIds.push(reviewId);
    return reviewId;
  } finally {
    connection.release();
  }
}

async function getReviewVisibility(reviewId) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      'SELECT IsVisible FROM REVIEWS WHERE ReviewID = ? LIMIT 1',
      [reviewId]
    );

    if (rows.length === 0) {
      return null;
    }

    return Number(rows[0].IsVisible);
  } finally {
    connection.release();
  }
}

function buildAssumedSponsorCookie(adminIdentity, sponsorIdentity) {
  const token = jwt.sign(
    {
      UserID: sponsorIdentity.UserID,
      UserType: 'sponsor',
      Username: sponsorIdentity.Username,
      OriginalUser: {
        UserID: adminIdentity.UserID,
        UserType: 'admin',
        Username: adminIdentity.Username,
      },
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  return `sessionId=${token}`;
}

async function runTests() {
  try {
    console.log('Starting sponsor reviews endpoint tests...\n');

    log('TEST SETUP: Creating sponsor companies', 'Setup');
    const sponsorCompanyA = await createTestSponsor({
      companyName: `Sponsor Reviews A ${Date.now()}`,
      pointDollarValue: 0.01,
    });
    const sponsorCompanyB = await createTestSponsor({
      companyName: `Sponsor Reviews B ${Date.now()}`,
      pointDollarValue: 0.01,
    });
    createdSponsorCompanyIds.push(sponsorCompanyA, sponsorCompanyB);

    log('TEST SETUP: Creating sponsor/admin/driver users', 'Setup');
    const sponsorA = await createTestUser({ userType: 'sponsor' });
    const sponsorB = await createTestUser({ userType: 'sponsor' });
    const admin = await createTestUser({ userType: 'admin' });
    const driverA = await createTestUser({ userType: 'driver' });
    const driverB = await createTestUser({ userType: 'driver' });

    createdUserIds.push(
      sponsorA.userId,
      sponsorB.userId,
      admin.userId,
      driverA.userId,
      driverB.userId
    );

    await createTestSponsorProfile({ userId: sponsorA.userId, sponsorCompanyId: sponsorCompanyA });
    await createTestSponsorProfile({ userId: sponsorB.userId, sponsorCompanyId: sponsorCompanyB });

    await createTestDriverProfile({
      userId: driverA.userId,
      sponsorCompanyId: sponsorCompanyA,
      licenseNumber: `SRVA_${Date.now()}`,
      pointBalance: 100,
      performanceStatus: 'good',
    });
    await createTestDriverProfile({
      userId: driverB.userId,
      sponsorCompanyId: sponsorCompanyB,
      licenseNumber: `SRVB_${Date.now()}`,
      pointBalance: 100,
      performanceStatus: 'good',
    });

    log('TEST SETUP: Creating catalogs/items/reviews by sponsor company', 'Setup');
    const sponsorAItem = await createCatalogAndItemForCompany(sponsorCompanyA, 'A');
    const sponsorBItem = await createCatalogAndItemForCompany(sponsorCompanyB, 'B');

    const sponsorAReviewId = await createReview(
      sponsorAItem.itemId,
      driverA.userId,
      1,
      'Sponsor A scoped review'
    );
    const sponsorBReviewId = await createReview(
      sponsorBItem.itemId,
      driverB.userId,
      1,
      'Sponsor B scoped review'
    );

    // Test 1: Sponsor can list only own company reviews
    log('TEST 1: Sponsor gets only in-scope reviews', `GET /api/sponsor/${sponsorA.userId}/reviews`);
    const sponsorAListResponse = await retryOnStatuses(
      () => axios.get(`${API_BASE_URL}/sponsor/${sponsorA.userId}/reviews`),
      [404]
    );

    if (sponsorAListResponse.status !== 200) {
      throw new Error('Expected 200 for sponsor reviews list');
    }

    const sponsorAReviews = sponsorAListResponse.data?.reviews ?? [];
    if (!Array.isArray(sponsorAReviews) || sponsorAReviews.length !== 1) {
      throw new Error(`Expected 1 in-scope review, got ${sponsorAReviews.length}`);
    }

    if (Number(sponsorAReviews[0].ReviewID) !== Number(sponsorAReviewId)) {
      throw new Error('Expected sponsor A to see only sponsor A review');
    }

    // Test 2: Sponsor can toggle visibility for in-scope review
    log('TEST 2: Sponsor toggles in-scope review visibility', `PATCH /api/sponsor/${sponsorA.userId}/reviews/${sponsorAReviewId}/visibility`);
    const beforeToggle = await getReviewVisibility(sponsorAReviewId);
    const toggleResponse = await axios.patch(
      `${API_BASE_URL}/sponsor/${sponsorA.userId}/reviews/${sponsorAReviewId}/visibility`,
      {}
    );

    if (toggleResponse.status !== 200 || !toggleResponse.data?.success) {
      throw new Error('Expected successful visibility toggle for in-scope review');
    }

    const afterToggle = await getReviewVisibility(sponsorAReviewId);
    if (beforeToggle === null || afterToggle === null || beforeToggle === afterToggle) {
      throw new Error('Expected review visibility to be toggled');
    }

    // Test 3: Sponsor cannot toggle out-of-scope review
    log('TEST 3: Sponsor cannot toggle out-of-scope review', `PATCH /api/sponsor/${sponsorA.userId}/reviews/${sponsorBReviewId}/visibility`);
    try {
      await axios.patch(`${API_BASE_URL}/sponsor/${sponsorA.userId}/reviews/${sponsorBReviewId}/visibility`, {});
      throw new Error('Expected 404 when toggling out-of-scope review');
    } catch (error) {
      if (!error.response || error.response.status !== 404) {
        throw error;
      }
    }

    // Test 4: Admin assuming sponsor can access assumed sponsor review scope
    log('TEST 4: Admin-assume-sponsor can list sponsor reviews', `GET /api/sponsor/${sponsorA.userId}/reviews with assumed session cookie`);
    const assumedCookie = buildAssumedSponsorCookie(
      { UserID: admin.userId, Username: admin.username },
      { UserID: sponsorA.userId, Username: sponsorA.username }
    );

    const assumedListResponse = await axios.get(`${API_BASE_URL}/sponsor/${sponsorA.userId}/reviews`, {
      headers: { Cookie: assumedCookie },
    });

    if (assumedListResponse.status !== 200) {
      throw new Error('Expected 200 for admin-assume-sponsor reviews list');
    }

    const assumedReviews = assumedListResponse.data?.reviews ?? [];
    if (!Array.isArray(assumedReviews) || assumedReviews.length !== 1) {
      throw new Error('Expected assumed sponsor context to return only sponsor-scoped reviews');
    }

    // Test 5: Assumed session with mismatched route userId is blocked
    log('TEST 5: Assumed sponsor mismatched route userId returns 403', `GET /api/sponsor/${sponsorB.userId}/reviews with sponsorA assumed cookie`);
    try {
      await axios.get(`${API_BASE_URL}/sponsor/${sponsorB.userId}/reviews`, {
        headers: { Cookie: assumedCookie },
      });
      throw new Error('Expected 403 for assumed-session route user mismatch');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }

    console.log('\nSponsor reviews endpoint tests completed successfully!');
  } catch (error) {
    console.error('\nSponsor reviews tests failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    await cleanupReviewsAndCatalogData();
    await cleanupUsers(createdUserIds);
    await cleanupSponsorCompanies(createdSponsorCompanyIds);
    await closePool();
  }
}

runTests();
