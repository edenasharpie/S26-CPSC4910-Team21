import express from 'express';
import { pool } from '../db.js';
const router = express.Router();

// GET /api/admins/invoices
router.get('/invoices', async (req, res) => {
  try {
    const query = `
      SELECT 
        i.InvoiceID, 
        i.Amount, 
        i.Status, 
        i.DueDate, 
        i.CreatedAt,
        sc.CompanyName
      FROM INVOICES i
      JOIN SPONSOR_COMPANIES sc ON i.SponsorCompanyID = sc.SponsorCompanyID
      ORDER BY i.CreatedAt DESC
    `;
    const [rows] = await pool.execute(query);
    res.json(rows);
  } catch (error) {
    console.error("Admin Invoice Fetch Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET /api/admins/driver-report/:driverId
router.get('/driver-report/:driverId', async (req, res) => {
  const { driverId } = req.params;
  const { startDate, endDate } = req.query; 

  try {
    const query = `
      SELECT 
        i.InvoiceID,
        i.Amount,
        i.CreatedAt,
        sc.CompanyName AS SponsorName,      
        sc.CompanyName AS OrganizationName,
        u.FirstName,
        u.LastName
      FROM INVOICES i
      JOIN SPONSOR_COMPANIES sc ON i.SponsorCompanyID = sc.SponsorCompanyID
      JOIN SPONSORS s ON sc.SponsorCompanyID = s.SponsorCompanyID
      JOIN USERS u ON s.UserID = u.UserID
      WHERE u.UserID = ? 
        AND i.CreatedAt BETWEEN ? AND ?
      ORDER BY i.CreatedAt DESC
    `;
    
    const [rows] = await pool.execute(query, [driverId, startDate, endDate]);
    res.json(rows);
  } catch (error) {
    console.error("Driver Report Error:", error);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

// GET /api/admin/settings/:userId - Get admin user settings
router.get('/settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get admin user and their settings from a settings table or JSON column
    // For now, return default settings
    res.json({
      auditLogRetentionDays: 365,
      userDataRetentionDays: 90
    });
  } catch (error) {
    console.error('Error fetching admin settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// POST /api/admin/settings/:userId - Update admin user settings
router.post('/settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { auditLogRetentionDays, userDataRetentionDays } = req.body;
    
    if (!auditLogRetentionDays || !userDataRetentionDays) {
      return res.status(400).json({ error: 'Both retention periods are required' });
    }
    
    // Store settings in user preferences or a settings table
    // For now, acknowledge the save
    res.json({ 
      success: true, 
      auditLogRetentionDays, 
      userDataRetentionDays 
    });
  } catch (error) {
    console.error('Error updating admin settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;