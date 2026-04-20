import { Router } from 'express';
import { pool } from '../db.js';
import {
  getUserById,
  updateUser,
  getDriverPoints,
  getPointHistory,
  addPointTransaction,
  updatePointTransaction,
  getAllPointTransactions,
} from '../db.js';
import {
  hashPassword,
  hasBooleanPermission,
  validatePasswordComplexity,
  verifyPassword,
} from '../utils/auth.js';
import { processBulkLoadFile } from '../services/bulk-load-service.js';
import {
  getDriverNotificationContextByLicense,
  getDriverNotificationContextByUserId,
  insertNotificationEvent,
  normalizeNotificationPreferences,
  notifyDriver,
  notifySponsorCompany,
} from '../services/notification-service.js';
import {
  handleProfileImageUpload,
  normalizeProfilePictureValue,
} from '../utils/profile-image-upload.js';

const router = Router();
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

async function sendAdminPointChangeNotification({
  driverUserId,
  adminUserId,
  pointChange,
  reason,
  isUpdate = false,
  transactionId = null,
}) {
  const parsedDriverUserId = Number(driverUserId);
  if (!Number.isInteger(parsedDriverUserId)) {
    return;
  }

  const connection = await pool.getConnection();
  try {
    const driverContext = await getDriverNotificationContextByUserId(connection, parsedDriverUserId);
    if (!driverContext) {
      return;
    }

    const message = isUpdate
      ? `An admin updated a point transaction to ${pointChange} points.`
      : pointChange >= 0
      ? `An admin added ${pointChange} points to your account.`
      : `An admin deducted ${Math.abs(pointChange)} points from your account.`;

    await notifyDriver(connection, {
      driverContext,
      actorUserId: adminUserId,
      content: message,
      category: isUpdate ? 'driver_point_transaction_update' : 'driver_point_transaction',
      preference: 'points',
      metadata: {
        pointChange,
        reason,
        ...(transactionId !== null ? { transactionId: Number(transactionId) } : {}),
      },
    });
  } finally {
    connection.release();
  }
}

