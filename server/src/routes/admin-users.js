import express from 'express';
import { pool, getDriverPoints, getPointHistory, addPointTransaction, updatePointTransaction } from '../db.js';

const router = express.Router();

// GET /users - List all users with pagination and filtering
router.get('/', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const limit = parseInt(request.query.limit) || 10;
    const offset = parseInt(request.query.offset) || 0;
    const userType = request.query.userType; // filter by 'driver', 'sponsor', or 'admin'
    const activeStatus = request.query.activeStatus; // filter by '0' or '1'
    const search = request.query.search; // search by username, email, first name, or last name

    // Build dynamic query with filters
    let query = `
      SELECT 
        u.UserID as id,
        u.Username as username,
        u.Email as email,
        u.Phone as phone,
        u.FirstName as firstName,
        u.MiddleName as middleName,
        u.LastName as lastName,
        u.Pronouns as pronouns,
        u.ProfilePicture as profilePicture,
        u.Bio as bio,
        u.UserType as accountType,
        u.ActiveStatus as activeStatus,
        DATE_FORMAT(u.LastLogin, '%Y-%m-%d %H:%i:%s') as lastLogin,
        DATE_FORMAT(u.LastPasswordChange, '%Y-%m-%d %H:%i:%s') as lastPasswordChange,
        CASE
          WHEN u.UserType = 'driver' THEN COALESCE(sc.CompanyName, 'Unassigned')
          WHEN u.UserType = 'sponsor' THEN COALESCE(sc.CompanyName, 'N/A')
          WHEN u.UserType = 'admin' THEN 'System'
        END as associatedEntity
      FROM USERS u
      LEFT JOIN DRIVERS d ON u.UserID = d.UserID
      LEFT JOIN SPONSORS s ON u.UserID = s.UserID
      LEFT JOIN SPONSOR_COMPANIES sc ON d.SponsorCompanyID = sc.SponsorCompanyID OR s.SponsorCompanyID = sc.SponsorCompanyID
      WHERE 1=1
    `;

    const params = [];

    // Apply filters
    if (userType) {
      query += ' AND u.UserType = ?';
      params.push(userType);
    }

    if (activeStatus !== undefined) {
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

    if (activeStatus !== undefined) {
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
      limit: limit,
      offset: offset
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

// GET /users/:id - Get single user by ID
router.get('/:id', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();

    const { id } = request.params;

    const query = `
      SELECT 
        u.UserID as id,
        u.Username as username,
        u.Email as email,
        u.Phone as phone,
        u.FirstName as firstName,
        u.MiddleName as middleName,
        u.LastName as lastName,
        u.Pronouns as pronouns,
        u.ProfilePicture as profilePicture,
        u.Bio as bio,
        u.UserType as accountType,
        u.ActiveStatus as activeStatus,
        DATE_FORMAT(u.LastLogin, '%Y-%m-%d %H:%i:%s') as lastLogin,
        DATE_FORMAT(u.LastPasswordChange, '%Y-%m-%d %H:%i:%s') as lastPasswordChange,
        u.Permissions as permissions,
        CASE
          WHEN u.UserType = 'driver' THEN d.PointBalance
          ELSE NULL
        END as pointBalance,
        CASE
          WHEN u.UserType = 'driver' THEN sc.CompanyName
          WHEN u.UserType = 'sponsor' THEN sc.CompanyName
          ELSE NULL
        END as companyName,
        CASE
          WHEN u.UserType = 'sponsor' THEN sco.PointDollarValue
          ELSE NULL
        END as pointDollarValue
      FROM USERS u
      LEFT JOIN DRIVERS d ON u.UserID = d.UserID
      LEFT JOIN SPONSORS sp ON u.UserID = sp.UserID
      LEFT JOIN SPONSOR_COMPANIES sc ON d.SponsorCompanyID = sc.SponsorCompanyID
      LEFT JOIN SPONSOR_COMPANIES sco ON sp.SponsorCompanyID = sco.SponsorCompanyID
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

// POST /users - Create new user
router.post('/', async (request, response) => {
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
    }

    // Validate sponsor-specific required fields
    if (userType.toLowerCase() === 'sponsor') {
      if (!sponsorCompanyId) {
        return response.status(400).json({ 
          error: 'Missing required field for sponsor: sponsorCompanyId' 
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

    const defaultPassword = password || 'ChangeMe123!'; // Default password if none provided
    const defaultPermissions = JSON.stringify({});
    
    const result = await connection.query(insertQuery, [
      username,
      email,
      phone || null,
      defaultPassword, // TODO: should be hashed
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
        UserID as id,
        Username as username,
        Email as email,
        Phone as phone,
        FirstName as firstName,
        MiddleName as middleName,
        LastName as lastName,
        Pronouns as pronouns,
        ProfilePicture as profilePicture,
        Bio as bio,
        UserType as accountType,
        ActiveStatus as activeStatus,
        DATE_FORMAT(LastLogin, '%Y-%m-%d %H:%i:%s') as lastLogin,
        DATE_FORMAT(LastPasswordChange, '%Y-%m-%d %H:%i:%s') as lastPasswordChange
      FROM USERS
      WHERE UserID = ?
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

// PATCH /users/:id - Update user profile
router.patch('/:id', async (request, response) => {
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
        UserID as id,
        Username as username,
        Email as email,
        Phone as phone,
        FirstName as firstName,
        MiddleName as middleName,
        LastName as lastName,
        Pronouns as pronouns,
        ProfilePicture as profilePicture,
        Bio as bio,
        UserType as accountType,
        ActiveStatus as activeStatus,
        DATE_FORMAT(LastLogin, '%Y-%m-%d %H:%i:%s') as lastLogin,
        DATE_FORMAT(LastPasswordChange, '%Y-%m-%d %H:%i:%s') as lastPasswordChange
      FROM USERS
      WHERE UserID = ?
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

// DELETE /users/:id - Soft delete user (set ActiveStatus = 0)
router.delete('/:id', async (request, response) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const { id } = request.params;

    // Check if user exists
    const checkUser = await connection.query(
      'SELECT UserID, ActiveStatus FROM USERS WHERE UserID = ?',
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

// GET /users/:id/points - Get driver points and transaction history
router.get('/:id/points', async (request, response) => {
  try {
    const { id } = request.params;
    const userId = parseInt(id);

    // Fetch driver points and transaction history in parallel
    const [driver, history] = await Promise.all([
      getDriverPoints(userId),
      getPointHistory(userId)
    ]);

    if (!driver) {
      return response.status(404).json({ error: 'Driver not found' });
    }

    response.json({
      driver,
      history
    });
  } catch (error) {
    console.error('Error fetching driver points:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /users/:id/points - Add point transaction
router.post('/:id/points', async (request, response) => {
  try {
    const { id } = request.params;
    const driverUserId = parseInt(id);
    const { pointChange, reason, adminUserId } = request.body;

    // Validate required fields
    if (pointChange === undefined || !reason) {
      return response.status(400).json({ 
        error: 'Missing required fields: pointChange, reason' 
      });
    }

    // Validate reason length (database limit is 45 chars)
    if (reason.length > 45) {
      return response.status(400).json({ 
        error: 'Reason must be 45 characters or less' 
      });
    }

    // TODO: Get adminUserId from session/auth instead of request body
    const adminId = adminUserId || 1; // Default to 1 for now

    await addPointTransaction(driverUserId, adminId, pointChange, reason);

    // Fetch updated driver info and history
    const [driver, history] = await Promise.all([
      getDriverPoints(driverUserId),
      getPointHistory(driverUserId)
    ]);

    response.status(201).json({
      message: 'Point transaction added successfully',
      driver,
      history
    });
  } catch (error) {
    console.error('Error adding point transaction:', error);
    response.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// PATCH /users/:id/points/:transactionId - Update point transaction
router.patch('/:id/points/:transactionId', async (request, response) => {
  try {
    const { id, transactionId } = request.params;
    const driverUserId = parseInt(id);
    const transId = parseInt(transactionId);
    const { pointChange, reason, adminUserId } = request.body;

    // Validate required fields
    if (pointChange === undefined || !reason) {
      return response.status(400).json({ 
        error: 'Missing required fields: pointChange, reason' 
      });
    }

    // Validate reason length (database limit is 45 chars)
    if (reason.length > 45) {
      return response.status(400).json({ 
        error: 'Reason must be 45 characters or less' 
      });
    }

    // TODO: Get adminUserId from session/auth instead of request body
    const adminId = adminUserId || 1; // Default to 1 for now

    await updatePointTransaction(transId, pointChange, reason, adminId);

    // Fetch updated driver info and history
    const [driver, history] = await Promise.all([
      getDriverPoints(driverUserId),
      getPointHistory(driverUserId)
    ]);

    response.json({
      message: 'Point transaction updated successfully',
      driver,
      history
    });
  } catch (error) {
    console.error('Error updating point transaction:', error);
    response.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

export default router;
