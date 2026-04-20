import express from 'express';
import { pool } from '../db.js';
import {
  getEffectiveSessionUser,
  routeUserMatchesEffectiveSession,
} from '../middleware/session-context.js';
import {
  clearReviewDraft,
  createReviewComment,
  ensureDriverEligibleOrder,
  ensureItemInSponsorCatalog,
  ensureReviewInSponsorScope,
  finalizeReviewDraft,
  getReviewCommentById,
  listDriverSponsorReviews,
  listReviewComments,
  loadActiveReviewDraft,
  normalizeCommentPayload,
  normalizeDraftPayload,
  upsertReviewDraft,
} from '../services/review-interactions-service.js';

const router = express.Router({ mergeParams: true });

function getAssumedSponsorOriginalUser(req, expectedDriverUserId) {
  const sessionContext = req.sessionContext;
  if (!sessionContext?.isAssumed) {
    return null;
  }

  const effectiveUser = sessionContext.effectiveUser;
  const originalUser = sessionContext.originalUser;

  if (
    !effectiveUser ||
    !originalUser ||
    String(effectiveUser.UserType).toLowerCase() !== 'driver' ||
    String(originalUser.UserType).toLowerCase() !== 'sponsor' ||
    Number(effectiveUser.UserID) !== Number(expectedDriverUserId)
  ) {
    return null;
  }

  return originalUser;
}

