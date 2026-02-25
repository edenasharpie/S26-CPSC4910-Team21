import express from 'express';
import { pool } from '../db.js';
import { 
  getDriverSponsorCompanyId, 
  userExists,
  getCatalogsBySponsorCompany 
} from '../utils/queries.js';

const router = express.Router({ mergeParams: true });

// Middleware to validate user and get sponsor company ID
async function validateDriverAndGetSponsorId(req, res, next) {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    // Check if user exists
    const exists = await userExists(userId);
    if (!exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get driver's sponsor company ID
    const sponsorCompanyId = await getDriverSponsorCompanyId(userId);
    if (!sponsorCompanyId) {
      return res.status(403).json({ 
        error: 'Access forbidden: Driver not associated with a sponsor company' 
      });
    }

    // Attach to request for use in route handlers
    req.sponsorCompanyId = sponsorCompanyId;
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
