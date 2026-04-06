/**
 * auth.js — Express route handler for authentication.
 * Mounted at /api/auth in server/index.js
 */
import crypto from 'crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getUserByUsername, logLoginAttempt, pool } from '../db.js';
import { generateSecret, generateURI, verify as verifyTotp } from 'otplib';
import QRCode from 'qrcode';
import { changePasswordWithHistory } from '../utils/queries.js';
import { validatePasswordComplexity, verifyPassword } from '../utils/auth.js';

const router = Router();

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
const REQUEST_RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const MAX_VERIFY_ATTEMPTS = 5;

const resetChallenges = new Map();
const resetTokens = new Map();
const requestRate = new Map();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-fleetscore';
const COOKIE_NAME = 'sessionId';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function cleanupExpiredResetState() {
  const now = Date.now();

  for (const [challengeId, challenge] of resetChallenges.entries()) {
    if (challenge.expiresAt <= now) {
      resetChallenges.delete(challengeId);
    }
  }

  for (const [token, state] of resetTokens.entries()) {
    if (state.expiresAt <= now) {
      resetTokens.delete(token);
    }
  }

  for (const [key, state] of requestRate.entries()) {
    if (state.windowEndsAt <= now) {
      requestRate.delete(key);
    }
  }
}

setInterval(cleanupExpiredResetState, 60 * 1000).unref();

function getClientIp(req) {
  return (
    String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function consumeRequestQuota(key) {
  const now = Date.now();
  const current = requestRate.get(key);

  if (!current || current.windowEndsAt <= now) {
    requestRate.set(key, {
      count: 1,
      windowEndsAt: now + REQUEST_RATE_WINDOW_MS,
    });
    return { allowed: true };
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((current.windowEndsAt - now) / 1000),
    };
  }

  current.count += 1;
  requestRate.set(key, current);
  return { allowed: true };
}

async function findUserByIdentifier(identifier) {
  const [rows] = await pool.execute(
    'SELECT UserID, Username, Email, UserType FROM USERS WHERE Username = ? OR Email = ? LIMIT 1',
    [identifier, identifier]
  );
  return rows[0] ?? null;
}

async function logPasswordResetEvent(userId, stage, success) {
  if (!userId) return;

  await pool.execute(
    'INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties) VALUES (?, NOW(), ?, ?)',
    [
      userId,
      'Notification',
      JSON.stringify({
        content: `password_reset_${stage}_${success ? 'success' : 'failed'}`,
      }),
    ]
  );
}

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

  const ip = getClientIp(req);

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required.' });
  }

  // --- 1. Look up user ---
  let user;
  try {
    user = await getUserByUsername(String(username).trim());
  } catch (err) {
    console.error('DB error during login lookup:', err);
    return res.status(500).json({ success: false, error: 'A server error occurred. Please try again.' });
  }

  if (!user) {
    await logLoginAttempt(null, false, 'username_not_found', ip);
    return res.status(401).json({ success: false, error: 'Invalid username or password.' });
  }

  // Verify password 
  const passwordMatch = await verifyPassword(String(password), user.PassHash);

  if (!passwordMatch) {
    await logLoginAttempt(user.UserID, false, 'failed', ip);
    return res.status(401).json({ success: false, error: 'Invalid username or password.' });
  }

  // Check account is active 
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

  await logLoginAttempt(user.UserID, true, 'success', ip);

  // Prepare the data for the JWT (matches SessionUser type in React)
  const sessionUser = {
    UserID: user.UserID,
    UserType: user.UserType.toLowerCase(), 
    Username: user.Username,
  };

  // Sign JWT
  const token = jwt.sign(sessionUser, JWT_SECRET, { expiresIn: '24h' });

  // Set HttpOnly Cookie
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', 
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_MS
  });

  return res.status(200).json({
    success: true,
    userID: user.UserID,
    userType: user.UserType,
    username: user.Username,
    firstName: user.FirstName,
    lastName: user.LastName,
  });
});

/**
 * POST /api/auth/password-reset/request
 * Body: { identifier: string }
 */
