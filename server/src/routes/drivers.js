import express from 'express';
const router = express.Router();
import { pool } from '../db.js';
import { verifyPassword } from '../utils/auth.js';

// GET /api/drivers/my-points/:userId
router.get('/my-points/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // 1. Get current balance and LicenseNumber from DRIVERS table
    const [driverInfo] = await pool.execute(
      "SELECT PointBalance, LicenseNumber FROM DRIVERS WHERE UserID = ?",
      [userId]
    );

    if (driverInfo.length === 0) {
      return res.status(404).json({ error: "Driver profile not found." });
    }

    const { PointBalance, LicenseNumber } = driverInfo[0];

    // 2. Get transaction history from POINT_TRANSACTIONS
    const [history] = await pool.execute(
      `SELECT PointChange, ReasonForChange, TimeChanged 
       FROM POINT_TRANSACTIONS 
       WHERE DriverID = ? 
       ORDER BY TimeChanged DESC`,
      [LicenseNumber]
    );

    res.json({
      balance: PointBalance,
      history: history
    });
  } catch (error) {
    console.error("Driver Points Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/drivers/performance/:userId
router.get('/performance/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const [rows] = await pool.execute(
      'SELECT PerformanceStatus FROM DRIVERS WHERE UserID = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Driver profile not found.' });
    }

    return res.json({ performanceStatus: rows[0].PerformanceStatus });
  } catch (error) {
    console.error('Driver Performance Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/drivers/deactivate
router.post('/deactivate', async (req, res) => {
  const { userId, currentPassword } = req.body ?? {};

  if (!userId || !currentPassword) {
    return res.status(400).json({ error: 'userId and currentPassword are required.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT u.UserID, u.PassHash, u.UserType, u.ActiveStatus
       FROM USERS u
       INNER JOIN DRIVERS d ON d.UserID = u.UserID
       WHERE u.UserID = ?
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Driver account not found.' });
    }

    const user = rows[0];

    if (user.UserType !== 'driver') {
      await connection.rollback();
      return res.status(403).json({ error: 'Only driver accounts can self-deactivate.' });
    }

    const passwordMatches = await verifyPassword(String(currentPassword), user.PassHash);
    if (!passwordMatches) {
      await connection.rollback();
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    if (!Boolean(user.ActiveStatus)) {
      await connection.rollback();
      return res.status(409).json({ error: 'This account is already deactivated.' });
    }

    await connection.execute('UPDATE USERS SET ActiveStatus = 0 WHERE UserID = ?', [user.UserID]);

    await connection.execute(
      `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
       VALUES (?, NOW(), 'AccountStatusChange', JSON_OBJECT('newStatus', false, 'targetUserId', ?, 'adminNotes', 'self_deactivate'))`,
      [user.UserID, user.UserID]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: 'Account deactivated successfully.',
    });
  } catch (error) {
    await connection.rollback();
    console.error('Driver Deactivate Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    connection.release();
  }
});

export default router;