async function loadDriverContext(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (!routeUserMatchesEffectiveSession(req, userId)) {
      return res.status(403).json({ error: 'Access forbidden for requested user context.' });
    }

    const effectiveSessionUser = getEffectiveSessionUser(req);
    const effectiveRole = effectiveSessionUser?.UserType;

    if (effectiveRole && effectiveRole !== 'driver') {
      return res.status(404).json({ error: 'Driver account not found' });
    }

    const [userRows] = effectiveRole
      ? await pool.execute(
          'SELECT UserID, ActiveStatus FROM USERS WHERE UserID = ? LIMIT 1',
          [userId]
        )
      : await pool.execute(
          'SELECT UserID, UserType, ActiveStatus FROM USERS WHERE UserID = ? LIMIT 1',
          [userId]
        );

    if (userRows.length === 0 || (!effectiveRole && userRows[0].UserType !== 'driver')) {
      return res.status(404).json({ error: 'Driver account not found' });
    }

    if (!Boolean(userRows[0].ActiveStatus)) {
      return res.status(403).json({ error: 'Driver account is inactive.' });
    }

    const assumedOriginalSponsor = getAssumedSponsorOriginalUser(req, userId);

    let sponsorCompanyId = null;
    if (assumedOriginalSponsor) {
      const [sponsorRows] = await pool.execute(
        'SELECT SponsorCompanyID FROM SPONSORS WHERE UserID = ? LIMIT 1',
        [assumedOriginalSponsor.UserID]
      );

      if (sponsorRows.length === 0) {
        return res.status(403).json({ error: 'Assumed sponsor context is invalid.' });
      }

      sponsorCompanyId = Number(sponsorRows[0].SponsorCompanyID);
    } else {
      const rawSponsorCompanyId = req.query?.sponsorCompanyId;
      const parsed = typeof rawSponsorCompanyId === 'string' ? Number(rawSponsorCompanyId) : Number(rawSponsorCompanyId);
      sponsorCompanyId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }

    if (!Number.isInteger(sponsorCompanyId)) {
      return res.status(400).json({ error: 'sponsorCompanyId is required.' });
    }

    const [driverRows] = await pool.execute(
      'SELECT LicenseNumber FROM DRIVERS WHERE UserID = ? LIMIT 1',
      [userId]
    );

    if (driverRows.length === 0) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    const licenseNumber = String(driverRows[0].LicenseNumber);

    const [enrollmentRows] = await pool.execute(
      `SELECT EnrollmentID
       FROM DRIVER_COMPANY_ENROLLMENT
       WHERE DriverID = ?
         AND SponsorCompanyID = ?
         AND EnrollmentStatus = 'active'
       LIMIT 1`,
      [licenseNumber, sponsorCompanyId]
    );

    if (enrollmentRows.length === 0) {
      return res.status(403).json({ error: 'Access forbidden: Driver not enrolled in the requested sponsor company' });
    }

    req.driver = {
      userId,
      licenseNumber,
      sponsorCompanyId,
    };

    return next();
  } catch (error) {
    console.error('Driver review context error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

router.use(loadDriverContext);

function normalizeRating(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    return null;
  }

  return parsed;
}

async function ensureDriverReviewEligibility(connection, driverContext, itemId) {
  const itemInCatalog = await ensureItemInSponsorCatalog(
    connection,
    itemId,
    driverContext.sponsorCompanyId
  );

  if (!itemInCatalog) {
    return {
      ok: false,
      statusCode: 403,
      error: 'Item is not available in the requested sponsor company catalog',
    };
  }

  const hasEligibleOrder = await ensureDriverEligibleOrder(
    connection,
    driverContext.licenseNumber,
    driverContext.sponsorCompanyId,
    itemId
  );

  if (!hasEligibleOrder) {
    return {
      ok: false,
      statusCode: 403,
      error: 'You can only review items after creating an eligible order for that item',
    };
  }

  return { ok: true };
}

router.get('/', async (req, res) => {
  const itemId = req.query?.itemId;
  const limit = req.query?.limit;

  const connection = await pool.getConnection();
  try {
    const reviews = await listDriverSponsorReviews(connection, req.driver.sponsorCompanyId, {
      itemId,
      limit,
    });

    return res.status(200).json({
      success: true,
      reviews,
    });
  } catch (error) {
    console.error('Error listing driver sponsor reviews:', error);
    return res.status(500).json({ error: 'Could not load reviews. Please try again.' });
  } finally {
    connection.release();
  }
});

router.post('/', async (req, res) => {
  const itemId = Number(req.body?.itemId);
  const rating = normalizeRating(req.body?.rating);
  const reviewBody = String(req.body?.body ?? '').trim();

  if (!Number.isInteger(itemId) || itemId <= 0) {
    return res.status(400).json({ error: 'itemId must be a positive integer' });
  }

  if (rating === null) {
    return res.status(400).json({ error: 'rating must be an integer between 1 and 5' });
  }

  if (!reviewBody) {
    return res.status(400).json({ error: 'body is required' });
  }

  if (reviewBody.length > 1000) {
    return res.status(400).json({ error: 'body must be 1000 characters or fewer' });
  }

  const connection = await pool.getConnection();
  try {
    const eligibility = await ensureDriverReviewEligibility(connection, req.driver, itemId);
    if (!eligibility.ok) {
      return res.status(eligibility.statusCode).json({ error: eligibility.error });
    }

    const [insertResult] = await connection.execute(
      `INSERT INTO REVIEWS (ItemID, UserID, Rating, ReviewBody, IsVisible, Timestamp)
       VALUES (?, ?, ?, ?, 1, NOW())`,
      [itemId, req.driver.userId, rating, reviewBody]
    );

    await finalizeReviewDraft(
      connection,
      req.driver.userId,
      req.driver.sponsorCompanyId,
      itemId
    );

    return res.status(201).json({
      message: 'Review submitted successfully!',
      reviewId: insertResult.insertId,
    });
  } catch (error) {
    console.error('Error creating driver review:', error);
    return res.status(500).json({ error: 'Could not post review. Please try again.' });
  } finally {
    connection.release();
  }
});

router.get('/:reviewId/comments', async (req, res) => {
  const reviewId = Number(req.params.reviewId);
  if (!Number.isInteger(reviewId) || reviewId <= 0) {
    return res.status(400).json({ error: 'reviewId must be a positive integer' });
  }

  const connection = await pool.getConnection();
  try {
    const review = await ensureReviewInSponsorScope(
      connection,
      reviewId,
      req.driver.sponsorCompanyId,
      { visibleOnly: true }
    );

    if (!review) {
      return res.status(404).json({ error: 'Review not found in requested sponsor company scope' });
    }

    const comments = await listReviewComments(connection, reviewId, req.driver.sponsorCompanyId);
    return res.status(200).json({
      success: true,
      comments,
    });
  } catch (error) {
    console.error('Error listing review comments:', error);
    return res.status(500).json({ error: 'Could not load comments. Please try again.' });
  } finally {
    connection.release();
  }
});

router.post('/:reviewId/comments', async (req, res) => {
  const reviewId = Number(req.params.reviewId);
  if (!Number.isInteger(reviewId) || reviewId <= 0) {
    return res.status(400).json({ error: 'reviewId must be a positive integer' });
  }

  const normalizedPayload = normalizeCommentPayload(req.body?.text, req.body?.parentCommentId);
  if (normalizedPayload.error) {
    return res.status(400).json({ error: normalizedPayload.error });
  }

  const connection = await pool.getConnection();
  try {
    const review = await ensureReviewInSponsorScope(
      connection,
      reviewId,
      req.driver.sponsorCompanyId,
      { visibleOnly: true }
    );

    if (!review) {
      return res.status(404).json({ error: 'Review not found in requested sponsor company scope' });
    }

    if (normalizedPayload.parentCommentId !== null) {
      const parentComment = await getReviewCommentById(
        connection,
        normalizedPayload.parentCommentId,
        reviewId,
        req.driver.sponsorCompanyId
      );

      if (!parentComment) {
        return res.status(404).json({ error: 'Parent comment not found for this review' });
      }
    }

    const createdComment = await createReviewComment(connection, {
      reviewId,
      sponsorCompanyId: req.driver.sponsorCompanyId,
      userId: req.driver.userId,
      parentCommentId: normalizedPayload.parentCommentId,
      text: normalizedPayload.text,
    });

    return res.status(201).json({
      success: true,
      comment: createdComment,
    });
  } catch (error) {
    console.error('Error creating review comment:', error);
    return res.status(500).json({ error: 'Could not post comment. Please try again.' });
  } finally {
    connection.release();
  }
});

router.get('/drafts/:itemId', async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return res.status(400).json({ error: 'itemId must be a positive integer' });
  }

  const connection = await pool.getConnection();
  try {
    const itemInCatalog = await ensureItemInSponsorCatalog(connection, itemId, req.driver.sponsorCompanyId);
    if (!itemInCatalog) {
      return res.status(403).json({ error: 'Item is not available in the requested sponsor company catalog' });
    }

    const draft = await loadActiveReviewDraft(
      connection,
      req.driver.userId,
      req.driver.sponsorCompanyId,
      itemId
    );

    return res.status(200).json({
      success: true,
      draft,
    });
  } catch (error) {
    console.error('Error loading review draft:', error);
    return res.status(500).json({ error: 'Could not load draft. Please try again.' });
  } finally {
    connection.release();
  }
});

