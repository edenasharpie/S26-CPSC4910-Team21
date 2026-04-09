import express from 'express';
import { pool } from '../db.js';
import { hasBooleanPermission } from '../utils/auth.js';
import {
  routeUserMatchesEffectiveSession,
} from '../middleware/session-context.js';

const router = express.Router();

function normalizeUserForSession(user) {
  return {
    UserID: Number(user.UserID),
    UserType: user.UserType,
    Username: user.Username,
    FirstName: user.FirstName ?? null,
    LastName: user.LastName ?? null,
  };
}

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
              sc.PointDollarValue as pointDollarValue,
              u.FirstName         as firstName,
              u.LastName          as lastName,
              u.Username          as username,
              u.ProfilePicture    as profilePicture
       FROM SPONSORS s
       JOIN SPONSOR_COMPANIES sc ON s.SponsorCompanyID = sc.SponsorCompanyID
       JOIN USERS u ON s.UserID = u.UserID
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

// Get drivers for the authenticated sponsor's company
// Security: companyId is resolved server-side from userId — callers cannot
// supply an arbitrary companyId to view another company's drivers.
router.get('/:userId/my-drivers', async (req, res) => {
  try {
    const { userId } = req.params;

    const [sponsorRows] = await pool.execute(
      `SELECT SponsorCompanyID FROM SPONSORS WHERE UserID = ?`,
      [userId]
    );
    if (sponsorRows.length === 0) {
      return res.status(404).json({ error: 'Sponsor not found' });
    }
    const companyId = sponsorRows[0].SponsorCompanyID;

    const [drivers] = await pool.execute(
      `SELECT
         u.UserID, u.FirstName, u.LastName, u.Username, u.ProfilePicture,
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
    const sponsorUserId = Number(userId);
    console.log(`[SPONSOR_GET_HISTORY] userId=${userId}, driverId=${driverId}`);

    if (!Number.isInteger(sponsorUserId)) {
      return res.status(400).json({ error: 'Invalid sponsor user ID' });
    }

    if (!routeUserMatchesEffectiveSession(req, sponsorUserId)) {
      return res.status(403).json({ error: 'Access forbidden for requested user context.' });
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
    
     // Get point history for this driver from this sponsor company.
    const [history] = await pool.execute(
      `SELECT
         pt.TransactionID, pt.DriverID, pt.UserChanged, pt.PointChange, 
         pt.ReasonForChange,
         DATE_FORMAT(pt.TimeChanged, '%Y-%m-%d %H:%i:%s') AS TimeChanged,
         u.Username as ChangedByUsername
       FROM POINT_TRANSACTIONS pt
       JOIN DRIVERS d ON pt.DriverID = d.LicenseNumber
       LEFT JOIN USERS u ON pt.UserChanged = u.UserID
       WHERE d.UserID = ? AND d.SponsorCompanyID = ?
         AND pt.TimeChanged IS NOT NULL
         AND pt.TimeChanged >= '2000-01-01 00:00:00'
       ORDER BY pt.TimeChanged DESC
       LIMIT 100`,
      [driverId, companyId]
    );
    
    res.json(history);
  } catch (error) {
    console.error('[SPONSOR_GET_HISTORY] Error:', error);
    res.status(500).json({ error: 'Failed to fetch point history' });
  }
});

// GET /api/sponsors/:userId/point-transactions - Get sponsor-scoped point transactions for invoices
router.get('/:userId/point-transactions', async (req, res) => {
  try {
    const { userId } = req.params;
    const sponsorUserId = Number(userId);

    if (!Number.isInteger(sponsorUserId)) {
      return res.status(400).json({ error: 'Invalid sponsor user ID' });
    }

    if (!routeUserMatchesEffectiveSession(req, sponsorUserId)) {
      return res.status(403).json({ error: 'Access forbidden for requested user context.' });
    }

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
    const [transactions] = await pool.execute(
      `SELECT
         pt.TransactionID,
         pt.DriverID,
         d.UserID AS DriverUserID,
         u.FirstName,
         u.LastName,
         pt.UserChanged AS AdminUserID,
         pt.PointChange,
         pt.ReasonForChange,
         DATE_FORMAT(pt.TimeChanged, '%Y-%m-%d %H:%i:%s') AS TimeChanged
       FROM POINT_TRANSACTIONS pt
       JOIN DRIVERS d ON pt.DriverID = d.LicenseNumber
       JOIN USERS u ON d.UserID = u.UserID
       WHERE d.SponsorCompanyID = ?
         AND pt.TimeChanged IS NOT NULL
         AND pt.TimeChanged >= '2000-01-01 00:00:00'
       ORDER BY pt.TimeChanged DESC`,
      [companyId]
    );

    return res.json(transactions);
  } catch (error) {
    console.error('Error fetching sponsor point transactions:', error);
    return res.status(500).json({ error: 'Failed to fetch sponsor point transactions' });
  }
});

// POST /api/sponsors/:userId/drivers/:driverId/point-transactions - Add point transaction
router.post('/:userId/drivers/:driverId/point-transactions', async (req, res) => {
  let connection;
  try {
    const { userId, driverId } = req.params;
    const { pointChange, reason } = req.body;

    const sponsorUserId = Number(userId);
    const driverUserId = Number(driverId);
    const pointDelta = Number(pointChange);
    const reasonText = typeof reason === 'string' ? reason.trim() : '';

    if (!Number.isInteger(sponsorUserId) || !Number.isInteger(driverUserId)) {
      return res.status(400).json({ error: 'Invalid sponsor user ID or driver user ID' });
    }

    if (!routeUserMatchesEffectiveSession(req, sponsorUserId)) {
      return res.status(403).json({ error: 'Access forbidden for requested user context.' });
    }

    if (!Number.isFinite(pointDelta) || pointDelta === 0 || !reasonText) {
      return res.status(400).json({ error: 'pointChange and reason are required' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Get the sponsor's company
    const [sponsorRows] = await connection.execute(
      `SELECT sc.SponsorCompanyID
       FROM SPONSORS s
       JOIN SPONSOR_COMPANIES sc ON s.SponsorCompanyID = sc.SponsorCompanyID
       WHERE s.UserID = ?`,
      [sponsorUserId]
    );

    if (sponsorRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Sponsor not found' });
    }

    const companyId = sponsorRows[0].SponsorCompanyID;

    // Verify driver belongs to sponsor
    const [drivers] = await connection.execute(
      `SELECT u.UserID, d.LicenseNumber, d.PointBalance
       FROM USERS u
       JOIN DRIVERS d ON u.UserID = d.UserID
       WHERE u.UserID = ? AND d.SponsorCompanyID = ?`,
      [driverUserId, companyId]
    );

    if (drivers.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Driver not found for this sponsor' });
    }

    // Create transaction
    await connection.execute(
      `INSERT INTO POINT_TRANSACTIONS (DriverID, UserChanged, PointChange, ReasonForChange, TimeChanged)
       VALUES (?, ?, ?, ?, NOW())`,
      [drivers[0].LicenseNumber, sponsorUserId, pointDelta, reasonText]
    );

    // Update driver's point balance
    const newBalance = Number(drivers[0].PointBalance) + pointDelta;
    await connection.execute(
      `UPDATE DRIVERS SET PointBalance = ? WHERE LicenseNumber = ?`,
      [newBalance, drivers[0].LicenseNumber]
    );

    await connection.commit();
    res.json({ success: true, newBalance });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// PUT /api/sponsors/:userId/point-transactions/:tId - Edit a transaction
router.put('/:userId/point-transactions/:tId', async (req, res) => {
  let connection;
  try {
    const { userId, tId } = req.params;
    const { newPoints, newReason } = req.body;

    const sponsorUserId = Number(userId);
    const transactionId = Number(tId);
    const pointValue = Number(newPoints);
    const reasonText = typeof newReason === 'string' ? newReason.trim() : '';

    if (!Number.isInteger(sponsorUserId) || !Number.isInteger(transactionId)) {
      return res.status(400).json({ error: 'Invalid sponsor user ID or transaction ID' });
    }

    if (!routeUserMatchesEffectiveSession(req, sponsorUserId)) {
      return res.status(403).json({ error: 'Access forbidden for requested user context.' });
    }

    if (!Number.isFinite(pointValue) || !reasonText) {
      return res.status(400).json({ error: 'newPoints and newReason are required' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Get the sponsor's company
    const [sponsorRows] = await connection.execute(
      `SELECT sc.SponsorCompanyID
       FROM SPONSORS s
       JOIN SPONSOR_COMPANIES sc ON s.SponsorCompanyID = sc.SponsorCompanyID
       WHERE s.UserID = ?`,
      [sponsorUserId]
    );

    if (sponsorRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Sponsor not found' });
    }

    const companyId = sponsorRows[0].SponsorCompanyID;

    // Get the transaction
    const [transactions] = await connection.execute(
      `SELECT pt.TransactionID, pt.DriverID, pt.PointChange
       FROM POINT_TRANSACTIONS pt
       JOIN DRIVERS d ON d.LicenseNumber = pt.DriverID
       WHERE pt.TransactionID = ? AND d.SponsorCompanyID = ?`,
      [transactionId, companyId]
    );

    if (transactions.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Transaction not found for this sponsor' });
    }

    const oldPoints = transactions[0].PointChange;
    const pointDifference = pointValue - oldPoints;

    // Update transaction
    await connection.execute(
      `UPDATE POINT_TRANSACTIONS SET PointChange = ?, ReasonForChange = ? WHERE TransactionID = ?`,
      [pointValue, reasonText, transactionId]
    );

    // Update driver's point balance by the difference
    await connection.execute(
      `UPDATE DRIVERS SET PointBalance = PointBalance + ? WHERE LicenseNumber = ?`,
      [pointDifference, transactions[0].DriverID]
    );

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error updating transaction:', error);
    res.status(500).json({ error: 'Failed to update transaction' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// PATCH /api/sponsors/:userId/drivers/:driverId - Update sponsor-owned driver profile fields
router.patch('/:userId/drivers/:driverId', async (req, res) => {
  let connection;
  try {
    const sponsorUserId = Number(req.params.userId);
    const driverUserId = Number(req.params.driverId);

    if (!Number.isInteger(sponsorUserId) || !Number.isInteger(driverUserId)) {
      return res.status(400).json({ error: 'Invalid user ID or driver ID' });
    }

    if (!routeUserMatchesEffectiveSession(req, sponsorUserId)) {
      return res.status(403).json({ error: 'Access forbidden for requested user context.' });
    }

    const firstName = typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : undefined;
    const lastName = typeof req.body?.lastName === 'string' ? req.body.lastName.trim() : undefined;
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : undefined;
    const phoneRaw = typeof req.body?.phone === 'string' ? req.body.phone.trim() : undefined;
    const phone = phoneRaw === '' ? null : phoneRaw;

    const userUpdates = [];
    const updateValues = [];

    if (firstName !== undefined) {
      if (!firstName) {
        return res.status(400).json({ error: 'firstName cannot be empty' });
      }
      userUpdates.push('FirstName = ?');
      updateValues.push(firstName);
    }

    if (lastName !== undefined) {
      if (!lastName) {
        return res.status(400).json({ error: 'lastName cannot be empty' });
      }
      userUpdates.push('LastName = ?');
      updateValues.push(lastName);
    }

    if (email !== undefined) {
      if (!email) {
        return res.status(400).json({ error: 'email cannot be empty' });
      }
      userUpdates.push('Email = ?');
      updateValues.push(email);
    }

    if (phone !== undefined) {
      userUpdates.push('Phone = ?');
      updateValues.push(phone);
    }

    if (userUpdates.length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [sponsorRows] = await connection.execute(
      `SELECT sc.SponsorCompanyID
       FROM SPONSORS s
       JOIN SPONSOR_COMPANIES sc ON s.SponsorCompanyID = sc.SponsorCompanyID
       WHERE s.UserID = ?
       LIMIT 1`,
      [sponsorUserId]
    );

    if (sponsorRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Sponsor not found' });
    }

    const sponsorCompanyId = sponsorRows[0].SponsorCompanyID;

    const [driverRows] = await connection.execute(
      `SELECT u.UserID
       FROM USERS u
       JOIN DRIVERS d ON d.UserID = u.UserID
       WHERE u.UserID = ? AND d.SponsorCompanyID = ?
       LIMIT 1`,
      [driverUserId, sponsorCompanyId]
    );

    if (driverRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Driver not found for this sponsor' });
    }

    await connection.execute(
      `UPDATE USERS
       SET ${userUpdates.join(', ')}
       WHERE UserID = ?`,
      [...updateValues, driverUserId]
    );

    const [updatedRows] = await connection.execute(
      `SELECT
         u.UserID, u.FirstName, u.LastName, u.Username, u.Email, u.Phone,
         d.PerformanceStatus, d.PointBalance, u.ActiveStatus
       FROM USERS u
       JOIN DRIVERS d ON u.UserID = d.UserID
       WHERE u.UserID = ? AND d.SponsorCompanyID = ?
       LIMIT 1`,
      [driverUserId, sponsorCompanyId]
    );

    await connection.commit();

    return res.status(200).json(updatedRows[0]);
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('[SPONSOR_UPDATE_DRIVER] Error:', error);
    return res.status(500).json({ error: 'Failed to update driver profile' });
  } finally {
    if (connection) {
      connection.release();
    }
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

// POST /api/sponsors/:userId/assume-driver/:driverId
router.post('/:userId/assume-driver/:driverId', async (req, res) => {
  let connection;
  try {
    const sponsorUserId = Number(req.params.userId);
    const driverUserId = Number(req.params.driverId);

    if (!Number.isInteger(sponsorUserId) || !Number.isInteger(driverUserId)) {
      return res.status(400).json({
        success: false,
        error: 'userId and driverId must be valid integers.',
      });
    }

    connection = await pool.getConnection();

    const [sponsorRows] = await connection.execute(
      `SELECT u.UserID, u.UserType, u.ActiveStatus, u.Permissions, s.SponsorCompanyID
       FROM USERS u
       JOIN SPONSORS s ON s.UserID = u.UserID
       WHERE u.UserID = ?
       LIMIT 1`,
      [sponsorUserId]
    );

    if (sponsorRows.length === 0 || sponsorRows[0].UserType !== 'sponsor') {
      return res.status(403).json({ success: false, error: 'Only sponsors can assume driver view.' });
    }

    const sponsor = sponsorRows[0];

    if (!Boolean(sponsor.ActiveStatus)) {
      return res.status(403).json({ success: false, error: 'Inactive sponsor accounts cannot assume another view.' });
    }

    if (!hasBooleanPermission(sponsor.UserType, sponsor.Permissions, 'canAssumeDriverView')) {
      return res.status(403).json({ success: false, error: 'Missing canAssumeDriverView permission.' });
    }

    const [driverRows] = await connection.execute(
      `SELECT u.UserID, u.UserType, u.Username, u.FirstName, u.LastName, u.ActiveStatus
       FROM USERS u
       JOIN DRIVERS d ON d.UserID = u.UserID
       WHERE u.UserID = ? AND d.SponsorCompanyID = ?
       LIMIT 1`,
      [driverUserId, sponsor.SponsorCompanyID]
    );

    if (driverRows.length === 0 || driverRows[0].UserType !== 'driver') {
      return res.status(404).json({ success: false, error: 'Driver not found for this sponsor.' });
    }

    const driver = driverRows[0];

    if (!Boolean(driver.ActiveStatus)) {
      return res.status(409).json({ success: false, error: 'Cannot assume an inactive driver account.' });
    }

    await connection.execute(
      `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
       VALUES (?, NOW(), 'AccountUpdate', JSON_OBJECT('updatedFields', JSON_ARRAY('assumedView:driver'), 'isSelfUpdate', false, 'success', true))`,
      [sponsorUserId]
    );

    return res.json({
      success: true,
      assumedUser: normalizeUserForSession(driver),
    });
  } catch (error) {
    console.error('Sponsor assume driver error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  } finally {
    if (connection) {
      connection.release();
    }
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

// GET /api/sponsors/driver-purchases/:companyId
router.get('/driver-purchases/:companyId', async (req, res) => {
  const { companyId } = req.params;

  try {
    const [history] = await pool.execute(
      `SELECT
          t.TransactionID,
          t.PointChange,
          t.ReasonForChange,
          DATE_FORMAT(t.TimeChanged, '%Y-%m-%d %H:%i:%s') AS TimeChanged,
          u.FirstName,
          u.LastName
       FROM POINT_TRANSACTIONS t
       JOIN DRIVERS d ON t.DriverID = d.LicenseNumber
       JOIN USERS u ON d.UserID = u.UserID
       WHERE d.SponsorCompanyID = ?
         AND t.TimeChanged IS NOT NULL
         AND t.TimeChanged >= '2000-01-01 00:00:00'
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

// GET /api/sponsors/:userId/driver-applications
// Returns all applications for the sponsor's company, scoped by userId.
router.get('/:userId/driver-applications', async (req, res) => {
    try {
        const { userId } = req.params;

        const [sponsorRows] = await pool.execute(
            `SELECT SponsorCompanyID FROM SPONSORS WHERE UserID = ?`,
            [userId]
        );
        if (sponsorRows.length === 0) {
            return res.status(404).json({ error: 'Sponsor not found' });
        }
        const companyId = sponsorRows[0].SponsorCompanyID;

        const [rows] = await pool.execute(
            `SELECT
                da.ApplicationID,
                da.DriverID,
                da.ApplicationStatus,
                da.DecisionExplanation,
                da.TimeSubmitted,
                u.FirstName,
                u.LastName,
                d.LicenseNumber
             FROM DRIVER_APPLICATIONS da
             JOIN DRIVERS d ON da.DriverID = d.LicenseNumber
             JOIN USERS u ON d.UserID = u.UserID
             WHERE da.SponsorCompanyID = ?
             ORDER BY da.TimeSubmitted DESC`,
            [companyId]
        );
        res.json(rows);
    } catch (error) {
        console.error("Driver Applications Error:", error);
        res.status(500).json({ error: "Could not fetch applications" });
    }
});

// POST /api/sponsors/:userId/process-application
// Accepts or rejects an application, scoped to the sponsor's company.
router.post('/:userId/process-application', async (req, res) => {
    const { userId } = req.params;
    const { applicationId, status, explanation } = req.body;

    const validStatuses = ['accepted', 'rejected', 'pending'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
    }

    try {
        const [sponsorRows] = await pool.execute(
            `SELECT SponsorCompanyID FROM SPONSORS WHERE UserID = ?`,
            [userId]
        );
        if (sponsorRows.length === 0) {
            return res.status(404).json({ error: 'Sponsor not found' });
        }
        const companyId = sponsorRows[0].SponsorCompanyID;

        // Verify this application belongs to the sponsor's company
        const [appRows] = await pool.execute(
            `SELECT SponsorCompanyID FROM DRIVER_APPLICATIONS WHERE ApplicationID = ?`,
            [applicationId]
        );
        if (appRows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }
        if (Number(appRows[0].SponsorCompanyID) !== Number(companyId)) {
            return res.status(403).json({ error: 'Not authorized to modify this application' });
        }

        await pool.execute(
            `UPDATE DRIVER_APPLICATIONS
             SET ApplicationStatus = ?, DecisionExplanation = ?
             WHERE ApplicationID = ?`,
            [status, explanation || "", applicationId]
        );

        res.json({ message: `Application ${status} successfully.` });
    } catch (error) {
        console.error("Process Application Error:", error);
        res.status(500).json({ error: "Failed to update application status." });
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