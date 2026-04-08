import express from 'express';
import { pool } from '../db.js';
import {
  getEffectiveSessionUser,
  routeUserMatchesEffectiveSession,
} from '../middleware/session-context.js';
import { getSponsorCompanyId } from '../utils/queries.js';

const router = express.Router({ mergeParams: true });

async function validateSponsorAndGetCompanyId(req, res, next) {
  try {
    const userId = Number.parseInt(req.params.userId, 10);

    if (Number.isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (!routeUserMatchesEffectiveSession(req, userId)) {
      return res.status(403).json({ error: 'Access forbidden for requested user context.' });
    }

    const effectiveSessionUser = getEffectiveSessionUser(req);
    const effectiveRole = effectiveSessionUser?.UserType;

    if (effectiveRole && effectiveRole !== 'sponsor') {
      return res.status(403).json({ error: 'Access forbidden: User is not a sponsor' });
    }

    const [userRows] = effectiveRole
      ? await pool.execute('SELECT ActiveStatus FROM USERS WHERE UserID = ? LIMIT 1', [userId])
      : await pool.execute('SELECT UserType, ActiveStatus FROM USERS WHERE UserID = ? LIMIT 1', [userId]);

    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!Boolean(userRows[0].ActiveStatus)) {
      return res.status(403).json({ error: 'Access forbidden: Inactive account' });
    }

    if (!effectiveRole && userRows[0].UserType !== 'sponsor') {
      return res.status(403).json({ error: 'Access forbidden: User is not a sponsor' });
    }

    const sponsorCompanyId = await getSponsorCompanyId(userId);
    if (!sponsorCompanyId) {
      return res.status(403).json({ error: 'Access forbidden: User is not a sponsor' });
    }

    req.sponsorCompanyId = sponsorCompanyId;
    next();
  } catch (error) {
    console.error('Error validating sponsor reviews context:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

router.use(validateSponsorAndGetCompanyId);


/**
 * GET /api/sponsor/:userId/reviews
 * Fetches reviews for items in catalogs belonging to the sponsor's company.
 */
router.get('/', async (req, res) => {
  try {
    const [reviews] = await pool.execute(
      `
      SELECT 
        r.ReviewID, 
        r.UserID AS DriverID, 
        r.ItemID,
        r.Rating, 
        r.ReviewBody, 
        r.IsVisible,
        r.Timestamp,
        u.Username AS DriverName
      FROM REVIEWS r
      JOIN USERS u ON r.UserID = u.UserID
      JOIN CATALOG_ITEMS ci ON ci.ItemID = r.ItemID
      JOIN CATALOGS c ON c.CatalogID = ci.CatalogID
      WHERE c.SponsorCompanyID = ?
      ORDER BY r.Timestamp DESC
      `,
      [req.sponsorCompanyId]
    );

    res.json({ success: true, reviews });
  } catch (err) {
    console.error('Error fetching reviews from RDS:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch reviews.' });
  }
});

/**
 * PATCH /api/sponsor/:userId/reviews/:reviewId/visibility
 * Allows a sponsor to hide/show a review scoped to their sponsor company.
 */
router.patch('/:reviewId/visibility', async (req, res) => {
  const reviewId = Number.parseInt(req.params.reviewId, 10);

  if (Number.isNaN(reviewId)) {
    return res.status(400).json({ success: false, error: 'Invalid reviewId' });
  }

  try {
    // The join ensures sponsors can only modify reviews for their own company catalogs.
    const [result] = await pool.execute(
      `
      UPDATE REVIEWS r
      JOIN CATALOG_ITEMS ci ON ci.ItemID = r.ItemID
      JOIN CATALOGS c ON c.CatalogID = ci.CatalogID
      SET r.IsVisible = NOT r.IsVisible
      WHERE r.ReviewID = ? AND c.SponsorCompanyID = ?
      `,
      [reviewId, req.sponsorCompanyId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Review not found or unauthorized.' });
    }

    res.json({ success: true, message: 'Review visibility updated.' });
  } catch (err) {
    console.error('Error toggling review visibility:', err);
    res.status(500).json({ success: false, error: 'Database update failed.' });
  }
});

export default router;