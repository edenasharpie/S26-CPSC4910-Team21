const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /about
router.get('/', async (request, response) => {
  let connection;
  try {
    connection = await db.pool.getConnection();

    const result = await connection.query('SELECT * FROM METADATA');

    response.json(result[0][0]);
  } catch (error) {
    console.error('Error fetching about information:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

module.exports = router;