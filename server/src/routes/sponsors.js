//const express = require('express'); 
import express from 'express';
const router = express.Router();
//const { pool } = require('../db.js');
import { pool } from '../db.js';

// Get drivers based off performance
router.get('/my-drivers/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const drivers = await dbQueries.getDriversByCompany(companyId);
    res.json(drivers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch drivers for review' });
  }
}); 

/**
 * PATCH /api/sponsors/:companyId/description
 * Update a sponsor company's description
 * 
 * Request body:
 * {
 *   "companyDescription": "Updated company description"
 * }
 * 
 * Response (200 OK):
 * {
 *   "data": {
 *     "id": 1,
 *     "companyDescription": "Updated company description"
 *   },
 *   "message": "Company description updated successfully",
 *   "status": 200
 * }
 */
router.patch('/:companyId/description', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { companyDescription } = req.body;

    // Validate input
    if (!companyDescription) {
      return res.status(400).json({ 
        error: 'companyDescription is required',
        status: 400 
      });
    }

    if (typeof companyDescription !== 'string') {
      return res.status(422).json({ 
        error: 'companyDescription must be a string',
        status: 422 
      });
    }

    if (companyDescription.length > 1000) {
      return res.status(422).json({ 
        error: 'companyDescription must not exceed 1000 characters',
        status: 422 
      });
    }

    // Update the sponsor company description in database
    const [result] = await pool.execute(
      'UPDATE SPONSOR_COMPANIES SET companyDescription = ?, updatedAt = NOW() WHERE id = ?',
      [companyDescription, companyId]
    );

    // Check if company was found
    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        error: 'Sponsor company not found',
        status: 404 
      });
    }

    // Fetch and return updated company
    const [companies] = await pool.execute(
      'SELECT id, companyDescription FROM SPONSOR_COMPANIES WHERE id = ?',
      [companyId]
    );

    if (companies.length === 0) {
      return res.status(404).json({ 
        error: 'Sponsor company not found',
        status: 404 
      });
    }

    res.status(200).json({
      data: companies[0],
      message: 'Company description updated successfully',
      status: 200
    });

  } catch (error) {
    console.error('Error updating sponsor company description:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      status: 500 
    });
  }
});

// GET /api/sponsors/audit-logs
// Fetches the security audit history for the system
router.get('/audit-logs', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        a.LogID, 
        u.Username, 
        a.ActionType, 
        a.Status, 
        a.IPAddress, 
        a.CreatedAt 
      FROM AUDIT_LOGS a
      LEFT JOIN USERS u ON a.UserID = u.UserID
      ORDER BY a.CreatedAt DESC 
      LIMIT 50
    `);
    
    res.json(rows);
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ error: "Failed to fetch security report" });
  }
});

//module.exports = router;
export default router;