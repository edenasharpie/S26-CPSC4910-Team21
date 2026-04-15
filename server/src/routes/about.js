import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

const DEFAULT_METADATA = {
  Team: 21,
  Version: 1,
  ReleaseDate: new Date().toISOString(),
  ProductName: 'FleetScore',
  ProductDescription: 'Truck driver incentive and rewards platform',
};

// GET /about
router.get('/', async (_request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const [rows] = await connection.query('SELECT * FROM METADATA');

    if (!rows || rows.length === 0) {
      return response.status(200).json(DEFAULT_METADATA);
    }

    return response.status(200).json(rows[0]);
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE' || error?.errno === 1146) {
      return response.status(200).json(DEFAULT_METADATA);
    }

    console.error('Error fetching about information:', error);
    return response.status(500).json({ error: 'Internal Server Error', message: error.message });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

export default router;