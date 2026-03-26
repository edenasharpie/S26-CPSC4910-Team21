import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// GET /api/sponsors - Get all sponsor companies
router.get('/', async (req, res) => {
  try {
    const [sponsors] = await pool.execute(
      'SELECT SponsorCompanyID as id, CompanyName as companyName, PointDollarValue as pointDollarValue FROM SPONSOR_COMPANIES ORDER BY CompanyName'
    );
    res.json(sponsors);
  } catch (error) {
    console.error('Error fetching sponsor companies:', error);
    res.status(500).json({ error: 'Failed to fetch sponsor companies' });
  }
});

// GET /api/sponsors/user/:userId - Get sponsor company for a given sponsor user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const [rows] = await pool.execute(
      `SELECT sc.SponsorCompanyID as sponsorCompanyId,
              sc.CompanyName      as companyName,
              sc.PointDollarValue as pointDollarValue
       FROM SPONSORS s
       JOIN SPONSOR_COMPANIES sc ON s.SponsorCompanyID = sc.SponsorCompanyID
       WHERE s.UserID = ?`,
      [userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Sponsor company not found for this user' });
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching sponsor company for user:', error);
    res.status(500).json({ error: 'Failed to fetch sponsor company' });
  }
});

// Get drivers based off performance
router.get('/my-drivers/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const [drivers] = await pool.execute(
      `SELECT
         u.UserID, u.FirstName, u.LastName, u.Username,
         d.PerformanceStatus, d.PointBalance, u.ActiveStatus
       FROM USERS u
       JOIN DRIVERS d ON u.UserID = d.UserID
       WHERE d.SponsorCompanyID = ?
       ORDER BY d.PerformanceStatus ASC`,
      [companyId]
    );
    res.json(drivers);
  } catch (error) {
    console.error('Error fetching drivers for review:', error);
    res.status(500).json({ error: 'Failed to fetch drivers for review' });
  }
});

// ============================================================================
// MORE SPECIFIC ROUTES (must come BEFORE generic /:userId/drivers/:driverId)
// ============================================================================

// GET /api/sponsors/:userId/drivers/:driverId/points - Get driver point balance
router.get('/:userId/drivers/:driverId/points', async (req, res) => {
  try {
    const { userId, driverId } = req.params;
    console.log(`[SPONSOR_GET_POINTS] userId=${userId}, driverId=${driverId}`);
    
    // Get the sponsor's company
    const [sponsorRows] = await pool.execute(
      `SELECT sc.SponsorCompanyID
       FROM SPONSORS s
       JOIN SPONSOR_COMPANIES sc ON s.SponsorCompanyID = sc.SponsorCompanyID
       WHERE s.UserID = ?`,
      [userId]
    );
    
    if (sponsorRows.length === 0) {
      return res.status(404).json({ error: 'Sponsor not found' });
    }
    
    const companyId = sponsorRows[0].SponsorCompanyID;
    
    // Get the driver
    const [drivers] = await pool.execute(
      `SELECT
         u.UserID, u.FirstName, u.LastName, u.Username, u.Email, u.Phone,
         d.PerformanceStatus, d.PointBalance, u.ActiveStatus
       FROM USERS u
       JOIN DRIVERS d ON u.UserID = d.UserID
       WHERE u.UserID = ? AND d.SponsorCompanyID = ?`,
      [driverId, companyId]
    );
    
    if (drivers.length === 0) {
      return res.status(404).json({ error: 'Driver not found for this sponsor' });
    }
    
    res.json(drivers[0]);
  } catch (error) {
    console.error('[SPONSOR_GET_POINTS] Error:', error);
    res.status(500).json({ error: 'Failed to fetch driver points' });
  }
});

// GET /api/sponsors/:userId/drivers/:driverId/point-history - Get driver transaction history
router.get('/:userId/drivers/:driverId/point-history', async (req, res) => {
  try {
    const { userId, driverId } = req.params;
    console.log(`[SPONSOR_GET_HISTORY] userId=${userId}, driverId=${driverId}`);
    
    // Get the sponsor's company
    const [sponsorRows] = await pool.execute(
      `SELECT sc.SponsorCompanyID
       FROM SPONSORS s
       JOIN SPONSOR_COMPANIES sc ON s.SponsorCompanyID = sc.SponsorCompanyID
       WHERE s.UserID = ?`,
      [userId]
    );
    
    if (sponsorRows.length === 0) {
      return res.status(404).json({ error: 'Sponsor not found' });
    }
    
    const companyId = sponsorRows[0].SponsorCompanyID;
    
    // Get point history for this driver from this sponsor company
    const [history] = await pool.execute(
      `SELECT
         pt.TransactionID, pt.DriverID, pt.UserChanged, pt.PointChange, 
         pt.ReasonForChange, pt.TimeChanged, u.Username as ChangedByUsername
       FROM POINT_TRANSACTIONS pt
       JOIN USERS u ON pt.UserChanged = u.UserID
       WHERE pt.DriverID = ?
       ORDER BY pt.TimeChanged DESC
       LIMIT 100`,
      [driverId]
    );
    
    res.json(history);
  } catch (error) {
    console.error('[SPONSOR_GET_HISTORY] Error:', error);
    res.status(500).json({ error: 'Failed to fetch point history' });
  }
});

