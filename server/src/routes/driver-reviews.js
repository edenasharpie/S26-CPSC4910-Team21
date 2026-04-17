import express from 'express';
import { pool } from '../db.js';
import {
  getEffectiveSessionUser,
  routeUserMatchesEffectiveSession,
} from '../middleware/session-context.js';

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
    const [catalogItemRows] = await connection.execute(
      `SELECT ci.ItemID
       FROM CATALOG_ITEMS ci
       JOIN CATALOGS c ON c.CatalogID = ci.CatalogID
       WHERE ci.ItemID = ?
         AND c.SponsorCompanyID = ?
       LIMIT 1`,
      [itemId, req.driver.sponsorCompanyId]
    );

    if (catalogItemRows.length === 0) {
      return res.status(403).json({ error: 'Item is not available in the requested sponsor company catalog' });
    }

    const [eligibleOrderRows] = await connection.execute(
      `SELECT o.OrderID
       FROM ORDERS o
       JOIN ORDER_ITEMS oi ON oi.OrderID = o.OrderID
       WHERE o.DriverID = ?
         AND o.SponsorCompanyID = ?
         AND oi.ItemID = ?
         AND o.OrderStatus IN ('confirmed', 'shipped', 'delivered')
       LIMIT 1`,
      [req.driver.licenseNumber, req.driver.sponsorCompanyId, itemId]
    );

    if (eligibleOrderRows.length === 0) {
      return res.status(403).json({ error: 'You can only review items after creating an eligible order for that item' });
    }

    const [insertResult] = await connection.execute(
      `INSERT INTO REVIEWS (ItemID, UserID, Rating, ReviewBody, IsVisible, Timestamp)
       VALUES (?, ?, ?, ?, 1, NOW())`,
      [itemId, req.driver.userId, rating, reviewBody]
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

export default router;