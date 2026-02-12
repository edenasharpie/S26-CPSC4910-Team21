const express = require('express');
const router = express.Router();
const db = require('../db');

const etsyService = require('../services/etsyService');

// GET /catalogs
router.get('/', async (request, response) => {
  try {
    const connection = await db.pool.getConnection();

    const limit = parseInt(request.query.limit) || 10;
    const offset = parseInt(request.query.offset) || 0;

    // TODO: add query
    const query = `
    `;
    
    const result = await connection.query(query, [limit, offset]);

    response.json(result.rows);
  } catch (error) {
    console.error('Error fetching catalogs:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /catalogs
router.post('/', async (request, response) => {
  try {
    const connection = await db.pool.getConnection();
    await connection.beginTransaction();

    // create catalog
    // TODO: add query
    const catalogResult = await connection.query(
      '',
      [request.body.sponsorCompanyId]
    );
    
    const catalogId = catalogResult.rows[0].id;

    // if items with etsy ids are provided, find and add them
    if (request.body.etsyListingIds && request.body.etsyListingIds.length > 0) {
      for (const item of request.body.etsyListingIds) {
        const etsyListing = await etsyService.getListingById(item.listingId);
        const catalogItem = etsyService.transformToCatalogItem(
          etsyListing, 
          item.pointCost
        );

        // TODO: add query
        await connection.query();
      }
    }

    await connection.commit();

    // return complete catalog
    // TODO: add query
    const fullCatalog = await connection.query(
      ``,
      [catalogId]
    );

    response.status(201).json(fullCatalog.rows[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error creating catalog:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    connection.release();
  }
});

// PATCH /catalogs/:catalogId
router.patch('/:catalogId', async (request, response) => {
  try {
    const connection = await db.pool.getConnection();
    await connection.beginTransaction();

    const { catalogId } = request.params;
    
    // update catalog details if it is provided
    if (request.body.sponsorCompanyId) {
        // TODO: add query
        await connection.query();
    }

    // fetch updated catalog
    // TODO: add query
    const result = await connection.query();

    if (result.rows.length === 0) {
      return response.status(404).json({ error: 'Catalog not found' });
    }

    response.json(result.rows[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error updating catalog:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    connection.release();
  }
});

// DELETE /catalogs/:catalogId
router.delete('/:catalogId', async (request, response) => {
  try {
    const connection = await db.pool.getConnection();
    await connection.beginTransaction();

    const { catalogId } = request.params;
    
    // delete catalog items first
    // TODO: add query
    await connection.query();
    
    // delete catalog itself
    // TODO: add query
    const result = await connection.query();
    
    if (result.rows.length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'Catalog not found' });
    }
    
    await connection.commit();
    response.status(204).send();
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting catalog:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    connection.release();
  }
});

// GET /catalogs/:catalogId/items
router.get('/:catalogId/items', async (request, response) => {
  try {
    const connection = await db.pool.getConnection();

    const { catalogId } = request.params;
    const limit = parseInt(request.query.limit) || 10;
    const offset = parseInt(request.query.offset) || 0;

    // TODO: add query
    const result = await connection.query();

    response.json(result.rows);
  } catch (error) {
    console.error('Error fetching catalog items:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /catalogs/:catalogId/items
router.post('/:catalogId/items', async (request, response) => {
  try {
    const connection = await db.pool.getConnection();
    await connection.beginTransaction();

    const { catalogId } = request.params;
    const { etsyListingId, pointCost, name, description, imageUrl, originalSource } = request.body;

    let itemData;

    // if the listing id is given, get details from etsy, otherwise use manual entry
    if (etsyListingId) {
      const etsyListing = await etsyService.getListingById(etsyListingId);
      itemData = etsyService.transformToCatalogItem(etsyListing, pointCost);
    } else {
      // manual item entry
      itemData = { name, description, pointCost, imageUrl, originalSource };
    }

    // TODO: add query
    const result = await connection.query();

    response.status(201).json(result.rows[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error creating catalog item:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    connection.release();
  }
});

// GET /catalogs/:catalogId/items/:itemId
router.get('/:catalogId/items/:itemId', async (request, response) => {
  try {
    const connection = await db.pool.getConnection();

    const { catalogId, itemId } = request.params;

    // TODO: add query
    const result = await connection.query();

    if (result.rows.length === 0) {
      return response.status(404).json({ error: 'Item not found' });
    }

    response.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching catalog item:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  }
});

// PATCH /catalogs/:catalogId/items/:itemId
router.patch('/:catalogId/items/:itemId', async (request, response) => {
  try {
    const connection = await db.pool.getConnection();
    await connection.beginTransaction();

    const { catalogId, itemId } = request.params;
    const { name, description, pointCost, imageUrl } = request.body;

    // TODO: add query
    const result = await connection.query();

    if (result.rows.length === 0) {
      return response.status(404).json({ error: 'Item not found' });
    }

    response.json(result.rows[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Error updating catalog item:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    connection.release();
  }
});

// DELETE /catalogs/:catalogId/items/:itemId
router.delete('/:catalogId/items/:itemId', async (request, response) => {
  try {
    const connection = await db.pool.getConnection();
    await connection.beginTransaction();

    const { catalogId, itemId } = request.params;

    // TODO: add query
    const result = await connection.query();

    if (result.rows.length === 0) {
      return response.status(404).json({ error: 'Item not found' });
    }

    response.status(204).send();
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting catalog item:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    connection.release();
  }
});

module.exports = router;