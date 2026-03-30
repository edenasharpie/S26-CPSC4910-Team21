/**
 * auth.js — Express route handler for authentication.
 * Mounted at /api/auth in server/index.js
 */
import { Router } from 'express';
import { getUserByUsername, logLoginAttempt, pool } from '../db.js';
import { verifyPassword } from '../utils/auth.js';

const router = Router();

/**
 * POST /api/auth/login
 * Body: { username: string, password: string }
 *
 * 200: { success: true, userID, userType, username }
 * 400: { success: false, error: "..." }  — missing fields
 * 401: { success: false, error: "..." }  — bad credentials
 * 403: { success: false, error: "..." }  — deactivated account
 * 500: { success: false, error: "..." }  — server error
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};

  const ip =
    String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required.' });
  }

  // --- Look up user ---
  let user;
  try {
    user = await getUserByUsername(String(username).trim());
  } catch (err) {
    console.error('DB error during login lookup:', err);
    return res.status(500).json({ success: false, error: 'A server error occurred. Please try again.' });
  }

  if (!user) {
    await logLoginAttempt(null, false, 'username_not_found', ip);
    // Deliberately vague — do not reveal whether the username exists
    return res.status(401).json({ success: false, error: 'Invalid username or password.' });
  }

  // --- Verify password ---
  const passwordMatch = await verifyPassword(String(password), user.PassHash);

  if (!passwordMatch) {
    await logLoginAttempt(user.UserID, false, 'failed', ip);
    return res.status(401).json({ success: false, error: 'Invalid username or password.' });
  }

  // --- Check account is active ---
  if (!user.ActiveStatus) {
    await logLoginAttempt(user.UserID, false, 'failed', ip);
    return res.status(403).json({
      success: false,
      error: 'This account has been deactivated. Please contact support.',
      errorCode: 'ACCOUNT_DEACTIVATED',
      isDeactivated: true,
      canSelfReactivate: user.UserType === 'driver',
    });
  }

  // --- Success ---
  await logLoginAttempt(user.UserID, true, 'success', ip);

  return res.status(200).json({
    success: true,
    userID: user.UserID,
    userType: user.UserType,
    username: user.Username,
  });
});

/**
 * POST /api/auth/reactivate
 * Body: { username: string, password: string }
 *
 * 200: { success: true, message: "..." }
 * 400: { success: false, error: "..." }  — missing fields
 * 401: { success: false, error: "..." }  — bad credentials
 * 403: { success: false, error: "..." }  — unsupported role
 * 409: { success: false, error: "..." }  — already active
 * 500: { success: false, error: "..." }  — server error
 */
router.post('/reactivate', async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required.',
    });
  }

  let user;
  try {
    user = await getUserByUsername(String(username).trim());
  } catch (err) {
    console.error('DB error during reactivation lookup:', err);
    return res.status(500).json({ success: false, error: 'A server error occurred. Please try again.' });
  }

  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid username or password.' });
  }

  const passwordMatch = await verifyPassword(String(password), user.PassHash);
  if (!passwordMatch) {
    return res.status(401).json({ success: false, error: 'Invalid username or password.' });
  }

  if (user.UserType !== 'driver') {
    return res.status(403).json({
      success: false,
      error: 'Only driver accounts can use self-reactivation.',
    });
  }

  if (Boolean(user.ActiveStatus)) {
    return res.status(409).json({
      success: false,
      error: 'This account is already active. Please sign in.',
    });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.execute('UPDATE USERS SET ActiveStatus = 1 WHERE UserID = ?', [user.UserID]);

    await connection.execute(
      `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
       VALUES (?, NOW(), 'AccountStatusChange', JSON_OBJECT('newStatus', true, 'targetUserId', ?, 'adminNotes', 'self_reactivate'))`,
      [user.UserID, user.UserID]
    );

    await connection.commit();
    return res.status(200).json({
      success: true,
      message: 'Account reactivated successfully. You can now sign in.',
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error reactivating account:', err);
    return res.status(500).json({ success: false, error: 'Failed to reactivate account.' });
  } finally {
    connection.release();
  }
});

export default router;
