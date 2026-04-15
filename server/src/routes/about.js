import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// GET /about
router.get('/', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const [rows] = await connection.query('SELECT * FROM METADATA');

    // return first row
    if (rows.length === 0) {
      return response.status(404).json({ error: 'Metadata not found' });
    }

    response.json(rows[0]);
  } catch (error) {
    console.error('Error fetching about information:', error);
    response.status(500).json({ error: 'Internal Server Error', message: error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

export default router;