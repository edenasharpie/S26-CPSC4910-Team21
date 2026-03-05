/**
 * admin-users.js — Express routes for admin user and point-transaction management.
 * Mounted at /api/admin in server/index.js
 *
 * Routes defined here:
 *   GET    /api/admin/users/:id
 *   PUT    /api/admin/users/:id
 *   DELETE /api/admin/users/:id
 *   GET    /api/admin/point-transactions
 *   GET    /api/admin/drivers/:driverUserId/points
 *   GET    /api/admin/drivers/:driverUserId/point-history
 *   POST   /api/admin/drivers/:driverUserId/point-transactions
 *   PUT    /api/admin/point-transactions/:transactionId
 */
import { Router } from 'express';
import {
  getUserById,
  updateUser,
  deleteUser,
  getDriverPoints,
  getPointHistory,
  addPointTransaction,
  updatePointTransaction,
  getAllPointTransactions,
} from '../db.js';

const router = Router();

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/** GET /api/admin/users/:id */
router.get('/users/:id', async (req, res) => {
  try {
    const user = await getUserById(Number(req.params.id));
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(user);
  } catch (err) {
    console.error('GET /admin/users/:id error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/** PUT /api/admin/users/:id — full update */
router.put('/users/:id', async (req, res) => {
  try {
    const result = await updateUser(Number(req.params.id), req.body);
    return res.json({ success: true, result });
  } catch (err) {
    console.error('PUT /admin/users/:id error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/admin/users/:id */
router.delete('/users/:id', async (req, res) => {
  try {
    await deleteUser(Number(req.params.id));
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /admin/users/:id error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Point transactions (global list)
// ---------------------------------------------------------------------------

/** GET /api/admin/point-transactions */
router.get('/point-transactions', async (req, res) => {
  try {
    const transactions = await getAllPointTransactions();
    return res.json(transactions);
  } catch (err) {
    console.error('GET /admin/point-transactions error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/** PUT /api/admin/point-transactions/:transactionId
 *  Body: { newPoints: number, newReason: string, adminUserId: number }
 */
router.put('/point-transactions/:transactionId', async (req, res) => {
  const { newPoints, newReason, adminUserId } = req.body ?? {};
  try {
    await updatePointTransaction(Number(req.params.transactionId), newPoints, newReason, adminUserId);
    return res.json({ success: true });
  } catch (err) {
    console.error('PUT /admin/point-transactions/:transactionId error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Per-driver points
// ---------------------------------------------------------------------------

/** GET /api/admin/drivers/:driverUserId/points */
router.get('/drivers/:driverUserId/points', async (req, res) => {
  try {
    const driver = await getDriverPoints(Number(req.params.driverUserId));
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    return res.json(driver);
  } catch (err) {
    console.error('GET /admin/drivers/:driverUserId/points error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/** GET /api/admin/drivers/:driverUserId/point-history */
router.get('/drivers/:driverUserId/point-history', async (req, res) => {
  try {
    const history = await getPointHistory(Number(req.params.driverUserId));
    return res.json(history);
  } catch (err) {
    console.error('GET /admin/drivers/:driverUserId/point-history error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/** POST /api/admin/drivers/:driverUserId/point-transactions
 *  Body: { pointChange: number, reason: string, adminUserId: number }
 */
router.post('/drivers/:driverUserId/point-transactions', async (req, res) => {
  const { pointChange, reason, adminUserId } = req.body ?? {};
  try {
    await addPointTransaction(Number(req.params.driverUserId), adminUserId, pointChange, reason);
    return res.json({ success: true });
  } catch (err) {
    console.error('POST /admin/drivers/:driverUserId/point-transactions error:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
