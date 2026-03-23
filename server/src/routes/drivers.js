import express from 'express';
const router = express.Router();
import { pool } from '../db.js';

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

export default router;