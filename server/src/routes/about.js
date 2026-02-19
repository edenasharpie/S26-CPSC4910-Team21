import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// GET /about
router.get('/', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();

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

export default router;