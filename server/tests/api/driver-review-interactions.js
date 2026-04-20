import axios from 'axios';
import {
  BASE_URL,
  closePool,
  createTestSponsor,
  cleanupSponsorCompanies,
  createTestUser,
  createTestDriverProfile,
  log,
} from '../setup.js';
import { pool } from '../../src/db.js';

const API_BASE_URL = `${BASE_URL}/api`;

const createdSponsorCompanyIds = [];
const createdCatalogIds = [];
const createdItemIds = [];
const createdOrderIds = [];
const createdReviewIds = [];
const createdEventIds = [];
const createdUserIds = [];

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

async function createCatalogItem(catalogId, suffix) {
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      `INSERT INTO CATALOG_ITEMS
        (CatalogID, APIID, ItemName, OriginalSource, Description, PointCost, ImageUrl)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        catalogId,
        `drv-review-int-${suffix}-${Date.now()}`,
        `Interaction Item ${suffix}`,
        'fakestoreapi',
        `Interaction Item ${suffix} description`,
        100,
        'https://example.com/review-interactions.jpg',
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
      `INSERT INTO ORDER_ITEMS (OrderID, ItemID, Quantity, UnitPointCost, UnitDollarCost)
       VALUES (?, ?, 1, 100, 1.0)`,
      [orderId, itemId]
    );

    return orderId;
  } finally {
    connection.release();
  }
}

async function createVisibleReview(itemId, userId, reviewBody) {
  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      `INSERT INTO REVIEWS (ItemID, UserID, Rating, ReviewBody, IsVisible, Timestamp)
       VALUES (?, ?, 4, ?, 1, NOW())`,
      [itemId, userId, reviewBody]
    );

    return result.insertId;
  } finally {
    connection.release();
  }
}

async function cleanupTestData() {
  const connection = await pool.getConnection();
  try {
    for (const eventId of createdEventIds) {
      await connection.query('DELETE FROM EVENTS WHERE EventID = ?', [eventId]);
      console.log(`Deleted event ${eventId}`);
    }

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
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [userId]);
      console.log(`Deleted user ${userId}`);
    }
  } catch (error) {
    console.error('Error cleaning up driver review interaction test data:', error.message);
  } finally {
    connection.release();
  }

  await cleanupSponsorCompanies(createdSponsorCompanyIds);
}

async function runTests() {
  try {
    console.log('Starting driver review interactions tests...\n');

    const sponsorCompanyId = await createTestSponsor({
      companyName: `Driver Review Interactions ${Date.now()}`,
      pointDollarValue: 0.01,
    });
    createdSponsorCompanyIds.push(sponsorCompanyId);

    const foreignSponsorCompanyId = await createTestSponsor({
      companyName: `Foreign Review Scope ${Date.now()}`,
      pointDollarValue: 0.01,
    });
    createdSponsorCompanyIds.push(foreignSponsorCompanyId);

    const driver = await createTestUser({ userType: 'driver' });
    const foreignDriver = await createTestUser({ userType: 'driver' });
    createdUserIds.push(driver.userId, foreignDriver.userId);

    const driverProfile = await createTestDriverProfile({
      userId: driver.userId,
      sponsorCompanyId,
      licenseNumber: `DRVINT_${Date.now()}`,
      pointBalance: 1000,
      performanceStatus: 'good',
    });

    await createTestDriverProfile({
      userId: foreignDriver.userId,
      sponsorCompanyId: foreignSponsorCompanyId,
      licenseNumber: `DRVFRN_${Date.now()}`,
      pointBalance: 1000,
      performanceStatus: 'good',
    });

    const catalogId = await createCatalog(sponsorCompanyId);
    const foreignCatalogId = await createCatalog(foreignSponsorCompanyId);
    createdCatalogIds.push(catalogId, foreignCatalogId);

    const reviewableItemId = await createCatalogItem(catalogId, 'reviewable');
    const foreignItemId = await createCatalogItem(foreignCatalogId, 'foreign');
    createdItemIds.push(reviewableItemId, foreignItemId);

    const orderId = await createOrder(driverProfile.licenseNumber, sponsorCompanyId, reviewableItemId, 'confirmed');
    createdOrderIds.push(orderId);

    const foreignReviewId = await createVisibleReview(foreignItemId, foreignDriver.userId, 'Foreign sponsor review');
    createdReviewIds.push(foreignReviewId);

    const draftUrl = `${API_BASE_URL}/driver/${driver.userId}/reviews/drafts/${reviewableItemId}`;
    const reviewsUrl = `${API_BASE_URL}/driver/${driver.userId}/reviews`;
    const sponsorParams = { sponsorCompanyId };

    log('TEST 1: Save review draft', `PUT ${draftUrl}`);
    const saveDraftResponse = await axios.put(
      draftUrl,
      {
        rating: 5,
        body: 'Draft body before final submission.',
      },
      { params: sponsorParams }
    );

    if (saveDraftResponse.status !== 200 || !saveDraftResponse.data?.draft) {
      throw new Error('Expected draft save response with draft payload');
    }

    createdEventIds.push(Number(saveDraftResponse.data.draft.draftId));

    log('TEST 2: Load active review draft', `GET ${draftUrl}`);
    const loadDraftResponse = await axios.get(draftUrl, { params: sponsorParams });
    if (loadDraftResponse.status !== 200 || !loadDraftResponse.data?.draft) {
      throw new Error('Expected active draft to be returned');
    }

    if (String(loadDraftResponse.data.draft.body) !== 'Draft body before final submission.') {
      throw new Error('Expected persisted draft body to round-trip');
    }

    log('TEST 3: Submit review finalizes draft', `POST ${reviewsUrl}`);
    const createReviewResponse = await axios.post(
      reviewsUrl,
      {
        itemId: reviewableItemId,
        rating: 5,
        body: 'Final review from migrated route.',
      },
      { params: sponsorParams }
    );

    if (createReviewResponse.status !== 201 || !Number.isInteger(createReviewResponse.data?.reviewId)) {
      throw new Error('Expected review creation to succeed and return reviewId');
    }

    const createdReviewId = Number(createReviewResponse.data.reviewId);
    createdReviewIds.push(createdReviewId);

    const loadDraftAfterSubmit = await axios.get(draftUrl, { params: sponsorParams });
    if (loadDraftAfterSubmit.status !== 200 || loadDraftAfterSubmit.data?.draft !== null) {
      throw new Error('Expected draft to be finalized and removed from active draft lookup');
    }

    log('TEST 4: List sponsor-scoped reviews for discussion', `GET ${reviewsUrl}`);
    const listReviewsResponse = await axios.get(reviewsUrl, { params: sponsorParams });
    const listedReviews = Array.isArray(listReviewsResponse.data?.reviews) ? listReviewsResponse.data.reviews : [];
    if (!listedReviews.some((review) => Number(review.reviewId) === createdReviewId)) {
      throw new Error('Expected newly submitted review to appear in discussion list');
    }

    const commentsUrl = `${API_BASE_URL}/driver/${driver.userId}/reviews/${createdReviewId}/comments`;

    log('TEST 5: Post top-level comment', `POST ${commentsUrl}`);
    const topLevelCommentResponse = await axios.post(
      commentsUrl,
      { text: 'First comment on this review.' },
      { params: sponsorParams }
    );

    if (topLevelCommentResponse.status !== 201 || !topLevelCommentResponse.data?.comment) {
      throw new Error('Expected comment creation to succeed');
    }

    const topLevelCommentId = Number(topLevelCommentResponse.data.comment.commentId);
    createdEventIds.push(topLevelCommentId);

    log('TEST 6: Post reply comment', `POST ${commentsUrl}`);
    const replyResponse = await axios.post(
      commentsUrl,
      {
        text: 'Reply to first comment.',
        parentCommentId: topLevelCommentId,
      },
      { params: sponsorParams }
    );

    if (replyResponse.status !== 201 || !replyResponse.data?.comment) {
      throw new Error('Expected reply comment creation to succeed');
    }

    createdEventIds.push(Number(replyResponse.data.comment.commentId));

    log('TEST 7: List comments for sponsor-scoped review', `GET ${commentsUrl}`);
    const listCommentsResponse = await axios.get(commentsUrl, { params: sponsorParams });
    const comments = Array.isArray(listCommentsResponse.data?.comments) ? listCommentsResponse.data.comments : [];

    if (comments.length < 2) {
      throw new Error(`Expected at least 2 comments after reply creation, got ${comments.length}`);
    }

    if (!comments.some((comment) => Number(comment.parentCommentId) === topLevelCommentId)) {
      throw new Error('Expected reply comment to include parentCommentId linkage');
    }

    log('TEST 8: Reject cross-sponsor comment access', `POST /driver/${driver.userId}/reviews/${foreignReviewId}/comments`);
    try {
      await axios.post(
        `${API_BASE_URL}/driver/${driver.userId}/reviews/${foreignReviewId}/comments`,
        { text: 'Should not be allowed across sponsor scope.' },
        { params: sponsorParams }
      );
      throw new Error('Expected cross-sponsor review comment call to fail');
    } catch (error) {
      if (!error.response || error.response.status !== 404) {
        throw error;
      }
    }

    log('TEST 9: Reject draft save for foreign sponsor item', `PUT /driver/${driver.userId}/reviews/drafts/${foreignItemId}`);
    try {
      await axios.put(
        `${API_BASE_URL}/driver/${driver.userId}/reviews/drafts/${foreignItemId}`,
        {
          rating: 4,
          body: 'Foreign item draft should fail',
        },
        { params: sponsorParams }
      );
      throw new Error('Expected foreign sponsor item draft save to fail');
    } catch (error) {
      if (!error.response || error.response.status !== 403) {
        throw error;
      }
    }

    console.log('\nDriver review interactions tests completed successfully!');
  } catch (error) {
    console.error('\nDriver review interactions tests failed:');
    process.exitCode = 1;

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    await cleanupTestData();
    await closePool();
  }
}

runTests();
