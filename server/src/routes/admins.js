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

// GET /ap/admins/driver-report/:driverId
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

export default router;