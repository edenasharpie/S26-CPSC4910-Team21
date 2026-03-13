import express from 'express';
import { pool } from '../db.js';
import store from '../services/fakeStoreService.js';
import { 
  getSponsorCompanyId, 
  userExists,
  getCatalogsBySponsorCompany,
  verifyCatalogOwnership 
} from '../utils/queries.js';

const router = express.Router({ mergeParams: true });

// Middleware to validate user and get sponsor company ID
async function validateSponsorAndGetCompanyId(req, res, next) {
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

    // Get sponsor's company ID
    const sponsorCompanyId = await getSponsorCompanyId(userId);
    if (!sponsorCompanyId) {
      return res.status(403).json({ 
        error: 'Access forbidden: User is not a sponsor' 
      });
    }

    // Attach to request for use in route handlers
    req.sponsorCompanyId = sponsorCompanyId;
    next();
  } catch (error) {
    console.error('Error validating sponsor:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// Apply middleware to all routes
router.use(validateSponsorAndGetCompanyId);

// GET /sponsor/:userId/catalogs
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
    console.error('Error fetching sponsor catalogs:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /sponsor/:userId/catalogs
router.post('/', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Create catalog with sponsor's company ID (auto-populated from auth)
    const catalogResult = await connection.query(
      'INSERT INTO CATALOGS (SponsorCompanyID) VALUES (?)',
      [req.sponsorCompanyId]
    );
    
    const catalogId = catalogResult[0].insertId;

    // If items with store IDs are provided, find and add them
    if (req.body.externalProductIds && req.body.externalProductIds.length > 0) {
      for (const itemId of req.body.externalProductIds) {
        const product = await store.getProductById(itemId);
        const catalogItem = store.transformToCatalogItem(
          product,
          req.body.pointCost
        );

        await connection.query(
          `INSERT INTO CATALOG_ITEMS 
           (CatalogID, APIID, ItemName, OriginalSource, Description, PointCost, ImageUrl) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            catalogId,
            catalogItem.externalProductId,
            catalogItem.name,
            catalogItem.originalSource,
            catalogItem.description,
            catalogItem.pointCost,
            catalogItem.imageUrl
          ]
        );
      }
    }

    await connection.commit();

    // Return complete catalog
    const fullCatalog = await connection.query(
      `SELECT 
        c.CatalogID as id,
        c.SponsorCompanyID as sponsorCompanyId,
        sc.CompanyName as sponsorCompanyName,
        COUNT(ci.ItemID) as itemCount
       FROM CATALOGS c
       LEFT JOIN CATALOG_ITEMS ci ON c.CatalogID = ci.CatalogID
       LEFT JOIN SPONSOR_COMPANIES sc ON c.SponsorCompanyID = sc.SponsorCompanyID
       WHERE c.CatalogID = ?
       GROUP BY c.CatalogID`,
      [catalogId]
    );

    res.status(201).json(fullCatalog[0][0]);
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error creating sponsor catalog:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// GET /sponsor/:userId/catalogs/:catalogId
router.get('/:catalogId', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const { catalogId } = req.params;

    // Check if catalog exists and belongs to sponsor's company
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
    console.error('Error fetching sponsor catalog details:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// PATCH /sponsor/:userId/catalogs/:catalogId
router.patch('/:catalogId', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const { catalogId } = req.params;
    
    // Verify ownership before allowing update
    const isOwner = await verifyCatalogOwnership(catalogId, req.sponsorCompanyId);
    if (!isOwner) {
      return res.status(403).json({ 
        error: 'Access forbidden: Catalog does not belong to your company' 
      });
    }

    // Note: For sponsors, we don't allow changing sponsorCompanyId
    // The catalog is permanently tied to their company
    
    // Fetch updated catalog (even if no changes, return current state)
    const result = await connection.query(
      `SELECT 
        c.CatalogID as id,
        c.SponsorCompanyID as sponsorCompanyId,
        sc.CompanyName as sponsorCompanyName,
        COUNT(ci.ItemID) as itemCount
       FROM CATALOGS c
       LEFT JOIN CATALOG_ITEMS ci ON c.CatalogID = ci.CatalogID
       LEFT JOIN SPONSOR_COMPANIES sc ON c.SponsorCompanyID = sc.SponsorCompanyID
       WHERE c.CatalogID = ?
       GROUP BY c.CatalogID`,
      [catalogId]
    );

    if (result[0].length === 0) {
      return res.status(404).json({ error: 'Catalog not found' });
    }

    await connection.commit();
    res.json(result[0][0]);
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error updating sponsor catalog:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// DELETE /sponsor/:userId/catalogs/:catalogId
router.delete('/:catalogId', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const { catalogId } = req.params;
    
    // Verify ownership before allowing deletion
    const isOwner = await verifyCatalogOwnership(catalogId, req.sponsorCompanyId);
    if (!isOwner) {
      return res.status(403).json({ 
        error: 'Access forbidden: Catalog does not belong to your company' 
      });
    }
    
    // Delete catalog items first
    await connection.query(
      'DELETE FROM CATALOG_ITEMS WHERE CatalogID = ?',
      [catalogId]
    );
    
    // Delete catalog itself
    const result = await connection.query(
      'DELETE FROM CATALOGS WHERE CatalogID = ?',
      [catalogId]
    );
    
    if (result[0].affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Catalog not found' });
    }
    
    await connection.commit();
    res.status(204).send();
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error deleting sponsor catalog:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// POST /sponsor/:userId/catalogs/:catalogId/items
router.post('/:catalogId/items', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const { catalogId } = req.params;
    
    // Verify ownership
    const isOwner = await verifyCatalogOwnership(catalogId, req.sponsorCompanyId);
    if (!isOwner) {
      return res.status(403).json({ 
        error: 'Access forbidden: Catalog does not belong to your company' 
      });
    }

    const { externalProductId, pointCost, name, description, imageUrl, originalSource } = req.body;

    let itemData;

    // If the product ID is given, get details from the store, otherwise use manual entry
    if (externalProductId) {
      const product = await store.getProductById(externalProductId);
      itemData = store.transformToCatalogItem(product, pointCost);
    } else {
      // Manual item entry
      itemData = { name, description, pointCost, imageUrl, originalSource };
    }

    const result = await connection.query(
      `INSERT INTO CATALOG_ITEMS 
       (CatalogID, APIID, ItemName, OriginalSource, Description, PointCost, ImageUrl) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        catalogId,
        itemData.externalProductId || '',
        itemData.name,
        itemData.originalSource || '',
        itemData.description,
        itemData.pointCost,
        itemData.imageUrl || ''
      ]
    );

    const newItem = await connection.query(
      `SELECT 
        ItemID as id,
        APIID as externalProductId,
        ItemName as name,
        OriginalSource as originalSource,
        Description as description,
        PointCost as pointCost,
        ImageUrl as imageUrl
       FROM CATALOG_ITEMS
       WHERE ItemID = ?`,
      [result[0].insertId]
    );

    await connection.commit();
    res.status(201).json(newItem[0][0]);
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error creating catalog item:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// GET /sponsor/:userId/catalogs/:catalogId/items/:itemId
router.get('/:catalogId/items/:itemId', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const { catalogId, itemId } = req.params;

    // Verify catalog belongs to sponsor's company
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

// PATCH /sponsor/:userId/catalogs/:catalogId/items/:itemId
router.patch('/:catalogId/items/:itemId', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const { catalogId, itemId } = req.params;
    
    // Verify ownership
    const isOwner = await verifyCatalogOwnership(catalogId, req.sponsorCompanyId);
    if (!isOwner) {
      return res.status(403).json({ 
        error: 'Access forbidden: Catalog does not belong to your company' 
      });
    }

    const { name, description, pointCost, imageUrl } = req.body;

    const updates = [];
    const values = [];

    if (name) {
      updates.push('ItemName = ?');
      values.push(name);
    }
    if (description) {
      updates.push('Description = ?');
      values.push(description);
    }
    if (pointCost) {
      updates.push('PointCost = ?');
      values.push(pointCost);
    }
    if (imageUrl) {
      updates.push('ImageUrl = ?');
      values.push(imageUrl);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(catalogId, itemId);

    await connection.query(
      `UPDATE CATALOG_ITEMS SET ${updates.join(', ')} WHERE CatalogID = ? AND ItemID = ?`,
      values
    );

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
      await connection.rollback();
      return res.status(404).json({ error: 'Item not found' });
    }

    await connection.commit();
    res.json(result[0][0]);
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error updating catalog item:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// DELETE /sponsor/:userId/catalogs/:catalogId/items/:itemId
router.delete('/:catalogId/items/:itemId', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const { catalogId, itemId } = req.params;
    
    // Verify ownership
    const isOwner = await verifyCatalogOwnership(catalogId, req.sponsorCompanyId);
    if (!isOwner) {
      return res.status(403).json({ 
        error: 'Access forbidden: Catalog does not belong to your company' 
      });
    }

    const result = await connection.query(
      'DELETE FROM CATALOG_ITEMS WHERE CatalogID = ? AND ItemID = ?',
      [catalogId, itemId]
    );

    if (result[0].affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Item not found' });
    }

    await connection.commit();
    res.status(204).send();
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error deleting catalog item:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

export default router;
