/**
 * auth.js — Express route handler for authentication.
 * Mounted at /api/auth in server/index.js
 */
import { Router } from 'express';
import { getUserByUsername, logLoginAttempt } from '../db.js';
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

export default router;
