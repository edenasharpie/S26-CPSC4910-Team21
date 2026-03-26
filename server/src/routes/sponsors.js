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

// Sponsors to view Driver Applications
router.get('/view-applications', async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT 
                u.UserID, 
                u.FirstName, 
                u.LastName, 
                u.Email, 
                u.DateApplied, 
                d.LicenseNumber
             FROM USERS u
             JOIN DRIVERS d ON u.UserID = d.UserID
             WHERE u.UserType = 'driver' AND u.ActiveStatus = 0
             ORDER BY u.DateApplied DESC`
        );
        res.json(rows);
    } catch (error) {
        console.error("View Apps Error:", error);
        res.status(500).json({ error: "Could not fetch applications" });
    }
});

// Sponsors accept or deny application
router.post('/process-application', async (req, res) => {
    const { applicationId, status, explanation } = req.body;

    // Validation: Ensure only valid ENUM values are sent
    const validStatuses = ['accepted', 'rejected', 'pending'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
    }

    try {
        await pool.execute(
            `UPDATE DRIVER_APPLICATIONS 
             SET ApplicationStatus = ?, DecisionExplanation = ? 
             WHERE ApplicationID = ?`,
            [status, explanation || "", applicationId]
        );

        res.json({ message: `Application ${status} successfully.` });
    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ error: "Failed to update application status." });
    }
});

//module.exports = router;
export default router;