function parseLimit(rawLimit) {
  const parsed = Number.parseInt(String(rawLimit ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function parseOffset(rawOffset) {
  const parsed = Number.parseInt(String(rawOffset ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function normalizeBooleanPreferenceInput(value) {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}

function normalizeUserType(rawUserType) {
  if (typeof rawUserType !== 'string') return null;
  const normalized = rawUserType.trim().toLowerCase();
  return ['driver', 'sponsor', 'admin'].includes(normalized) ? normalized : null;
}

function normalizeActiveStatus(rawActiveStatus) {
  if (rawActiveStatus === undefined || rawActiveStatus === null) {
    return 'all';
  }

  const normalized = String(rawActiveStatus).trim().toLowerCase();
  if (normalized === '0' || normalized === '1' || normalized === 'all') {
    return normalized;
  }

  return 'all';
}

function normalizeUserForSession(user) {
  return {
    UserID: Number(user.UserID),
    UserType: user.UserType,
    Username: user.Username,
    FirstName: user.FirstName ?? null,
    LastName: user.LastName ?? null,
  };
}

async function getUserForAssume(connection, userId) {
  const [rows] = await connection.query(
    `SELECT
      u.UserID,
      u.UserType,
      u.Username,
      u.FirstName,
      u.LastName,
      u.ActiveStatus,
      u.Permissions,
      s.SponsorCompanyID AS SponsorCompanyID,
      CASE WHEN u.UserType = 'sponsor' THEN sc2.PointDollarValue ELSE NULL END AS SponsorPointDollarValue
     FROM USERS u
     LEFT JOIN SPONSORS s ON s.UserID = u.UserID
      LEFT JOIN SPONSOR_COMPANIES sc2 ON s.SponsorCompanyID = sc2.SponsorCompanyID
     WHERE u.UserID = ?
     LIMIT 1`,
    [userId]
  );

  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// GET /api/admin/users — list all users with optional pagination + filtering
// ---------------------------------------------------------------------------
router.get('/users', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const limit = parseLimit(request.query.limit);
    const offset = parseOffset(request.query.offset);
    const userType = normalizeUserType(request.query.userType);
    const activeStatus = normalizeActiveStatus(request.query.activeStatus);
    const search = typeof request.query.search === 'string' ? request.query.search.trim().slice(0, 100) : '';

    // Build dynamic query with filters
    let query = `
      SELECT
        u.UserID,
        u.Username,
        u.Email,
        u.Phone,
        u.FirstName,
        u.MiddleName,
        u.LastName,
        u.Pronouns,
        u.ProfilePicture,
        u.Bio,
        u.UserType,
        u.ActiveStatus,
        DATE_FORMAT(u.LastLogin, '%Y-%m-%d %H:%i:%s') AS LastLogin,
        DATE_FORMAT(u.LastPasswordChange, '%Y-%m-%d %H:%i:%s') AS LastPasswordChange,
        s.SponsorCompanyID AS SponsorCompanyID,
        COALESCE(d.PointBalance, 0) AS PointBalance,
        CASE WHEN u.UserType = 'sponsor' THEN sc2.PointDollarValue ELSE NULL END AS SponsorPointDollarValue,
        CASE
          WHEN u.UserType = 'driver'  THEN COALESCE(sc.CompanyName, 'Unassigned')
          WHEN u.UserType = 'sponsor' THEN COALESCE(sc2.CompanyName, 'N/A')
          WHEN u.UserType = 'admin'   THEN 'System'
        END AS AssociatedEntity
      FROM USERS u
      LEFT JOIN DRIVERS d    ON u.UserID = d.UserID
      LEFT JOIN SPONSORS s   ON u.UserID = s.UserID
      LEFT JOIN SPONSOR_COMPANIES sc  ON d.SponsorCompanyID = sc.SponsorCompanyID
      LEFT JOIN SPONSOR_COMPANIES sc2 ON s.SponsorCompanyID = sc2.SponsorCompanyID
      WHERE 1=1
    `;

    const params = [];

    // Apply filters
    if (userType) {
      query += ' AND u.UserType = ?';
      params.push(userType);
    }

    // Only apply activeStatus filter if it's a valid numeric value (0 or 1)
    // Skip filter for 'all' or undefined
    if (activeStatus !== 'all') {
      query += ' AND u.ActiveStatus = ?';
      params.push(parseInt(activeStatus));
    }

    if (search) {
      query += ' AND (u.Username LIKE ? OR u.Email LIKE ? OR u.FirstName LIKE ? OR u.LastName LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    query += ' ORDER BY u.UserID DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await connection.query(query, params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM USERS u WHERE 1=1';
    const countParams = [];

    if (userType) {
      countQuery += ' AND u.UserType = ?';
      countParams.push(userType);
    }

    // Only apply activeStatus filter if it's a valid numeric value (0 or 1)
    if (activeStatus !== 'all') {
      countQuery += ' AND u.ActiveStatus = ?';
      countParams.push(parseInt(activeStatus));
    }

    if (search) {
      countQuery += ' AND (u.Username LIKE ? OR u.Email LIKE ? OR u.FirstName LIKE ? OR u.LastName LIKE ?)';
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const countResult = await connection.query(countQuery, countParams);

    response.json({
      users: result[0],
      totalCount: countResult[0][0].total,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// GET /api/admin/users/:id
router.get('/users/:id', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const { id } = request.params;

    const query = `
      SELECT
        u.UserID,
        u.Username,
        u.Email,
        u.Phone,
        u.FirstName,
        u.MiddleName,
        u.LastName,
        u.Pronouns,
        u.ProfilePicture,
        u.Bio,
        u.UserType,
        u.ActiveStatus,
        u.Permissions,
        DATE_FORMAT(u.LastLogin, '%Y-%m-%d %H:%i:%s') AS LastLogin,
        DATE_FORMAT(u.LastPasswordChange, '%Y-%m-%d %H:%i:%s') AS LastPasswordChange,
        sp.SponsorCompanyID AS SponsorCompanyID,
        CASE WHEN u.UserType = 'driver'  THEN d.PointBalance  ELSE NULL END AS PointBalance,
        CASE
          WHEN u.UserType = 'driver'  THEN sc.CompanyName
          WHEN u.UserType = 'sponsor' THEN sc2.CompanyName
          ELSE NULL
        END AS CompanyName,
        CASE WHEN u.UserType = 'sponsor' THEN sc2.PointDollarValue ELSE NULL END AS PointDollarValue
      FROM USERS u
      LEFT JOIN DRIVERS d    ON u.UserID = d.UserID
      LEFT JOIN SPONSORS sp  ON u.UserID = sp.UserID
      LEFT JOIN SPONSOR_COMPANIES sc  ON d.SponsorCompanyID  = sc.SponsorCompanyID
      LEFT JOIN SPONSOR_COMPANIES sc2 ON sp.SponsorCompanyID = sc2.SponsorCompanyID
      WHERE u.UserID = ?
    `;

    const result = await connection.query(query, [id]);

    if (result[0].length === 0) {
      return response.status(404).json({ error: 'User not found' });
    }

    response.json(result[0][0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// POST /api/admin/users — create new user
router.post('/users', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const {
      username,
      email,
      phone,
      password,
      firstName,
      middleName,
      lastName,
      pronouns,
      profilePicture,
      bio,
      userType,
      activeStatus,
      // Driver-specific fields
      licenseNumber,
      sponsorCompanyId,
      performanceStatus,
      alertPoints,   // Boolean flag: enable point transaction notifications
      alertOrders,   // Boolean flag: enable order notifications
      alertApplicationStatusChange,
      alertApplicationEntry,
      alertProfileChangesByAdmin,
    } = request.body;

    const normalizedAlertPoints = normalizeBooleanPreferenceInput(alertPoints);
    const normalizedAlertOrders = normalizeBooleanPreferenceInput(alertOrders);
    const normalizedAlertApplicationStatusChange = normalizeBooleanPreferenceInput(alertApplicationStatusChange);
    const normalizedAlertApplicationEntry = normalizeBooleanPreferenceInput(alertApplicationEntry);
    const normalizedAlertProfileChangesByAdmin = normalizeBooleanPreferenceInput(alertProfileChangesByAdmin);

    if (
      normalizedAlertPoints === null ||
      normalizedAlertOrders === null ||
      normalizedAlertApplicationStatusChange === null ||
      normalizedAlertApplicationEntry === null ||
      normalizedAlertProfileChangesByAdmin === null
    ) {
      await connection.rollback();
      return response.status(400).json({ error: 'Notification preferences must be boolean values.' });
    }

    // Validate required fields
    if (!username || !email || !firstName || !lastName || !userType) {
      return response.status(400).json({ 
        error: 'Missing required fields: username, email, firstName, lastName, userType' 
      });
    }

    // Validate driver-specific required fields
    if (userType.toLowerCase() === 'driver') {
      if (!licenseNumber) {
        return response.status(400).json({ 
          error: 'Missing required field for driver: licenseNumber' 
        });
      }
      if (!performanceStatus) {
        return response.status(400).json({ 
          error: 'Missing required field for driver: performanceStatus' 
        });
      }
      // If sponsorCompanyId is provided, validate it exists
      if (sponsorCompanyId) {
        const [companyCheck] = await connection.query(
          'SELECT SponsorCompanyID FROM SPONSOR_COMPANIES WHERE SponsorCompanyID = ?',
          [sponsorCompanyId]
        );
        if (companyCheck.length === 0) {
          return response.status(400).json({ 
            error: 'Sponsor company not found' 
          });
        }
      }
    }

    // Validate sponsor-specific required fields
    if (userType.toLowerCase() === 'sponsor') {
      if (!sponsorCompanyId) {
        return response.status(400).json({ 
          error: 'Missing required field for sponsor: sponsorCompanyId' 
        });
      }
      // Validate that the sponsor company exists
      const [companyCheck] = await connection.query(
        'SELECT SponsorCompanyID FROM SPONSOR_COMPANIES WHERE SponsorCompanyID = ?',
        [sponsorCompanyId]
      );
      if (companyCheck.length === 0) {
        return response.status(400).json({ 
          error: 'Sponsor company not found' 
        });
      }
    }

    // Check if username or email already exists
    const checkExisting = await connection.query(
      'SELECT UserID FROM USERS WHERE Username = ? OR Email = ?',
      [username, email]
    );

    if (checkExisting[0].length > 0) {
      await connection.rollback();
      return response.status(409).json({ error: 'Username or email already exists' });
    }

    // Insert new user
    const insertQuery = `
      INSERT INTO USERS 
      (Username, Email, Phone, PassHash, FirstName, MiddleName, LastName, 
       Pronouns, ProfilePicture, Bio, UserType, ActiveStatus, LastLogin, LastPasswordChange, Permissions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)
    `;

    const passHash = await hashPassword(password || 'ChangeMe123!');
    const defaultPermissions = JSON.stringify({});
    
    const result = await connection.query(insertQuery, [
      username,
      email,
      phone || null,
      passHash,
      firstName,
      middleName || null,
      lastName,
      pronouns || null,
      profilePicture || null,
      bio || null,
      userType,
      activeStatus !== undefined ? activeStatus : 1,
      defaultPermissions
    ]);

    const newUserId = result[0].insertId;

    // Create role-specific record
    if (userType.toLowerCase() === 'admin') {
      await connection.query('INSERT INTO ADMINS (UserID) VALUES (?)', [newUserId]);
    } else if (userType.toLowerCase() === 'driver') {
      // Insert into DRIVERS table with all required fields
      await connection.query(
        `INSERT INTO DRIVERS 
         (LicenseNumber, UserID, SponsorCompanyID, PointBalance, PerformanceStatus, AlertPoints, AlertOrders) 
         VALUES (?, ?, ?, 0, ?, ?, ?)`,
        [
          licenseNumber,
          newUserId,
          sponsorCompanyId || null,
          performanceStatus || 'good',
          alertPoints !== undefined ? alertPoints : 1,  // Default: notifications enabled
          alertOrders !== undefined ? alertOrders : 1   // Default: notifications enabled
        ]
      );
    } else if (userType.toLowerCase() === 'sponsor') {
      // Insert into SPONSORS table with required fields
      await connection.query(
        'INSERT INTO SPONSORS (UserID, SponsorCompanyID) VALUES (?, ?)',
        [newUserId, sponsorCompanyId]
      );
    }

    await connection.commit();

    // Fetch and return the newly created user
    const newUserQuery = `
      SELECT
        UserID as id, UserID, Username, Email, Phone,
        FirstName, MiddleName, LastName, Pronouns,
        ProfilePicture, Bio, UserType, ActiveStatus,
        DATE_FORMAT(LastLogin, '%Y-%m-%d %H:%i:%s') AS LastLogin,
        DATE_FORMAT(LastPasswordChange, '%Y-%m-%d %H:%i:%s') AS LastPasswordChange
      FROM USERS WHERE UserID = ?
    `;

    const newUserResult = await connection.query(newUserQuery, [newUserId]);

    response.status(201).json(newUserResult[0][0]);
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error creating user:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// POST /api/admin/users/bulk-load — process pipe-delimited user uploads
router.post('/users/bulk-load', async (request, response) => {
  try {
    const payload = request.body && typeof request.body === 'object' ? request.body : {};
    const content =
      typeof payload.content === 'string'
        ? payload.content
        : typeof request.body === 'string'
        ? request.body
        : '';

    if (!content.trim()) {
      return response.status(400).json({
        error: 'Upload content is required.',
      });
    }

    const requesterUserIdRaw =
      payload.requesterUserId ?? request.sessionContext?.effectiveUser?.UserID ?? null;
    const requesterUserId = Number(requesterUserIdRaw);

    const report = await processBulkLoadFile({
      content,
      mode: 'admin',
      actorUserId: Number.isInteger(requesterUserId) ? requesterUserId : null,
    });

    return response.status(200).json(report);
  } catch (error) {
    console.error('Bulk load admin error:', error);
    return response.status(500).json({ error: 'Failed to process bulk upload.' });
  }
});

// PATCH /api/admin/users/:id — partial update
router.patch('/users/:id', handleProfileImageUpload, async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const actorUserIdRaw = request.sessionContext?.effectiveUser?.UserID;
    const actorUserId = Number.isInteger(Number(actorUserIdRaw)) ? Number(actorUserIdRaw) : null;

    const { id } = request.params;
    const {
      username,
      email,
      phone,
      password,
      firstName,
      middleName,
      lastName,
      pronouns,
      profilePicture,
      bio,
      activeStatus,
      // Driver-specific fields
      licenseNumber,
      sponsorCompanyId,
      performanceStatus,
      alertPoints,   // Boolean flag: enable point transaction notifications
      alertOrders,   // Boolean flag: enable order notifications
      alertApplicationStatusChange,
      alertApplicationEntry,
      alertProfileChangesByAdmin,
    } = request.body;
    const normalizedProfilePicture = normalizeProfilePictureValue(profilePicture, request.file);

    const normalizedAlertPoints = normalizeBooleanPreferenceInput(alertPoints);
    const normalizedAlertOrders = normalizeBooleanPreferenceInput(alertOrders);
    const normalizedAlertApplicationStatusChange =
      normalizeBooleanPreferenceInput(alertApplicationStatusChange);
    const normalizedAlertApplicationEntry =
      normalizeBooleanPreferenceInput(alertApplicationEntry);
    const normalizedAlertProfileChangesByAdmin =
      normalizeBooleanPreferenceInput(alertProfileChangesByAdmin);

    if (
      normalizedAlertPoints === null ||
      normalizedAlertOrders === null ||
      normalizedAlertApplicationStatusChange === null ||
      normalizedAlertApplicationEntry === null ||
      normalizedAlertProfileChangesByAdmin === null
    ) {
      await connection.rollback();
      return response.status(400).json({
        error: 'Notification preferences must be boolean values.',
      });
    }

    const normalizedPassword =
      typeof password === 'string' ? password.trim() : undefined;

    if (normalizedPassword !== undefined && normalizedPassword.length > 0) {
      const complexity = validatePasswordComplexity(normalizedPassword);
      if (!complexity.valid) {
        await connection.rollback();
        return response.status(400).json({ error: complexity.error });
      }
    }

    // Build dynamic update query
    const updates = [];
    const values = [];

    if (username !== undefined) {
      updates.push('Username = ?');
      values.push(username);
    }
    if (email !== undefined) {
      updates.push('Email = ?');
      values.push(email);
    }
    if (phone !== undefined) {
      updates.push('Phone = ?');
      values.push(phone);
    }
    if (firstName !== undefined) {
      updates.push('FirstName = ?');
      values.push(firstName);
    }
    if (middleName !== undefined) {
      updates.push('MiddleName = ?');
      values.push(middleName);
    }
    if (lastName !== undefined) {
      updates.push('LastName = ?');
      values.push(lastName);
    }
    if (pronouns !== undefined) {
      updates.push('Pronouns = ?');
      values.push(pronouns);
    }
    if (normalizedProfilePicture !== undefined) {
      updates.push('ProfilePicture = ?');
      values.push(normalizedProfilePicture);
    }
    if (bio !== undefined) {
      updates.push('Bio = ?');
      values.push(bio);
    }
    if (activeStatus !== undefined) {
      updates.push('ActiveStatus = ?');
      values.push(activeStatus);
    }

    // Check if there are any user table updates or role-specific updates
    const hasUserUpdates = updates.length > 0;
    const hasPasswordUpdate = normalizedPassword !== undefined && normalizedPassword.length > 0;
    const hasDriverUpdates = licenseNumber !== undefined || sponsorCompanyId !== undefined || 
                              performanceStatus !== undefined || normalizedAlertPoints !== undefined || 
                              normalizedAlertOrders !== undefined;
    const hasNotificationPreferenceUpdates =
      normalizedAlertPoints !== undefined ||
      normalizedAlertOrders !== undefined ||
      normalizedAlertApplicationStatusChange !== undefined ||
      normalizedAlertApplicationEntry !== undefined ||
      normalizedAlertProfileChangesByAdmin !== undefined;
    const profileFieldChanges = [
      username,
      email,
      phone,
      firstName,
      middleName,
      lastName,
      pronouns,
      normalizedProfilePicture,
      bio,
      activeStatus,
      licenseNumber,
      sponsorCompanyId,
      performanceStatus,
      normalizedAlertPoints,
      normalizedAlertOrders,
      normalizedAlertApplicationStatusChange,
      normalizedAlertApplicationEntry,
      normalizedAlertProfileChangesByAdmin,
    ].some((value) => value !== undefined);

    if (!hasUserUpdates && !hasDriverUpdates && !hasNotificationPreferenceUpdates && !hasPasswordUpdate) {
      return response.status(400).json({ error: 'No valid fields to update' });
    }

    // Update USERS table if there are updates
    if (hasUserUpdates) {
      values.push(id);
      const updateQuery = `UPDATE USERS SET ${updates.join(', ')} WHERE UserID = ?`;
      await connection.query(updateQuery, values);
    }

    // Get user type to determine which role-specific table to update
    const userTypeQuery = 'SELECT UserType, Permissions FROM USERS WHERE UserID = ?';
    const userTypeResult = await connection.query(userTypeQuery, [id]);
    
    if (userTypeResult[0].length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'User not found' });
    }

    const userType = userTypeResult[0][0].UserType;
    const currentPermissions = userTypeResult[0][0].Permissions;

    if (hasNotificationPreferenceUpdates) {
      const nextPermissions = normalizeNotificationPreferences(currentPermissions, {
        ...(normalizedAlertPoints !== undefined ? { alertPoints: normalizedAlertPoints } : {}),
        ...(normalizedAlertOrders !== undefined ? { alertOrders: normalizedAlertOrders } : {}),
        ...(normalizedAlertApplicationStatusChange !== undefined
          ? { alertApplicationStatusChange: normalizedAlertApplicationStatusChange }
          : {}),
        ...(normalizedAlertApplicationEntry !== undefined
          ? { alertApplicationEntry: normalizedAlertApplicationEntry }
          : {}),
        ...(normalizedAlertProfileChangesByAdmin !== undefined
          ? { alertProfileChangesByAdmin: normalizedAlertProfileChangesByAdmin }
          : {}),
      });

      await connection.query(
        'UPDATE USERS SET Permissions = ? WHERE UserID = ?',
        [JSON.stringify(nextPermissions), id]
      );
    }

    if (normalizedPassword !== undefined && normalizedPassword.length > 0) {
      const [historyRows] = await connection.query(
        `SELECT JSON_UNQUOTE(JSON_EXTRACT(Properties, '$.oldHash')) AS PassHash
         FROM EVENTS
         WHERE UserID = ? AND EventType = 'PasswordChange'
           AND JSON_EXTRACT(Properties, '$.oldHash') IS NOT NULL
         ORDER BY Timestamp DESC
         LIMIT 5`,
        [id]
      );

      const [currentHashRows] = await connection.query(
        'SELECT PassHash FROM USERS WHERE UserID = ? LIMIT 1',
        [id]
      );

      const allHashes = [
        ...currentHashRows.map((row) => row.PassHash),
        ...historyRows.map((row) => row.PassHash),
      ].filter(Boolean);

      for (const historicalHash of allHashes) {
        const isMatch = await verifyPassword(normalizedPassword, historicalHash);
        if (isMatch) {
          await connection.rollback();
          return response.status(400).json({ error: 'Cannot reuse one of the last 5 passwords.' });
        }
      }

      const oldHash = currentHashRows[0]?.PassHash ?? null;
      const newHash = await hashPassword(normalizedPassword);

      await connection.query(
        'UPDATE USERS SET PassHash = ?, LastPasswordChange = NOW() WHERE UserID = ?',
        [newHash, id]
      );

      await connection.query(
        'INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties) VALUES (?, NOW(), ?, ?)',
        [
          Number(id),
          'PasswordChange',
          JSON.stringify({
            success: true,
            changeMethod: 'admin_initiated',
            oldHash,
            actorUserId,
          }),
        ]
      );
    }

    // Update role-specific tables
    let previousSponsorCompanyId = null;
    let nextSponsorCompanyId = null;
    let driverLicenseNumber = null;
    let driverFullName = null;

    if (userType.toLowerCase() === 'driver' && hasDriverUpdates) {
      if (sponsorCompanyId !== undefined) {
        const [driverBeforeRows] = await connection.query(
          `SELECT d.SponsorCompanyID, d.LicenseNumber, u.FirstName, u.LastName
           FROM DRIVERS d
           JOIN USERS u ON u.UserID = d.UserID
           WHERE d.UserID = ?
           LIMIT 1`,
          [id]
        );

        if (driverBeforeRows.length > 0) {
          const previousCompanyRaw = driverBeforeRows[0].SponsorCompanyID;
          previousSponsorCompanyId =
            previousCompanyRaw === null ? null : Number(previousCompanyRaw);
          driverLicenseNumber = driverBeforeRows[0].LicenseNumber;
          driverFullName = `${driverBeforeRows[0].FirstName ?? ''} ${driverBeforeRows[0].LastName ?? ''}`.trim();
        }
      }

      const driverUpdates = [];
      const driverValues = [];

      if (licenseNumber !== undefined) {
        driverUpdates.push('LicenseNumber = ?');
        driverValues.push(licenseNumber);
      }
      if (sponsorCompanyId !== undefined) {
        driverUpdates.push('SponsorCompanyID = ?');
        driverValues.push(sponsorCompanyId);
      }
      if (performanceStatus !== undefined) {
        driverUpdates.push('PerformanceStatus = ?');
        driverValues.push(performanceStatus);
      }
      if (normalizedAlertPoints !== undefined) {
        driverUpdates.push('AlertPoints = ?');
        driverValues.push(normalizedAlertPoints ? 1 : 0);
      }
      if (normalizedAlertOrders !== undefined) {
        driverUpdates.push('AlertOrders = ?');
        driverValues.push(normalizedAlertOrders ? 1 : 0);
      }

      if (driverUpdates.length > 0) {
        driverValues.push(id);
        const driverUpdateQuery = `UPDATE DRIVERS SET ${driverUpdates.join(', ')} WHERE UserID = ?`;
        await connection.query(driverUpdateQuery, driverValues);
      }

      if (sponsorCompanyId !== undefined) {
        const [driverAfterRows] = await connection.query(
          'SELECT SponsorCompanyID FROM DRIVERS WHERE UserID = ? LIMIT 1',
          [id]
        );

        if (driverAfterRows.length > 0) {
          const nextCompanyRaw = driverAfterRows[0].SponsorCompanyID;
          nextSponsorCompanyId = nextCompanyRaw === null ? null : Number(nextCompanyRaw);
        }

        const companyChanged = previousSponsorCompanyId !== nextSponsorCompanyId;
        if (companyChanged && driverLicenseNumber) {
          try {
            if (Number.isInteger(previousSponsorCompanyId)) {
              await connection.query(
                `UPDATE DRIVER_COMPANY_ENROLLMENT
                 SET EnrollmentStatus = 'inactive', LeftAt = NOW()
                 WHERE DriverID = ? AND SponsorCompanyID = ? AND EnrollmentStatus = 'active'`,
                [driverLicenseNumber, previousSponsorCompanyId]
              );
            }

            if (Number.isInteger(nextSponsorCompanyId)) {
              await connection.query(
                `INSERT INTO DRIVER_COMPANY_ENROLLMENT
                  (DriverID, SponsorCompanyID, PointBalance, EnrollmentStatus, JoinedAt, LeftAt)
                 VALUES (?, ?, 0, 'active', NOW(), NULL)
                 ON DUPLICATE KEY UPDATE
                  EnrollmentStatus = 'active',
                  LeftAt = NULL`,
                [driverLicenseNumber, nextSponsorCompanyId]
              );
            }
          } catch (error) {
            if (error?.code !== 'ER_NO_SUCH_TABLE' && error?.code !== 'ER_BAD_FIELD_ERROR') {
              throw error;
            }
          }
        }

        if (companyChanged && Number.isInteger(previousSponsorCompanyId)) {
          await connection.query(
            `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
             VALUES (?, NOW(), 'AccountUpdate', JSON_OBJECT('updatedFields', JSON_ARRAY('SponsorCompanyID'), 'isSelfUpdate', false, 'success', true))`,
            [actorUserId ?? Number(id)]
          );

          await notifySponsorCompany(connection, {
            sponsorCompanyId: previousSponsorCompanyId,
            actorUserId,
            content: `Driver ${driverFullName || id} left the company.`,
            category: 'driver_left_company',
            metadata: {
              driverUserId: Number(id),
              driverId: driverLicenseNumber,
              previousSponsorCompanyId,
              nextSponsorCompanyId,
              trigger: 'admin_driver_company_change',
            },
          });

          const driverNotificationContext = await getDriverNotificationContextByUserId(
            connection,
            Number(id)
          );

          await notifyDriver(connection, {
            driverContext: driverNotificationContext,
            actorUserId,
            content: 'You were removed from your sponsor company.',
            category: 'driver_removed_from_company',
            force: true,
            preference: 'none',
            metadata: {
              driverUserId: Number(id),
              driverId: driverLicenseNumber,
              previousSponsorCompanyId,
              nextSponsorCompanyId,
              trigger: 'admin_driver_company_change',
            },
          });
        }
      }
    } else if (userType.toLowerCase() === 'sponsor' && sponsorCompanyId !== undefined) {
      // Update SPONSORS table
      await connection.query(
        'UPDATE SPONSORS SET SponsorCompanyID = ? WHERE UserID = ?',
        [sponsorCompanyId, id]
      );
    }

    // Fetch updated user
    const userQuery = `
      SELECT
        UserID, Username, Email, Phone,
        FirstName, MiddleName, LastName, Pronouns,
        ProfilePicture, Bio, UserType, ActiveStatus,
        DATE_FORMAT(LastLogin, '%Y-%m-%d %H:%i:%s') AS LastLogin,
        DATE_FORMAT(LastPasswordChange, '%Y-%m-%d %H:%i:%s') AS LastPasswordChange
      FROM USERS WHERE UserID = ?
    `;

    const result = await connection.query(userQuery, [id]);

    if (profileFieldChanges && Number.isInteger(actorUserId) && actorUserId !== Number(id)) {
      const [targetRows] = await connection.query(
        'SELECT Username, Permissions FROM USERS WHERE UserID = ? LIMIT 1',
        [id]
      );

      if (targetRows.length > 0) {
        const targetPreferences = normalizeNotificationPreferences(targetRows[0].Permissions);
        if (targetPreferences.alertProfileChangesByAdmin) {
          await insertNotificationEvent(connection, {
            recipientUserId: Number(id),
            actorUserId,
            content: 'Your profile was updated by an admin.',
            category: 'profile_changed_by_admin',
            metadata: {
              targetUserId: Number(id),
              targetUsername: targetRows[0].Username,
            },
          });
        }
      }
    }

    await connection.commit();
    response.json(result[0][0]);
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error updating user:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// DELETE /api/admin/users/:id — soft delete (ActiveStatus = 0)
router.delete('/users/:id', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const { id } = request.params;

    // Check if user exists
    const checkUser = await connection.query(
      'SELECT UserID, UserType, ActiveStatus FROM USERS WHERE UserID = ?',
      [id]
    );

    if (checkUser[0].length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'User not found' });
    }

    // Soft delete: set ActiveStatus to 0 instead of deleting
    await connection.query(
      'UPDATE USERS SET ActiveStatus = 0 WHERE UserID = ?',
      [id]
    );

    await connection.query(
      `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
       VALUES (?, NOW(), 'AccountStatusChange', JSON_OBJECT('newStatus', false, 'targetUserId', ?, 'adminNotes', 'admin_deactivate'))`,
      [Number(id), Number(id)]
    );

    await connection.commit();
    response.status(204).send();
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error deleting user:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// POST /api/admin/assume-driver/:targetUserId
router.post('/assume-driver/:targetUserId', async (request, response) => {
  let connection;
  try {
    const requesterUserId = Number(request.body?.requesterUserId);
    const targetUserId = Number(request.params.targetUserId);

    if (!Number.isInteger(requesterUserId) || !Number.isInteger(targetUserId)) {
      return response.status(400).json({
        success: false,
        error: 'requesterUserId and targetUserId must be valid integers.',
      });
    }

    connection = await pool.getConnection();

    const requester = await getUserForAssume(connection, requesterUserId);
    if (!requester || requester.UserType !== 'admin') {
      return response.status(403).json({ success: false, error: 'Only admins can assume driver view.' });
    }

    if (!Boolean(requester.ActiveStatus)) {
      return response.status(403).json({ success: false, error: 'Inactive accounts cannot assume another view.' });
    }

    if (!hasBooleanPermission(requester.UserType, requester.Permissions, 'canAssumeDriverView')) {
      return response.status(403).json({ success: false, error: 'Missing canAssumeDriverView permission.' });
    }

    const targetUser = await getUserForAssume(connection, targetUserId);
    if (!targetUser || targetUser.UserType !== 'driver') {
      return response.status(404).json({ success: false, error: 'Driver target not found.' });
    }

    if (!Boolean(targetUser.ActiveStatus)) {
      return response.status(409).json({ success: false, error: 'Cannot assume an inactive driver account.' });
    }

    await connection.query(
      `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
       VALUES (?, NOW(), 'AccountUpdate', JSON_OBJECT('updatedFields', JSON_ARRAY('assumedView:driver'), 'isSelfUpdate', false, 'success', true))`,
      [requesterUserId]
    );

    return response.json({
      success: true,
      assumedUser: normalizeUserForSession(targetUser),
    });
  } catch (error) {
    console.error('Assume driver error:', error);
    return response.status(500).json({ success: false, error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// POST /api/admin/assume-sponsor/:targetUserId
router.post('/assume-sponsor/:targetUserId', async (request, response) => {
  let connection;
  try {
    const requesterUserId = Number(request.body?.requesterUserId);
    const targetUserId = Number(request.params.targetUserId);

    if (!Number.isInteger(requesterUserId) || !Number.isInteger(targetUserId)) {
      return response.status(400).json({
        success: false,
        error: 'requesterUserId and targetUserId must be valid integers.',
      });
    }

    connection = await pool.getConnection();

    const requester = await getUserForAssume(connection, requesterUserId);
    if (!requester || requester.UserType !== 'admin') {
      return response.status(403).json({ success: false, error: 'Only admins can assume sponsor view.' });
    }

    if (!Boolean(requester.ActiveStatus)) {
      return response.status(403).json({ success: false, error: 'Inactive accounts cannot assume another view.' });
    }

    if (!hasBooleanPermission(requester.UserType, requester.Permissions, 'canAssumeSponsorView')) {
      return response.status(403).json({ success: false, error: 'Missing canAssumeSponsorView permission.' });
    }

    const targetUser = await getUserForAssume(connection, targetUserId);
    if (!targetUser || targetUser.UserType !== 'sponsor') {
      return response.status(404).json({ success: false, error: 'Sponsor target not found.' });
    }

    if (!targetUser.SponsorCompanyID) {
      return response.status(409).json({
        success: false,
        error: 'Sponsor target is missing sponsor-company linkage.',
      });
    }

    if (!Boolean(targetUser.ActiveStatus)) {
      return response.status(409).json({ success: false, error: 'Cannot assume an inactive sponsor account.' });
    }

    await connection.query(
      `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
       VALUES (?, NOW(), 'AccountUpdate', JSON_OBJECT('updatedFields', JSON_ARRAY('assumedView:sponsor'), 'isSelfUpdate', false, 'success', true))`,
      [requesterUserId]
    );

    return response.json({
      success: true,
      assumedUser: normalizeUserForSession(targetUser),
    });
  } catch (error) {
    console.error('Assume sponsor error:', error);
    return response.status(500).json({ success: false, error: 'Internal Server Error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// ---------------------------------------------------------------------------
// PUT /api/admin/users/:id — full field update (used by edit.tsx)
// ---------------------------------------------------------------------------
router.put('/users/:id', async (request, response) => {
  try {
    const result = await updateUser(Number(request.params.id), request.body);
    return response.json({ success: true, result });
  } catch (err) {
    console.error('PUT /admin/users/:id error:', err);
    return response.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/admin/point-transactions
// ---------------------------------------------------------------------------
router.get('/point-transactions', async (req, res) => {
  try {
    const transactions = await getAllPointTransactions();
    return res.json(transactions);
  } catch (err) {
    console.error('GET /admin/point-transactions error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/point-transactions/:transactionId
// Body: { newPoints, newReason, adminUserId }
router.put('/point-transactions/:transactionId', async (req, res) => {
  const { newPoints, newReason, adminUserId } = req.body ?? {};
  try {
    await updatePointTransaction(Number(req.params.transactionId), newPoints, newReason, adminUserId);
    const history = await getAllPointTransactions();
    const updatedTransaction = history.find(
      (row) => Number(row.TransactionID) === Number(req.params.transactionId)
    );

    if (updatedTransaction && Number.isInteger(Number(updatedTransaction.DriverUserID))) {
      await sendAdminPointChangeNotification({
        driverUserId: Number(updatedTransaction.DriverUserID),
        adminUserId: adminUserId ?? null,
        pointChange: Number(newPoints),
        reason: String(newReason ?? ''),
        isUpdate: true,
        transactionId: Number(req.params.transactionId),
      });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('PUT /admin/point-transactions/:transactionId error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Per-driver points
// ---------------------------------------------------------------------------

// GET /api/admin/users/:userId/points
router.get('/users/:userId/points', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const driver = await getDriverPoints(userId);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    const history = await getPointHistory(userId);
    return res.json({ driver, history });
  } catch (err) {
    console.error('GET /admin/users/:userId/points error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/users/:userId/points
// Body: { pointChange, reason, adminUserId }
router.post('/users/:userId/points', async (req, res) => {
  const { pointChange, reason, adminUserId } = req.body ?? {};

  if (reason === undefined || reason === null || String(reason).trim().length === 0) {
    return res.status(400).json({ error: 'Missing required field: reason' });
  }

  if (String(reason).length > 45) {
    return res.status(400).json({ error: 'Reason exceeds 45 characters' });
  }

  if (typeof pointChange !== 'number' || Number.isNaN(pointChange)) {
    return res.status(400).json({ error: 'pointChange must be a number' });
  }

  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const existingDriver = await getDriverPoints(userId);
    if (!existingDriver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    await addPointTransaction(userId, adminUserId ?? null, pointChange, reason);
    await sendAdminPointChangeNotification({
      driverUserId: userId,
      adminUserId: adminUserId ?? null,
      pointChange,
      reason: String(reason),
      isUpdate: false,
    });

    const driver = await getDriverPoints(userId);
    const history = await getPointHistory(userId);

    return res.status(201).json({
      message: 'Points added',
      driver,
      history,
    });
  } catch (err) {
    console.error('POST /admin/users/:userId/points error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:userId/points/:transactionId
// Body: { pointChange, reason, adminUserId }
router.patch('/users/:userId/points/:transactionId', async (req, res) => {
  const { pointChange, reason, adminUserId } = req.body ?? {};

  if (reason === undefined || reason === null || String(reason).trim().length === 0) {
    return res.status(400).json({ error: 'Missing required field: reason' });
  }

  if (String(reason).length > 45) {
    return res.status(400).json({ error: 'Reason exceeds 45 characters' });
  }

  if (typeof pointChange !== 'number' || Number.isNaN(pointChange)) {
    return res.status(400).json({ error: 'pointChange must be a number' });
  }

  try {
    const userId = Number(req.params.userId);
    const transactionId = Number(req.params.transactionId);

    if (!Number.isInteger(userId) || !Number.isInteger(transactionId)) {
      return res.status(400).json({ error: 'Invalid userId or transactionId' });
    }

    const existingDriver = await getDriverPoints(userId);
    if (!existingDriver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    await updatePointTransaction(transactionId, pointChange, reason, adminUserId ?? null);
    await sendAdminPointChangeNotification({
      driverUserId: userId,
      adminUserId: adminUserId ?? null,
      pointChange,
      reason: String(reason),
      isUpdate: true,
      transactionId,
    });

    const driver = await getDriverPoints(userId);
    const history = await getPointHistory(userId);

    return res.json({
      message: 'Transaction updated',
      driver,
      history,
    });
  } catch (err) {
    console.error('PATCH /admin/users/:userId/points/:transactionId error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/drivers/:driverUserId/points
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

// GET /api/admin/drivers/:driverUserId/point-history
router.get('/drivers/:driverUserId/point-history', async (req, res) => {
  try {
    const history = await getPointHistory(Number(req.params.driverUserId));
    return res.json(history);
  } catch (err) {
    console.error('GET /admin/drivers/:driverUserId/point-history error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/drivers/:driverUserId/point-transactions
// Body: { pointChange, reason, adminUserId }
router.post('/drivers/:driverUserId/point-transactions', async (req, res) => {
  const { pointChange, reason, adminUserId } = req.body ?? {};
  try {
    const driverUserId = Number(req.params.driverUserId);
    await addPointTransaction(driverUserId, adminUserId, pointChange, reason);
    await sendAdminPointChangeNotification({
      driverUserId,
      adminUserId: adminUserId ?? null,
      pointChange: Number(pointChange),
      reason: String(reason ?? ''),
      isUpdate: false,
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('POST /admin/drivers/:driverUserId/point-transactions error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Additional admin utilities (ported from Kyle's sprint)
// ---------------------------------------------------------------------------

// POST /api/admin/add-points/:licenseNumber
router.post('/add-points/:licenseNumber', async (req, res) => {
  const { licenseNumber } = req.params;
  const { amount, reason, adminId } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      'UPDATE DRIVERS SET PointBalance = PointBalance + ? WHERE LicenseNumber = ?',
      [amount, licenseNumber]
    );

    await connection.execute(
      `INSERT INTO POINT_TRANSACTIONS
       (DriverID, UserChanged, PointChange, ReasonForChange, TimeChanged)
       VALUES (?, ?, ?, ?, NOW())`,
      [licenseNumber, adminId, amount, reason]
    );

    const driverNotificationContext = await getDriverNotificationContextByLicense(connection, licenseNumber);
    await notifyDriver(connection, {
      driverContext: driverNotificationContext,
      actorUserId: adminId ?? null,
      content:
        Number(amount) >= 0
          ? `An admin added ${Number(amount)} points to your account.`
          : `An admin deducted ${Math.abs(Number(amount))} points from your account.`,
      category: 'driver_point_transaction',
      preference: 'points',
      metadata: {
        pointChange: Number(amount),
        reason: String(reason ?? ''),
      },
    });

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// GET /api/admin/users-with-points
router.get('/users-with-points', async (req, res) => {
  try {
    const query = `
      SELECT
        u.UserID,
        u.Username,
        u.FirstName,
        u.LastName,
        u.UserType,
        u.ActiveStatus,
        d.PointBalance,
        d.LicenseNumber
      FROM USERS u
      LEFT JOIN DRIVERS d ON u.UserID = d.UserID
    `;

    const [rows] = await pool.execute(query);
    res.json(rows);
  } catch (error) {
    console.error('Database Error:', error);
    res.status(500).json({ error: 'Failed to fetch users with points' });
  }
});

// GET /api/admin/audit-reports
router.get('/audit-reports', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
        p.PointChange,
        p.ReasonForChange,
        DATE_FORMAT(p.TimeChanged, '%Y-%m-%d %H:%i:%s') AS TimeChanged,
        u.FirstName AS DriverFirstName,
        u.LastName AS DriverLastName,
        admin.FirstName AS AdminFirstName
       FROM POINT_TRANSACTIONS p
       JOIN DRIVERS d ON p.DriverID = d.LicenseNumber
       JOIN USERS u ON d.UserID = u.UserID
       JOIN USERS admin ON p.UserChanged = admin.UserID
       WHERE p.TimeChanged IS NOT NULL
         AND p.TimeChanged >= '2000-01-01 00:00:00'
       ORDER BY p.TimeChanged DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Audit Report Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/add-driver
router.post('/add-driver', async (req, res) => {
  const { firstName, lastName, email, password, licenseNumber } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const username = email;
    const passHash = await hashPassword(password || 'ChangeMe123!');
    const permissions = JSON.stringify({});

    const [userResult] = await connection.execute(
      `INSERT INTO USERS 
      (Username, FirstName, LastName, Email, PassHash, UserType, ActiveStatus, LastLogin, LastPasswordChange, Permissions) 
      VALUES (?, ?, ?, ?, ?, 'driver', 0, NOW(), NOW(), ?)`, // Changed status to 0 for 'Pending'
      [username, firstName, lastName, email, passHash, permissions]
    );

    const newUserId = userResult.insertId;

    await connection.execute(
      'INSERT INTO DRIVERS (UserID, LicenseNumber, PointBalance, PerformanceStatus, AlertPoints, AlertOrders) VALUES (?, ?, 0, ?, 1, 1)',
      [newUserId, licenseNumber, 'good']
    );

    await connection.commit();
    res.status(201).json({ message: 'Driver created successfully', userId: newUserId });
  } catch (error) {
    await connection.rollback();
    console.error('Add Driver Error:', error);
    res.status(500).json({ error: 'Failed to create driver. License or Email might already exist.' });
  } finally {
    connection.release();
  }
});

// POST /api/admin/add-sponsor
router.post('/add-sponsor', async (req, res) => {
  const { firstName, lastName, email, password, sponsorCompanyId } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const username = email;
    const passHash = await hashPassword(password || 'ChangeMe123!');
    const permissions = JSON.stringify({});

    const [userResult] = await connection.execute(
      `INSERT INTO USERS
       (Username, FirstName, LastName, Email, PassHash, UserType, ActiveStatus, LastLogin, LastPasswordChange, Permissions)
       VALUES (?, ?, ?, ?, ?, 'sponsor', 1, NOW(), NOW(), ?)`,
      [username, firstName, lastName, email, passHash, permissions]
    );

    const newUserId = userResult.insertId;

    await connection.execute(
      'INSERT INTO SPONSORS (UserID, SponsorCompanyID) VALUES (?, ?)',
      [newUserId, sponsorCompanyId]
    );

    await connection.commit();
    res.status(201).json({ message: 'Sponsor created successfully', userId: newUserId });
  } catch (error) {
    await connection.rollback();
    console.error('Add Sponsor Error:', error);
    res.status(500).json({ error: 'Failed to create sponsor. Email may already be in use.' });
  } finally {
    connection.release();
  }
});

// PUT /api/admin/reactivate-driver/:id
router.put('/reactivate-driver/:id', async (req, res) => {
  const driverId = req.params.id;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(
      'UPDATE USERS SET ActiveStatus = 1 WHERE UserID = ? AND UserType = "driver"',
      [driverId]
    );

    if (result.affectedRows === 0) {
      throw new Error('User not found');
    }

    await connection.execute(
      `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
       VALUES (?, NOW(), 'AccountStatusChange', JSON_OBJECT('newStatus', true, 'targetUserId', ?, 'adminNotes', 'reactivate-driver'))`,
      [driverId, driverId]
    );

    await connection.commit();
    res.json({ message: 'Driver account has been reactivated successfully.' });
  } catch (error) {
    await connection.rollback();
    console.error('Reactivation Error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// PUT /api/admin/reactivate-sponsor/:id
router.put('/reactivate-sponsor/:id', async (req, res) => {
  const sponsorId = req.params.id;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [result] = await connection.execute(
      'UPDATE USERS SET ActiveStatus = 1 WHERE UserID = ? AND UserType = "sponsor"',
      [sponsorId]
    );

    if (result.affectedRows === 0) {
      throw new Error('Sponsor not found or UserID is not a sponsor type.');
    }

    await connection.execute(
      `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
       VALUES (?, NOW(), 'AccountStatusChange', JSON_OBJECT('newStatus', true, 'targetUserId', ?, 'adminNotes', 'reactivate-sponsor'))`,
      [sponsorId, sponsorId]
    );

    await connection.commit();
    res.json({ message: 'Sponsor access has been restored.' });
  } catch (error) {
    await connection.rollback();
    console.error('Sponsor Reactivation Error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

export default router;