// POST /api/sponsors/:userId/drivers/:driverId/point-transactions - Add point transaction
router.post('/:userId/drivers/:driverId/point-transactions', async (req, res) => {
  try {
    const { userId, driverId } = req.params;
    const { pointChange, reason } = req.body;
    
    if (!pointChange || !reason) {
      return res.status(400).json({ error: 'pointChange and reason are required' });
    }
    
    // Get the sponsor's company
    const [sponsorRows] = await pool.execute(
      `SELECT sc.SponsorCompanyID
       FROM SPONSORS s
       JOIN SPONSOR_COMPANIES sc ON s.SponsorCompanyID = sc.SponsorCompanyID
       WHERE s.UserID = ?`,
      [userId]
    );
    
    if (sponsorRows.length === 0) {
      return res.status(404).json({ error: 'Sponsor not found' });
    }
    
    const companyId = sponsorRows[0].SponsorCompanyID;
    
    // Verify driver belongs to sponsor
    const [drivers] = await pool.execute(
      `SELECT u.UserID, d.PointBalance
       FROM USERS u
       JOIN DRIVERS d ON u.UserID = d.UserID
       WHERE u.UserID = ? AND d.SponsorCompanyID = ?`,
      [driverId, companyId]
    );
    
    if (drivers.length === 0) {
      return res.status(404).json({ error: 'Driver not found for this sponsor' });
    }
    
    // Create transaction
    await pool.execute(
      `INSERT INTO POINT_TRANSACTIONS (DriverID, UserChanged, PointChange, ReasonForChange, TimeChanged)
       VALUES (?, ?, ?, ?, NOW())`,
      [driverId, userId, pointChange, reason]
    );
    
    // Update driver's point balance
    const newBalance = drivers[0].PointBalance + pointChange;
    await pool.execute(
      `UPDATE DRIVERS SET PointBalance = ? WHERE UserID = ?`,
      [newBalance, driverId]
    );
    
    res.json({ success: true, newBalance });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// PUT /api/sponsors/:userId/point-transactions/:tId - Edit a transaction
router.put('/:userId/point-transactions/:tId', async (req, res) => {
  try {
    const { userId, tId } = req.params;
    const { newPoints, newReason } = req.body;
    
    if (newPoints === undefined || !newReason) {
      return res.status(400).json({ error: 'newPoints and newReason are required' });
    }
    
    // Get the sponsor's company
    const [sponsorRows] = await pool.execute(
      `SELECT sc.SponsorCompanyID
       FROM SPONSORS s
       JOIN SPONSOR_COMPANIES sc ON s.SponsorCompanyID = sc.SponsorCompanyID
       WHERE s.UserID = ?`,
      [userId]
    );
    
    if (sponsorRows.length === 0) {
      return res.status(404).json({ error: 'Sponsor not found' });
    }
    
    // Get the transaction
    const [transactions] = await pool.execute(
      `SELECT * FROM POINT_TRANSACTIONS WHERE TransactionID = ?`,
      [tId]
    );
    
    if (transactions.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const oldPoints = transactions[0].PointChange;
    const pointDifference = newPoints - oldPoints;
    
    // Update transaction
    await pool.execute(
      `UPDATE POINT_TRANSACTIONS SET PointChange = ?, ReasonForChange = ? WHERE TransactionID = ?`,
      [newPoints, newReason, tId]
    );
    
    // Update driver's point balance by the difference
    await pool.execute(
      `UPDATE DRIVERS SET PointBalance = PointBalance + ? WHERE LicenseNumber = (SELECT DriverID FROM POINT_TRANSACTIONS WHERE TransactionID = ?)`,
      [pointDifference, tId]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// ============================================================================
// GENERIC ROUTES (come AFTER specific routes)
// ============================================================================

// GET /api/sponsors/:userId/drivers/:driverId - Get a single driver for a sponsor
router.get('/:userId/drivers/:driverId', async (req, res) => {
  try {
    const { userId, driverId } = req.params;
    console.log(`[SPONSOR_GET_DRIVER] userId=${userId}, driverId=${driverId}`);
    
    // Get the sponsor's company
    const [sponsorRows] = await pool.execute(
      `SELECT sc.SponsorCompanyID
       FROM SPONSORS s
       JOIN SPONSOR_COMPANIES sc ON s.SponsorCompanyID = sc.SponsorCompanyID
       WHERE s.UserID = ?`,
      [userId]
    );
    
    if (sponsorRows.length === 0) {
      console.log(`[SPONSOR_GET_DRIVER] Sponsor not found for userId=${userId}`);
      return res.status(404).json({ error: 'Sponsor not found' });
    }
    
    const companyId = sponsorRows[0].SponsorCompanyID;
    console.log(`[SPONSOR_GET_DRIVER] Found companyId=${companyId}`);
    
    // Get the driver
    const [drivers] = await pool.execute(
      `SELECT
         u.UserID, u.FirstName, u.LastName, u.Username, u.Email, u.Phone,
         d.PerformanceStatus, d.PointBalance, u.ActiveStatus
       FROM USERS u
       JOIN DRIVERS d ON u.UserID = d.UserID
       WHERE u.UserID = ? AND d.SponsorCompanyID = ?`,
      [driverId, companyId]
    );
    
    if (drivers.length === 0) {
      console.log(`[SPONSOR_GET_DRIVER] Driver not found for driverId=${driverId}, companyId=${companyId}`);
      return res.status(404).json({ error: 'Driver not found for this sponsor' });
    }
    
    console.log(`[SPONSOR_GET_DRIVER] Success - returning driver`);
    res.json(drivers[0]);
  } catch (error) {
    console.error('[SPONSOR_GET_DRIVER] Error:', error);
    res.status(500).json({ error: 'Failed to fetch driver' });
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
      'UPDATE SPONSOR_COMPANIES SET companyDescription = ?, updatedAt = NOW() WHERE SponsorCompanyID = ?',
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
      'SELECT SponsorCompanyID as id, companyDescription FROM SPONSOR_COMPANIES WHERE SponsorCompanyID = ?',
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

// TODO: I accepted this change but commented out for now. This function is probably good and useful; just needs a checkup
// to check for inconsistencies witht the rest of the code
//// GET /api/sponsors/audit-logs
//// Fetches the security audit history for the system
//router.get('/audit-logs', async (req, res) => {
//  try {
//    const [rows] = await pool.execute(`
//      SELECT 
//        a.LogID, 
//        u.Username, 
//        a.ActionType, 
//        a.Status, 
//        a.IPAddress, 
//        a.CreatedAt 
//      FROM AUDIT_LOGS a
//      LEFT JOIN USERS u ON a.UserID = u.UserID
//      ORDER BY a.CreatedAt DESC 
//      LIMIT 50
//    `);
    
//    res.json(rows);
//  } catch (error) {
//    console.error("Error fetching audit logs:", error);
//    res.status(500).json({ error: "Failed to fetch security report" });
//  }
//});

//// GET password changes based on sponsorId
//router.get('/security-report/:sponsorId', async (req, res) => {
//  const { sponsorId } = req.params;
//  const { startDate, endDate } = req.query;

//  try {
//    const query = `
//      SELECT 
//        u.Username,
//        u.FirstName,
//        u.LastName,
//        al.ActionType,
//        al.CreatedAt AS EventDate,
//        al.IPAddress
//      FROM AUDIT_LOGS al
//      JOIN USERS u ON al.UserID = u.UserID
//      JOIN SPONSORS s ON u.UserID = s.UserID
//      WHERE s.SponsorCompanyID = ? 
//        AND al.ActionType = 'PASSWORD_CHANGE'
//        AND al.CreatedAt BETWEEN ? AND ?
//      ORDER BY al.CreatedAt DESC
//    `;
    
//    const [rows] = await pool.execute(query, [sponsorId, startDate, endDate]);
//    res.json(rows);
//  } catch (error) {
//    console.error("Security Report Error:", error);
//    res.status(500).json({ error: "Failed to fetch security logs" });
//  }
//});

// POST /api/sponsors/deduct-points
router.post('/deduct-points', async (req, res) => {
    const { driverId, points, reason, sponsorId } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Update Driver's balance 
        const [updateResult] = await connection.execute(
            "UPDATE DRIVERS SET PointBalance = PointBalance - ? WHERE UserID = ?",
            [points, driverId]
        );

        if (updateResult.affectedRows === 0) {
            throw new Error("Driver not found");
        }

        // Get Driver's LicenseNumber for transaction log
        const [driver] = await connection.execute(
            "SELECT LicenseNumber FROM DRIVERS WHERE UserID = ?",
            [driverId]
        );

        // Log transaction as negative value
        await connection.execute(
            `INSERT INTO POINT_TRANSACTIONS 
            (DriverID, PointChange, ReasonForChange, TimeChanged, UserChanged) 
            VALUES (?, ?, ?, NOW(), ?)`,
            [driver[0].LicenseNumber, -Math.abs(points), reason, sponsorId]
        );

        await connection.commit();
        res.json({ message: `Successfully deducted ${points} points.` });
    } catch (error) {
        await connection.rollback();
        console.error("Deduction Error:", error);
        res.status(500).json({ error: error.message || "Failed to deduct points" });
    } finally {
        connection.release();
    }
});

// GET /api/sponsors/driver-purchases/:companyId
router.get('/driver-purchases/:companyId', async (req, res) => {
  const { companyId } = req.params;

  try {
    const [history] = await pool.execute(
      `SELECT
          t.TransactionID,
          t.PointChange,
          t.ReasonForChange,
          t.TimeChanged,
          u.FirstName,
          u.LastName
       FROM POINT_TRANSACTIONS t
       JOIN DRIVERS d ON t.DriverID = d.LicenseNumber
       JOIN USERS u ON d.UserID = u.UserID
       WHERE d.SponsorCompanyID = ?
       ORDER BY t.TimeChanged DESC`,
      [companyId]
    );

    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sponsor/manage-users
router.get('/affiliated-users', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT UserID, FirstName, LastName, Email, Bio 
       FROM USERS 
       WHERE UserType = 'sponsor'`
    );
    res.json(rows);
  } catch (error) {
    console.error("Sponsor Route Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Sponso/manage-users.$userId
router.get('/user/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.execute(
            `SELECT UserID, FirstName, LastName, Email, Bio 
             FROM USERS 
             WHERE UserID = ?`, 
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json(rows[0]); // Return just the single user object
    } catch (error) {
        console.error("DB Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Function to change a user's fields and store within the database
router.put('/user/:id', async (req, res) => {
    const { id } = req.params;
    const { firstName, lastName, email } = req.body;

    // --- DEBUG LOGS ---
    console.log("PUT request received for ID:", id);
    console.log("Body received:", req.body); 
    // ------------------

    try {
        const [result] = await pool.execute(
            `UPDATE USERS 
             SET FirstName = ?, LastName = ?, Email = ? 
             WHERE UserID = ?`,
            [firstName, lastName, email, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        console.log("DB Result:", result);
        res.json({ message: "User updated successfully" });
    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

//module.exports = router;

// GET /api/sponsors/:companyId/settings - Get sponsor company settings
router.get('/:companyId/settings', async (req, res) => {
  try {
    const { companyId } = req.params;
    const [rows] = await pool.execute(
      `SELECT 
         SponsorCompanyID,
         CompanyName,
         COALESCE(JSON_EXTRACT(ContactInfo, '$.dataRetentionDays'), 90) as dataRetentionDays
       FROM SPONSOR_COMPANIES
       WHERE SponsorCompanyID = ?`,
      [companyId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    res.json({
      dataRetentionDays: parseInt(rows[0].dataRetentionDays) || 90
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// POST /api/sponsors/:companyId/settings - Update sponsor company settings
router.post('/:companyId/settings', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { dataRetentionDays } = req.body;
    
    if (!dataRetentionDays) {
      return res.status(400).json({ error: 'dataRetentionDays is required' });
    }
    
    // Get current ContactInfo
    const [current] = await pool.execute(
      `SELECT ContactInfo FROM SPONSOR_COMPANIES WHERE SponsorCompanyID = ?`,
      [companyId]
    );
    
    if (current.length === 0) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    let contactInfo = {};
    if (current[0].ContactInfo) {
      try {
        contactInfo = JSON.parse(current[0].ContactInfo);
      } catch (e) {
        contactInfo = {};
      }
    }
    
    // Update with new retention setting
    contactInfo.dataRetentionDays = dataRetentionDays;
    
    await pool.execute(
      `UPDATE SPONSOR_COMPANIES SET ContactInfo = ? WHERE SponsorCompanyID = ?`,
      [JSON.stringify(contactInfo), companyId]
    );
    
    res.json({ success: true, dataRetentionDays });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;