router.put('/drafts/:itemId', async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return res.status(400).json({ error: 'itemId must be a positive integer' });
  }

  const normalizedPayload = normalizeDraftPayload(req.body?.body, req.body?.rating);
  if (normalizedPayload.error) {
    return res.status(400).json({ error: normalizedPayload.error });
  }

  const connection = await pool.getConnection();
  try {
    const eligibility = await ensureDriverReviewEligibility(connection, req.driver, itemId);
    if (!eligibility.ok) {
      return res.status(eligibility.statusCode).json({ error: eligibility.error });
    }

    const draft = await upsertReviewDraft(connection, {
      itemId,
      sponsorCompanyId: req.driver.sponsorCompanyId,
      userId: req.driver.userId,
      body: normalizedPayload.body,
      rating: normalizedPayload.rating,
    });

    return res.status(200).json({
      success: true,
      message: 'Draft saved successfully.',
      draft,
    });
  } catch (error) {
    console.error('Error saving review draft:', error);
    return res.status(500).json({ error: 'Could not save draft. Please try again.' });
  } finally {
    connection.release();
  }
});

router.delete('/drafts/:itemId', async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return res.status(400).json({ error: 'itemId must be a positive integer' });
  }

  const connection = await pool.getConnection();
  try {
    const itemInCatalog = await ensureItemInSponsorCatalog(connection, itemId, req.driver.sponsorCompanyId);
    if (!itemInCatalog) {
      return res.status(403).json({ error: 'Item is not available in the requested sponsor company catalog' });
    }

    const cleared = await clearReviewDraft(
      connection,
      req.driver.userId,
      req.driver.sponsorCompanyId,
      itemId
    );

    return res.status(200).json({
      success: true,
      message: cleared ? 'Draft cleared successfully.' : 'No active draft found.',
    });
  } catch (error) {
    console.error('Error clearing review draft:', error);
    return res.status(500).json({ error: 'Could not clear draft. Please try again.' });
  } finally {
    connection.release();
  }
});

export default router;