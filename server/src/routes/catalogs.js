import express from 'express';
import { pool } from '../db.js';
import store from '../services/fakeStoreService.js';

const router = express.Router();

// GET /catalogs
router.get('/', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const limit = parseInt(request.query.limit) || 10;
    const offset = parseInt(request.query.offset) || 0;

    const query = `
      SELECT 
        c.CatalogID as id,
        c.SponsorCompanyID as sponsorCompanyId,
        sc.CompanyName as sponsorCompanyName,
        COUNT(ci.ItemID) as itemCount
      FROM CATALOGS c
      LEFT JOIN CATALOG_ITEMS ci ON c.CatalogID = ci.CatalogID
      LEFT JOIN SPONSOR_COMPANIES sc ON c.SponsorCompanyID = sc.SponsorCompanyID
      GROUP BY c.CatalogID
      LIMIT ? OFFSET ?
    `;
    
    const result = await connection.query(query, [limit, offset]);

    response.json(result[0]);
  } catch (error) {
    console.error('Error fetching catalogs:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// POST /catalogs
router.post('/', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // create catalog
    const catalogResult = await connection.query(
      'INSERT INTO CATALOGS (SponsorCompanyID) VALUES (?)',
      [request.body.sponsorCompanyId]
    );
    
    const catalogId = catalogResult[0].insertId;

    // if items with store ids are provided, find and add them
    if (request.body.externalProductIds && request.body.externalProductIds.length > 0) {
      for (const itemId of request.body.externalProductIds) {
        const product = await store.getProductById(itemId);
        const catalogItem = store.transformToCatalogItem(
          product,
          request.body.pointCost
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

    // return complete catalog
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

    response.status(201).json(fullCatalog[0][0]);
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error creating catalog:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// GET /catalogs/:catalogId
router.get('/:catalogId', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const { catalogId } = request.params;

    // Check if catalog exists and get metadata
    const catalogResult = await connection.query(
      `SELECT 
        c.CatalogID as id,
        c.SponsorCompanyID as sponsorCompanyId,
        sc.CompanyName as sponsorCompanyName
       FROM CATALOGS c
       LEFT JOIN SPONSOR_COMPANIES sc ON c.SponsorCompanyID = sc.SponsorCompanyID
       WHERE c.CatalogID = ?`,
      [catalogId]
    );

    if (catalogResult[0].length === 0) {
      return response.status(404).json({ error: 'Catalog not found' });
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

    response.json(catalog);
  } catch (error) {
    console.error('Error fetching catalog:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// PATCH /catalogs/:catalogId
router.patch('/:catalogId', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const { catalogId } = request.params;
    
    // update catalog details if it is provided
    if (request.body.sponsorCompanyId) {
        await connection.query(
          'UPDATE CATALOGS SET SponsorCompanyID = ? WHERE CatalogID = ?',
          [request.body.sponsorCompanyId, catalogId]
        );
    }

    // fetch updated catalog
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
      return response.status(404).json({ error: 'Catalog not found' });
    }

    await connection.commit();
    response.json(result[0][0]);
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error updating catalog:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// DELETE /catalogs/:catalogId
router.delete('/:catalogId', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const { catalogId } = request.params;
    
    // delete catalog items first
    await connection.query(
      'DELETE FROM CATALOG_ITEMS WHERE CatalogID = ?',
      [catalogId]
    );
    
    // delete catalog itself
    const result = await connection.query(
      'DELETE FROM CATALOGS WHERE CatalogID = ?',
      [catalogId]
    );
    
    if (result[0].affectedRows === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Catalog not found' });
    }
    
    await connection.commit();
    response.status(204).send();
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error deleting catalog:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// POST /catalogs/:catalogId/items
router.post('/:catalogId/items', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const { catalogId } = request.params;
    const { externalProductId, pointCost, name, description, imageUrl, originalSource } = request.body;

    let itemData;

    // if the product id is given, get details from the store, otherwise use manual entry
    if (externalProductId) {
      const product = await store.getProductById(externalProductId);
      itemData = store.transformToCatalogItem(product, pointCost);
    } else {
      // manual item entry
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
    response.status(201).json(newItem[0][0]);
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error creating catalog item:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// GET /catalogs/:catalogId/items/:itemId
router.get('/:catalogId/items/:itemId', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const { catalogId, itemId } = request.params;

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
      return response.status(404).json({ error: 'Item not found' });
    }

    response.json(result[0][0]);
  } catch (error) {
    console.error('Error fetching catalog item:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// PATCH /catalogs/:catalogId/items/:itemId
router.patch('/:catalogId/items/:itemId', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const { catalogId, itemId } = request.params;
    const { name, description, pointCost, imageUrl } = request.body;

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
      return response.status(400).json({ error: 'No valid fields to update' });
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
      return response.status(404).json({ error: 'Item not found' });
    }

    await connection.commit();
    response.json(result[0][0]);
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error updating catalog item:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// DELETE /catalogs/:catalogId/items/:itemId
router.delete('/:catalogId/items/:itemId', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const { catalogId, itemId } = request.params;

    const result = await connection.query(
      'DELETE FROM CATALOG_ITEMS WHERE CatalogID = ? AND ItemID = ?',
      [catalogId, itemId]
    );

    if (result[0].affectedRows === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Item not found' });
    }

    await connection.commit();
    response.status(204).send();
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error deleting catalog item:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

export default router;