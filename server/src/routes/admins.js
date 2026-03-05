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

// GET /api/admins/add-points/:licenseNumber
router.post('/add-points/:licenseNumber', async (req, res) => {
  const { licenseNumber } = req.params;
  const { amount, reason, adminId } = req.body;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute(
      "UPDATE DRIVERS SET PointBalance = PointBalance + ? WHERE LicenseNumber = ?",
      [amount, licenseNumber]
    );

    await connection.execute(
      `INSERT INTO POINT_TRANSACTIONS 
       (DriverID, UserChanged, PointChange, ReasonForChange, TimeChanged) 
       VALUES (?, ?, ?, ?, NOW())`,
      [licenseNumber, adminId, amount, reason]
    );

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/admins/users-with-points
router.get('/users-with-points', async (req, res) => {
  try {
    const query = `
      SELECT 
        u.UserID, 
        u.username, 
        u.firstName, 
        u.lastName, 
        u.accountType,
        u.IsInactive,
        d.PointBalance,
        d.LicenseNumber
      FROM USERS u
      LEFT JOIN DRIVERS d ON u.UserID = d.UserID
    `;
    
    const [rows] = await pool.execute(query);
    res.json(rows);
  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({ error: "Failed to fetch users with points" });
  }
});

// GET /api/admin/audit-reports
router.get('/audit-reports', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT 
        p.PointChange, 
        p.ReasonForChange, 
        p.TimeChanged, 
        u.FirstName AS DriverFirstName,
        u.LastName AS DriverLastName,
        admin.FirstName AS AdminFirstName
       FROM POINT_TRANSACTIONS p
       JOIN DRIVERS d ON p.DriverID = d.LicenseNumber
       JOIN USERS u ON d.UserID = u.UserID
       JOIN USERS admin ON p.UserChanged = admin.UserID
       ORDER BY p.TimeChanged DESC` // No WHERE clause = Shows All
    );
    res.json(rows);
  } catch (error) {
    console.error("Audit Report Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST api/admin/add-driver
router.post('/add-driver', async (req, res) => {
    const { firstName, lastName, email, password, licenseNumber } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Insert into USERS table
        const [userResult] = await connection.execute(
            "INSERT INTO USERS (FirstName, LastName, Email, Password, UserType) VALUES (?, ?, ?, ?, 'driver')",
            [firstName, lastName, email, password] // Note: Hash password in production!
        );

        const newUserId = userResult.insertId;

        // Insert into DRIVERS table using the new UserID
        await connection.execute(
            "INSERT INTO DRIVERS (UserID, LicenseNumber, PointBalance) VALUES (?, ?, 0)",
            [newUserId, licenseNumber]
        );

        await connection.commit();
        res.status(201).json({ message: "Driver created successfully", userId: newUserId });
    } catch (error) {
        await connection.rollback();
        console.error("Add Driver Error:", error);
        res.status(500).json({ error: "Failed to create driver. License or Email might already exist." });
    } finally {
        connection.release();
    }
});

// POST /api/admin/add-sponsor
router.post('/add-sponsor', async (req, res) => {
    const { firstName, lastName, email, password, companyID } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Insert into USERS table with UserType 'sponsor'
        const [userResult] = await connection.execute(
            "INSERT INTO USERS (FirstName, LastName, Email, Password, UserType) VALUES (?, ?, ?, ?, 'sponsor')",
            [firstName, lastName, email, password]
        );

        const newUserId = userResult.insertId;

        // Insert into SPONSORS table
        await connection.execute(
            "INSERT INTO SPONSORS (UserID, CompanyID) VALUES (?, ?)",
            [newUserId, companyID]
        );

        await connection.commit();
        res.status(201).json({ message: "Sponsor created successfully", userId: newUserId });
    } catch (error) {
        await connection.rollback();
        console.error("Add Sponsor Error:", error);
        res.status(500).json({ error: "Failed to create sponsor. Email may already be in use." });
    } finally {
        connection.release();
    }
});

export default router;