router.post('/password-reset/request', async (req, res) => {
  const { identifier } = req.body ?? {};
  const normalizedIdentifier = String(identifier ?? '').trim();

  if (!normalizedIdentifier) {
    return res.status(400).json({ success: false, error: 'identifier is required.' });
  }

  const ip = getClientIp(req);
  const quota = consumeRequestQuota(`${ip}:${normalizedIdentifier.toLowerCase()}`);
  if (!quota.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Too many reset requests. Please try again later.',
      retryAfterSeconds: quota.retryAfterSeconds,
    });
  }

  try {
    const user = await findUserByIdentifier(normalizedIdentifier);
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists, a reset challenge has been prepared.',
      });
    }

    const secret = generateSecret();
    const otpauth = generateURI({
      issuer: 'FleetScore',
      label: user.Email || user.Username,
      secret,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

    const resetRequestId = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + CHALLENGE_TTL_MS;

    resetChallenges.set(resetRequestId, {
      userId: user.UserID,
      secret,
      attempts: 0,
      expiresAt,
    });

    await logPasswordResetEvent(user.UserID, 'requested', true);

    return res.status(200).json({
      success: true,
      resetRequestId,
      expiresAt: new Date(expiresAt).toISOString(),
      manualEntryKey: secret,
      qrCodeDataUrl,
      message: 'Scan the QR code with your authenticator app, then verify your 6-digit code.',
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    return res.status(500).json({ success: false, error: 'Failed to initiate password reset.' });
  }
});

/**
 * POST /api/auth/password-reset/verify-totp
 * Body: { resetRequestId: string, totpCode: string }
 */
router.post('/password-reset/verify-totp', async (req, res) => {
  const { resetRequestId, totpCode } = req.body ?? {};
  const challengeId = String(resetRequestId ?? '').trim();
  const code = String(totpCode ?? '').trim();

  if (!challengeId || !code) {
    return res.status(400).json({ success: false, error: 'resetRequestId and totpCode are required.' });
  }

  const challenge = resetChallenges.get(challengeId);
  if (!challenge || challenge.expiresAt <= Date.now()) {
    resetChallenges.delete(challengeId);
    return res.status(400).json({ success: false, error: 'Reset challenge is invalid or expired.' });
  }

  if (challenge.attempts >= MAX_VERIFY_ATTEMPTS) {
    return res.status(429).json({
      success: false,
      error: 'Too many invalid verification attempts. Request a new reset challenge.',
    });
  }

  challenge.attempts += 1;
  resetChallenges.set(challengeId, challenge);

  const verificationResult = await verifyTotp({ token: code, secret: challenge.secret });
  const isValid = Boolean(verificationResult?.valid);
  if (!isValid) {
    await logPasswordResetEvent(challenge.userId, 'totp_verify', false);
    return res.status(401).json({ success: false, error: 'Invalid TOTP code.' });
  }

  const resetToken = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;

  resetTokens.set(resetToken, {
    userId: challenge.userId,
    expiresAt,
  });
  resetChallenges.delete(challengeId);

  await logPasswordResetEvent(challenge.userId, 'totp_verify', true);

  return res.status(200).json({
    success: true,
    resetToken,
    expiresAt: new Date(expiresAt).toISOString(),
    message: 'TOTP verified. You may now set a new password.',
  });
});

/**
 * POST /api/auth/password-reset/confirm
 * Body: { resetToken: string, newPassword: string }
 */
router.post('/password-reset/confirm', async (req, res) => {
  const { resetToken, newPassword } = req.body ?? {};
  const token = String(resetToken ?? '').trim();
  const password = String(newPassword ?? '');

  if (!token || !password) {
    return res.status(400).json({ success: false, error: 'resetToken and newPassword are required.' });
  }

  const resetState = resetTokens.get(token);
  if (!resetState || resetState.expiresAt <= Date.now()) {
    resetTokens.delete(token);
    return res.status(401).json({ success: false, error: 'Reset token is invalid or expired.' });
  }

  const complexity = validatePasswordComplexity(password);
  if (!complexity.valid) {
    return res.status(400).json({ success: false, error: complexity.error });
  }

  try {
    const result = await changePasswordWithHistory(resetState.userId, password, 'password_reset');
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    resetTokens.delete(token);
    await logPasswordResetEvent(resetState.userId, 'completed', true);

    return res.status(200).json({
      success: true,
      message: 'Password reset successful. Please log in with your new password.',
    });
  } catch (error) {
    console.error('Password reset confirm error:', error);
    return res.status(500).json({ success: false, error: 'Failed to complete password reset.' });
  }
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

/**
 * POST /api/auth/assumption-exit
 * Body: { actingUserId: number, originalUserId: number }
 */
router.post('/assumption-exit', async (req, res) => {
  const actingUserId = Number(req.body?.actingUserId);
  const originalUserId = Number(req.body?.originalUserId);

  if (!Number.isInteger(actingUserId) || !Number.isInteger(originalUserId)) {
    return res.status(400).json({
      success: false,
      error: 'actingUserId and originalUserId are required.',
    });
  }

  try {
    await pool.execute(
      `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
       VALUES (?, NOW(), 'AccountUpdate', JSON_OBJECT('updatedFields', JSON_ARRAY('assumedView:exit'), 'isSelfUpdate', false, 'success', true))`,
      [originalUserId]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Error logging assumption exit event:', error);
    return res.status(500).json({ success: false, error: 'Failed to log assumption exit.' });
  }
});

export default router;
