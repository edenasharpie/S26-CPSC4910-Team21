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
import { hashPassword, hasBooleanPermission } from '../utils/auth.js';

const router = Router();
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

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
      s.SponsorCompanyID
     FROM USERS u
     LEFT JOIN SPONSORS s ON s.UserID = u.UserID
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
        COALESCE(d.PointBalance, 0) AS PointBalance,
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
      alertOrders    // Boolean flag: enable order notifications
    } = request.body;

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

// PATCH /api/admin/users/:id — partial update
router.patch('/users/:id', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const { id } = request.params;
    const {
      username,
      email,
      phone,
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
      alertOrders    // Boolean flag: enable order notifications
    } = request.body;

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
    if (profilePicture !== undefined) {
      updates.push('ProfilePicture = ?');
      values.push(profilePicture);
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
    const hasDriverUpdates = licenseNumber !== undefined || sponsorCompanyId !== undefined || 
                              performanceStatus !== undefined || alertPoints !== undefined || 
                              alertOrders !== undefined;

    if (!hasUserUpdates && !hasDriverUpdates) {
      return response.status(400).json({ error: 'No valid fields to update' });
    }

    // Update USERS table if there are updates
    if (hasUserUpdates) {
      values.push(id);
      const updateQuery = `UPDATE USERS SET ${updates.join(', ')} WHERE UserID = ?`;
      await connection.query(updateQuery, values);
    }

    // Get user type to determine which role-specific table to update
    const userTypeQuery = 'SELECT UserType FROM USERS WHERE UserID = ?';
    const userTypeResult = await connection.query(userTypeQuery, [id]);
    
    if (userTypeResult[0].length === 0) {
      await connection.rollback();
      return response.status(404).json({ error: 'User not found' });
    }

    const userType = userTypeResult[0][0].UserType;

    // Update role-specific tables
    if (userType.toLowerCase() === 'driver' && hasDriverUpdates) {
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
      if (alertPoints !== undefined) {
        driverUpdates.push('AlertPoints = ?');
        driverValues.push(alertPoints);
      }
      if (alertOrders !== undefined) {
        driverUpdates.push('AlertOrders = ?');
        driverValues.push(alertOrders);
      }

      if (driverUpdates.length > 0) {
        driverValues.push(id);
        const driverUpdateQuery = `UPDATE DRIVERS SET ${driverUpdates.join(', ')} WHERE UserID = ?`;
        await connection.query(driverUpdateQuery, driverValues);
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
    await addPointTransaction(Number(req.params.driverUserId), adminUserId, pointChange, reason);
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
