import express from 'express';
import { validatePasswordComplexity, hashPassword, verifyPassword } from '../utils/auth.js';
import { changePasswordWithHistory, getUserById } from '../utils/queries.js';
import { pool } from '../db.js';
import {
  routeUserMatchesEffectiveSession,
} from '../middleware/session-context.js';
import { notifySponsorCompany } from '../services/notification-service.js';
import {
  normalizeNotificationPreferences,
} from '../services/notification-service.js';
import {
  handleProfileImageUpload,
  normalizeProfilePictureValue,
} from '../utils/profile-image-upload.js';

const router = express.Router();

function normalizeBooleanPreferenceInput(value) {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}


/**
 * GET /api/user/profile/:id
 */
router.get('/profile/:id', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    let licenseNumber = null;
    let alertPoints = null;
    let alertOrders = null;
    if (String(user.UserType).toLowerCase() === 'driver') {
      const [driverRows] = await pool.execute(
        'SELECT LicenseNumber, AlertPoints, AlertOrders FROM DRIVERS WHERE UserID = ? LIMIT 1',
        [userId]
      );
      licenseNumber = driverRows[0]?.LicenseNumber ?? null;
      alertPoints = driverRows[0]?.AlertPoints ?? null;
      alertOrders = driverRows[0]?.AlertOrders ?? null;
    }

    const notificationPreferences = normalizeNotificationPreferences(user.Permissions, {
      ...(alertPoints !== null ? { alertPoints: Boolean(alertPoints) } : {}),
      ...(alertOrders !== null ? { alertOrders: Boolean(alertOrders) } : {}),
    });

    // Omit sensitive fields before returning
    const { PassHash, ...safeUser } = user;
    res.status(200).json({
      ...safeUser,
      LicenseNumber: licenseNumber,
      AlertPoints: notificationPreferences.alertPoints,
      AlertOrders: notificationPreferences.alertOrders,
      AlertApplicationStatusChange: notificationPreferences.alertApplicationStatusChange,
      AlertApplicationEntry: notificationPreferences.alertApplicationEntry,
      AlertProfileChangesByAdmin: notificationPreferences.alertProfileChangesByAdmin,
      NotificationPreferences: notificationPreferences,
    });
  } catch (error) {
    console.error('Profile Route Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PATCH /api/user/profile/:id
 */
router.patch('/profile/:id', handleProfileImageUpload, async (req, res) => {
  let connection;
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'Invalid user id.' });
    }

    if (!routeUserMatchesEffectiveSession(req, userId)) {
      return res.status(403).json({ error: 'Access forbidden for requested user context.' });
    }

    const firstName = typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : undefined;
    const lastName = typeof req.body?.lastName === 'string' ? req.body.lastName.trim() : undefined;
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : undefined;
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : undefined;
    const phoneRaw = typeof req.body?.phone === 'string' ? req.body.phone.trim() : undefined;
    const phone = phoneRaw === '' ? null : phoneRaw;
    const middleNameRaw = typeof req.body?.middleName === 'string' ? req.body.middleName.trim() : undefined;
    const middleName = middleNameRaw === '' ? null : middleNameRaw;
    const pronounsRaw = typeof req.body?.pronouns === 'string' ? req.body.pronouns.trim() : undefined;
    const pronouns = pronounsRaw === '' ? null : pronounsRaw;
    const profilePicture = normalizeProfilePictureValue(req.body?.profilePicture, req.file);
    const bioRaw = typeof req.body?.bio === 'string' ? req.body.bio.trim() : undefined;
    const bio = bioRaw === '' ? null : bioRaw;
    const licenseNumberRaw = typeof req.body?.licenseNumber === 'string' ? req.body.licenseNumber.trim() : undefined;
    const licenseNumber = licenseNumberRaw === '' ? null : licenseNumberRaw;
    const alertPoints = normalizeBooleanPreferenceInput(req.body?.alertPoints);
    const alertOrders = normalizeBooleanPreferenceInput(req.body?.alertOrders);
    const alertApplicationStatusChange = normalizeBooleanPreferenceInput(req.body?.alertApplicationStatusChange);
    const alertApplicationEntry = normalizeBooleanPreferenceInput(req.body?.alertApplicationEntry);
    const alertProfileChangesByAdmin = normalizeBooleanPreferenceInput(req.body?.alertProfileChangesByAdmin);

    const updates = [];
    const values = [];
    const hasLicenseNumberUpdate = licenseNumber !== undefined;
    const hasNotificationPreferenceUpdate =
      alertPoints !== undefined ||
      alertOrders !== undefined ||
      alertApplicationStatusChange !== undefined ||
      alertApplicationEntry !== undefined ||
      alertProfileChangesByAdmin !== undefined;

    if (
      alertPoints === null ||
      alertOrders === null ||
      alertApplicationStatusChange === null ||
      alertApplicationEntry === null ||
      alertProfileChangesByAdmin === null
    ) {
      return res.status(400).json({
        error: 'Notification preferences must be boolean values.',
      });
    }

    if (firstName !== undefined) {
      if (!firstName) {
        return res.status(400).json({ error: 'firstName cannot be empty.' });
      }
      updates.push('FirstName = ?');
      values.push(firstName);
    }

    if (lastName !== undefined) {
      if (!lastName) {
        return res.status(400).json({ error: 'lastName cannot be empty.' });
      }
      updates.push('LastName = ?');
      values.push(lastName);
    }

    if (username !== undefined) {
      if (!username) {
        return res.status(400).json({ error: 'username cannot be empty.' });
      }
      updates.push('Username = ?');
      values.push(username);
    }

    if (email !== undefined) {
      if (!email) {
        return res.status(400).json({ error: 'email cannot be empty.' });
      }
      updates.push('Email = ?');
      values.push(email);
    }

    if (phone !== undefined) {
      updates.push('Phone = ?');
      values.push(phone);
    }

    if (middleName !== undefined) {
      updates.push('MiddleName = ?');
      values.push(middleName);
    }

    if (pronouns !== undefined) {
      updates.push('Pronouns = ?');
      values.push(pronouns);
    }

    if (profilePicture !== undefined) {
      updates.push('ProfilePicture = ?');
      values.push(profilePicture);
    }

    if (bio !== undefined) {
      updates.push('Bio = ?');
      values.push(bio);
    }

    if (updates.length === 0 && !hasLicenseNumberUpdate && !hasNotificationPreferenceUpdate) {
      return res.status(400).json({ error: 'No valid profile fields provided for update.' });
    }

    if (hasLicenseNumberUpdate && !licenseNumber) {
      return res.status(400).json({ error: 'licenseNumber cannot be empty.' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [userRows] = await connection.execute(
      `SELECT UserID, UserType, Permissions
       FROM USERS
       WHERE UserID = ?
       LIMIT 1`,
      [userId]
    );

    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'User not found.' });
    }

    const userType = String(userRows[0].UserType ?? '').toLowerCase();

    if (updates.length > 0) {
      const [updateResult] = await connection.execute(
        `UPDATE USERS SET ${updates.join(', ')} WHERE UserID = ?`,
        [...values, userId]
      );

      if (updateResult.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'User not found.' });
      }
    }

    if (hasLicenseNumberUpdate) {
      const [driverUpdateResult] = await connection.execute(
        'UPDATE DRIVERS SET LicenseNumber = ? WHERE UserID = ?',
        [licenseNumber, userId]
      );

      if (driverUpdateResult.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Driver profile not found for this user.' });
      }
    }

    if (hasNotificationPreferenceUpdate) {
      const nextPreferences = normalizeNotificationPreferences(userRows[0].Permissions, {
        ...(alertPoints !== undefined ? { alertPoints } : {}),
        ...(alertOrders !== undefined ? { alertOrders } : {}),
        ...(alertApplicationStatusChange !== undefined ? { alertApplicationStatusChange } : {}),
        ...(alertApplicationEntry !== undefined ? { alertApplicationEntry } : {}),
        ...(alertProfileChangesByAdmin !== undefined ? { alertProfileChangesByAdmin } : {}),
      });

      await connection.execute(
        'UPDATE USERS SET Permissions = ? WHERE UserID = ?',
        [JSON.stringify(nextPreferences), userId]
      );

      if (userType === 'driver') {
        const driverUpdates = [];
        const driverValues = [];

        if (alertPoints !== undefined) {
          driverUpdates.push('AlertPoints = ?');
          driverValues.push(alertPoints ? 1 : 0);
        }

        if (alertOrders !== undefined) {
          driverUpdates.push('AlertOrders = ?');
          driverValues.push(alertOrders ? 1 : 0);
        }

        if (driverUpdates.length > 0) {
          const [driverUpdateResult] = await connection.execute(
            `UPDATE DRIVERS SET ${driverUpdates.join(', ')} WHERE UserID = ?`,
            [...driverValues, userId]
          );

          if (driverUpdateResult.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Driver profile not found for this user.' });
          }
        }
      }
    }

    const [rows] = await connection.execute(
      `SELECT u.UserID, u.Username, u.Email, u.Phone, u.UserType, u.FirstName, u.MiddleName, u.LastName, u.Pronouns,
              u.ActiveStatus, u.ProfilePicture, u.Bio, u.Permissions, d.LicenseNumber, d.AlertPoints, d.AlertOrders
       FROM USERS u
       LEFT JOIN DRIVERS d ON d.UserID = u.UserID
       WHERE u.UserID = ?
       LIMIT 1`,
      [userId]
    );

    const responseRow = rows[0];
    const responseNotificationPreferences = normalizeNotificationPreferences(responseRow.Permissions, {
      ...(responseRow.AlertPoints !== null && responseRow.AlertPoints !== undefined
        ? { alertPoints: Boolean(responseRow.AlertPoints) }
        : {}),
      ...(responseRow.AlertOrders !== null && responseRow.AlertOrders !== undefined
        ? { alertOrders: Boolean(responseRow.AlertOrders) }
        : {}),
    });

    await connection.commit();

    return res.status(200).json({
      ...responseRow,
      AlertPoints: responseNotificationPreferences.alertPoints,
      AlertOrders: responseNotificationPreferences.alertOrders,
      AlertApplicationStatusChange: responseNotificationPreferences.alertApplicationStatusChange,
      AlertApplicationEntry: responseNotificationPreferences.alertApplicationEntry,
      AlertProfileChangesByAdmin: responseNotificationPreferences.alertProfileChangesByAdmin,
      NotificationPreferences: responseNotificationPreferences,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username or email already exists.' });
    }
    console.error('Profile Update Route Error:', error);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

/**
 * POST /api/user/deactivate
 * Body: { userId: number, currentPassword: string }
 */
router.post('/deactivate', async (req, res) => {
  let connection;
  try {
    const userId = Number(req.body?.userId);
    const currentPassword = typeof req.body?.currentPassword === 'string'
      ? req.body.currentPassword
      : '';

    if (!Number.isInteger(userId) || !currentPassword) {
      return res.status(400).json({ error: 'userId and currentPassword are required.' });
    }

    if (!routeUserMatchesEffectiveSession(req, userId)) {
      return res.status(403).json({ error: 'Access forbidden for requested user context.' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT UserID, UserType, PassHash, ActiveStatus
       FROM USERS
       WHERE UserID = ?
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = rows[0];

    if (!Boolean(user.ActiveStatus)) {
      await connection.rollback();
      return res.status(409).json({ error: 'This account is already deactivated.' });
    }

    const passwordMatches = await verifyPassword(currentPassword, user.PassHash);
    if (!passwordMatches) {
      await connection.rollback();
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    await connection.execute(
      'UPDATE USERS SET ActiveStatus = 0 WHERE UserID = ?',
      [userId]
    );

    await connection.execute(
      `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
       VALUES (?, NOW(), 'AccountStatusChange', JSON_OBJECT('newStatus', false, 'targetUserId', ?, 'adminNotes', 'self_deactivate'))`,
      [userId, userId]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: 'Account deactivated successfully.',
      userId,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Profile Deactivate Route Error:', error);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

/**
 * POST /api/user/change-password
 */
router.post('/change-password', async (req, res) => {
  const { userId, newPassword } = req.body;
  const pool = req.app.get('pool');

  // Validate password complexity (story 4287)
  const complexity = validatePasswordComplexity(newPassword);
  if (!complexity.valid) {
    return res.status(400).json({ message: complexity.error });
  }

  try {
    const result = await changePasswordWithHistory(userId, newPassword);

    if (result.success) {
      return res.status(200).json({ message: "Password updated successfully!" });
    } else {
      return res.status(400).json({ message: result.error });
    }
    
  } catch (error) {
    console.error("Change Password Route Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

/**
 * POST /api/user/register-driver
 * Public endpoint for driver self-registration.
 */
router.post('/register-driver', async (req, res) => {
  const {
    username,
    email,
    password,
    firstName,
    lastName,
    licenseNumber,
    phone,
  } = req.body ?? {};

  if (!username || !email || !password || !firstName || !lastName || !licenseNumber) {
    return res.status(400).json({
      error: 'Missing required fields: username, email, password, firstName, lastName, licenseNumber',
    });
  }

  const complexity = validatePasswordComplexity(String(password));
  if (!complexity.valid) {
    return res.status(400).json({ error: complexity.error });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [existingUsers] = await connection.execute(
      'SELECT UserID FROM USERS WHERE Username = ? OR Email = ?',
      [String(username).trim(), String(email).trim()]
    );

    if (existingUsers.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const [existingDrivers] = await connection.execute(
      'SELECT UserID FROM DRIVERS WHERE LicenseNumber = ?',
      [String(licenseNumber).trim()]
    );

    if (existingDrivers.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'License number is already registered' });
    }

    const passHash = await hashPassword(String(password));
    const defaultPermissions = JSON.stringify({});

    const [userResult] = await connection.execute(
      `INSERT INTO USERS
        (Username, Email, Phone, PassHash, UserType, FirstName, LastName, ActiveStatus, LastLogin, LastPasswordChange, Permissions)
       VALUES (?, ?, ?, ?, 'driver', ?, ?, 1, NOW(), NOW(), ?)`,
      [
        String(username).trim(),
        String(email).trim(),
        phone ? String(phone).trim() : null,
        passHash,
        String(firstName).trim(),
        String(lastName).trim(),
        defaultPermissions,
      ]
    );

    const newUserId = userResult.insertId;

    await connection.execute(
      `INSERT INTO DRIVERS
        (LicenseNumber, UserID, SponsorCompanyID, PointBalance, PerformanceStatus, AlertPoints, AlertOrders)
       VALUES (?, ?, NULL, 0, 'good', 1, 1)`,
      [String(licenseNumber).trim(), newUserId]
    );

    await connection.commit();

    return res.status(201).json({
      message: 'Driver account created successfully.',
      userId: newUserId,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Driver registration error:', error);
    return res.status(500).json({ error: 'Failed to create driver account.' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Drivers create application
router.post('/submit-application', async (req, res) => {
  const { driverId, sponsorCompanyId, explanation } = req.body;
  let connection;

  try {
    const rawDriverId = String(driverId ?? '').trim();
    const rawSponsorCompanyId = Number(sponsorCompanyId);
    const rawExplanation = String(explanation ?? '').trim();

    if (!rawDriverId || !Number.isInteger(rawSponsorCompanyId) || !rawExplanation) {
      return res.status(400).json({ error: 'driverId, sponsorCompanyId, and explanation are required.' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // DRIVER_APPLICATIONS.DriverID should store DRIVERS.LicenseNumber.
    let licenseNumber = rawDriverId;
    let resolvedDriverUserId = null;
    const numericDriverId = Number(rawDriverId);

    if (Number.isInteger(numericDriverId)) {
      const [driverRows] = await connection.execute(
        'SELECT UserID, LicenseNumber FROM DRIVERS WHERE UserID = ? LIMIT 1',
        [numericDriverId]
      );

      if (driverRows.length > 0) {
        resolvedDriverUserId = Number(driverRows[0].UserID);
        licenseNumber = driverRows[0].LicenseNumber;
      }
    }

    const [driverByLicenseRows] = await connection.execute(
      'SELECT UserID, LicenseNumber FROM DRIVERS WHERE LicenseNumber = ? LIMIT 1',
      [licenseNumber]
    );

    if (driverByLicenseRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Driver not found. Could not resolve driver license number.' });
    }

    resolvedDriverUserId = Number(driverByLicenseRows[0].UserID);

    const [sponsorRows] = await connection.execute(
      'SELECT SponsorCompanyID FROM SPONSOR_COMPANIES WHERE SponsorCompanyID = ? LIMIT 1',
      [rawSponsorCompanyId]
    );

    if (sponsorRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Sponsor company not found.' });
    }

    const [existingPendingRows] = await connection.execute(
      `SELECT ApplicationID
       FROM DRIVER_APPLICATIONS
       WHERE DriverID = ? AND SponsorCompanyID = ? AND ApplicationStatus = 'pending'
       LIMIT 1`,
      [licenseNumber, rawSponsorCompanyId]
    );

    if (existingPendingRows.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'You already have a pending application for this sponsor.' });
    }

    // ApplicationStatus defaults to 'pending' based on your ENUM
    const [result] = await connection.execute(
      `INSERT INTO DRIVER_APPLICATIONS 
       (DriverID, SponsorCompanyID, ApplicationStatus, DecisionExplanation, TimeSubmitted)
       VALUES (?, ?, 'pending', ?, NOW())`,
      [licenseNumber, rawSponsorCompanyId, rawExplanation]
    );

    const applicationId = Number(result.insertId);

    await notifySponsorCompany(connection, {
      sponsorCompanyId: rawSponsorCompanyId,
      actorUserId: resolvedDriverUserId,
      content: `New driver application submitted (#${applicationId}).`,
      category: 'driver_application_submitted',
      preference: 'application_entry',
      metadata: {
        applicationId,
        sponsorCompanyId: rawSponsorCompanyId,
        driverId: licenseNumber,
        driverUserId: resolvedDriverUserId,
      },
    });

    await connection.commit();

    res.status(201).json({ 
      message: "Application submitted successfully!", 
      applicationId,
      driverId: licenseNumber,
      sponsorCompanyId: rawSponsorCompanyId,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error("Submission Error:", error);
    res.status(500).json({ error: "Could not submit application. You may already have a pending request." });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

router.get('/my-applications/:driverId', async (req, res) => {
    const { driverId } = req.params;

    try {
        const rawDriverId = String(driverId ?? '').trim();
        if (!rawDriverId) {
          return res.status(400).json({ error: 'driverId is required.' });
        }

        const numericDriverId = Number(rawDriverId);
        let driverRow;

        if (Number.isInteger(numericDriverId)) {
          const [driverRows] = await pool.execute(
            'SELECT UserID, LicenseNumber FROM DRIVERS WHERE UserID = ? LIMIT 1',
            [numericDriverId]
          );

          if (driverRows.length > 0) {
            driverRow = driverRows[0];
          }
        }

        if (!driverRow) {
          const [driverRowsByLicense] = await pool.execute(
            'SELECT UserID, LicenseNumber FROM DRIVERS WHERE LicenseNumber = ? LIMIT 1',
            [rawDriverId]
          );

          if (driverRowsByLicense.length > 0) {
            driverRow = driverRowsByLicense[0];
          }
        }

        if (!driverRow) {
          return res.status(404).json({ error: 'Driver not found.' });
        }

        const resolvedDriverUserId = Number(driverRow.UserID);
        const licenseNumber = String(driverRow.LicenseNumber);

        if (!routeUserMatchesEffectiveSession(req, resolvedDriverUserId)) {
          return res.status(403).json({ error: 'Access forbidden for requested user context.' });
        }

        let assumedSponsorCompanyId = null;
        const sessionContext = req.sessionContext;
        const assumedEffectiveUser = sessionContext?.effectiveUser;
        const assumedOriginalUser = sessionContext?.originalUser;

        if (
          sessionContext?.isAssumed &&
          assumedEffectiveUser &&
          assumedOriginalUser &&
          String(assumedEffectiveUser.UserType).toLowerCase() === 'driver' &&
          Number(assumedEffectiveUser.UserID) === resolvedDriverUserId &&
          String(assumedOriginalUser.UserType).toLowerCase() === 'sponsor'
        ) {
          const [sponsorRows] = await pool.execute(
            'SELECT SponsorCompanyID FROM SPONSORS WHERE UserID = ? LIMIT 1',
            [assumedOriginalUser.UserID]
          );

          if (sponsorRows.length === 0) {
            return res.status(403).json({ error: 'Assumed sponsor context is invalid.' });
          }

          assumedSponsorCompanyId = Number(sponsorRows[0].SponsorCompanyID);
        }

        const query =
            `SELECT 
                a.ApplicationID, 
                a.SponsorCompanyID, 
                sc.CompanyName AS SponsorName,
                a.ApplicationStatus, 
                a.DecisionExplanation, 
                a.TimeSubmitted
             FROM DRIVER_APPLICATIONS a
             JOIN SPONSOR_COMPANIES sc ON a.SponsorCompanyID = sc.SponsorCompanyID
             WHERE a.DriverID = ?` +
            (Number.isInteger(assumedSponsorCompanyId) ? ' AND a.SponsorCompanyID = ?' : '') +
            ' ORDER BY a.TimeSubmitted DESC';

        const queryParams = Number.isInteger(assumedSponsorCompanyId)
          ? [licenseNumber, assumedSponsorCompanyId]
          : [licenseNumber];

        const [rows] = await pool.execute(query, queryParams);
        res.json(rows);
    } catch (error) {
        console.error("Fetch Apps Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

//module.exports = router;
export default router;