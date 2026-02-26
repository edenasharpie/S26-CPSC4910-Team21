const express = require('express');
const router = express.Router();
import { pool } from '../db.js';

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