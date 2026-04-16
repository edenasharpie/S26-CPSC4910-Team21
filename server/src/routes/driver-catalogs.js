import express from 'express';
import { pool } from '../db.js';
import {
  getEffectiveSessionUser,
  routeUserMatchesEffectiveSession,
} from '../middleware/session-context.js';
import { 
  getCatalogsBySponsorCompany 
} from '../utils/queries.js';

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

const router = express.Router({ mergeParams: true });

// Middleware to validate user and get sponsor company ID
async function validateDriverAndGetSponsorId(req, res, next) {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
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

    // Attach to request for use in route handlers
    req.sponsorCompanyId = sponsorCompanyId;
    req.driverLicenseNumber = licenseNumber;
    next();
  } catch (error) {
    console.error('Error validating driver:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// Apply middleware to all routes
router.use(validateDriverAndGetSponsorId);

// GET /driver/:userId/catalogs
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const catalogs = await getCatalogsBySponsorCompany(
      req.sponsorCompanyId,
      limit,
      offset
    );

    res.json(catalogs);
  } catch (error) {
    console.error('Error fetching driver catalogs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /driver/:userId/catalogs/:catalogId
router.get('/:catalogId', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const { catalogId } = req.params;

    // Check if catalog exists and belongs to driver's sponsor company
    const catalogResult = await connection.query(
      `SELECT 
        c.CatalogID as id,
        c.SponsorCompanyID as sponsorCompanyId,
        sc.CompanyName as sponsorCompanyName
       FROM CATALOGS c
       LEFT JOIN SPONSOR_COMPANIES sc ON c.SponsorCompanyID = sc.SponsorCompanyID
       WHERE c.CatalogID = ? AND c.SponsorCompanyID = ?`,
      [catalogId, req.sponsorCompanyId]
    );

    if (catalogResult[0].length === 0) {
      return res.status(404).json({ error: 'Catalog not found' });
    }

    // Get all items in the catalog
    const itemsResult = await connection.query(
      `SELECT 
        ItemID as id,
        APIID as externalProductId,
        ItemName as name,
        OriginalSource as originalSource,
        Description as description,
        PointCost as pointCost,
        ImageUrl as imageUrl
       FROM CATALOG_ITEMS
       WHERE CatalogID = ?`,
      [catalogId]
    );

    const catalog = catalogResult[0][0];
    catalog.itemCount = itemsResult[0].length;
    catalog.items = itemsResult[0];

    res.json(catalog);
  } catch (error) {
    console.error('Error fetching driver catalog details:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// GET /driver/:userId/catalogs/:catalogId/items/:itemId
router.get('/:catalogId/items/:itemId', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const { catalogId, itemId } = req.params;

    // Verify catalog belongs to driver's sponsor company
    const catalogCheck = await connection.query(
      'SELECT CatalogID FROM CATALOGS WHERE CatalogID = ? AND SponsorCompanyID = ?',
      [catalogId, req.sponsorCompanyId]
    );

    if (catalogCheck[0].length === 0) {
      return res.status(404).json({ error: 'Catalog not found' });
    }

    // Get the item
    const result = await connection.query(
      `SELECT 
        ItemID as id,
        APIID as externalProductId,
        ItemName as name,
        OriginalSource as originalSource,
        Description as description,
        PointCost as pointCost,
        ImageUrl as imageUrl
       FROM CATALOG_ITEMS
       WHERE CatalogID = ? AND ItemID = ?`,
      [catalogId, itemId]
    );

    if (result[0].length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(result[0][0]);
  } catch (error) {
    console.error('Error fetching catalog item:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

export default router;
