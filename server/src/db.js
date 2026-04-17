import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';


// Error checking for .fs-env connection and db connection
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../../.fs-env');
console.log('Looking for .fs-env at:', envPath);
const result = dotenv.config({ path: envPath });
if (result.error) {
  throw new Error(`Error loading .fs-env file at ${envPath}: ${result.error.message}`);
} else {
  console.log('Environment variables loaded successfully');
}
if (typeof window !== 'undefined') {
  throw new Error("DB.JS IS RUNNING IN THE BROWSER! THIS IS THE PROBLEM.");
}

const requiredDbEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingDbEnvVars = requiredDbEnvVars.filter((name) => !process.env[name]);
if (missingDbEnvVars.length > 0) {
  throw new Error(`Missing required DB environment variables: ${missingDbEnvVars.join(', ')}`);
}

// Connection pool to SQL
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'MISSING_HOST',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

let cachedSystemAuditUserId = null;

function parsePermissions(rawPermissions) {
  if (!rawPermissions) return {};
  if (typeof rawPermissions === 'object') return rawPermissions;

  try {
    const parsed = JSON.parse(rawPermissions);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function validateSystemAuditAccount(row) {
  if (!row) {
    throw new Error('Missing system audit account row.');
  }

  if (Number(row.ActiveStatus) !== 0) {
    throw new Error('System audit account must be inactive (ActiveStatus = 0).');
  }

  const permissions = parsePermissions(row.Permissions);
  if (permissions.canLogin === true) {
    throw new Error('System audit account cannot have Permissions.canLogin = true.');
  }
}

export async function initializeSystemAuditUserCache() {
  const [rows] = await pool.execute(
    'SELECT UserID, ActiveStatus, Permissions FROM USERS WHERE IsSystemAccount = 1'
  );

  if (rows.length !== 1) {
    throw new Error(`Expected exactly one system account (IsSystemAccount = 1), found ${rows.length}.`);
  }

  const row = rows[0];
  validateSystemAuditAccount(row);

  const parsedUserId = Number(row.UserID);
  if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
    throw new Error(`Invalid system audit UserID resolved from USERS: ${row.UserID}`);
  }

  cachedSystemAuditUserId = parsedUserId;
  return cachedSystemAuditUserId;
}

export function getCachedSystemAuditUserId() {
  return cachedSystemAuditUserId;
}

export async function resolveAuditActorUserId(userId) {
  if (userId !== null && userId !== undefined) {
    return Number(userId);
  }

  if (!cachedSystemAuditUserId) {
    throw new Error('System audit UserID cache is not initialized.');
  }

  return cachedSystemAuditUserId;
}

// Error handling for the connection pool
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
    console.log('Database connection was closed or reset. Pool will manage reconnection.');
  }
});

export const verifyDatabaseConnection = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
};

export const query = async (sql, params) => {
  try {
    const [rows] = await pool.execute(sql, params);
    return { rows };
  } catch (error) {
    console.error("Database Query Error:", error.message);
    throw error;
  }
};

// Getting specific user by ID 
export const getUserById = async (id) => {
  const [rows] = await pool.execute(
    `SELECT *, 
      DATE_FORMAT(LastLogin, '%Y-%m-%d %H:%i:%s') as LastLogin, 
      DATE_FORMAT(LastPasswordChange, '%Y-%m-%d %H:%i:%s') as LastPasswordChange 
      FROM USERS WHERE UserID = ?`, 
    [id]
  );
  return rows[0];
};

// Getting all users
export async function getAllUsers() {
  const [rows] = await pool.execute(`
    SELECT 
      u.*, 
      COALESCE(d.PointBalance, 0) AS TotalPoints 
    FROM USERS u
    LEFT JOIN DRIVERS d ON u.UserID = d.UserID
  `);
  return rows;
} 

// Getting drivers by sponsor company
export async function getDriversBySponsor(companyId) {
  const [rows] = await pool.execute(`
    SELECT 
      u.*, 
      d.PointBalance AS TotalPoints,
      d.LicenseNumber,
      d.SponsorCompanyID
    FROM USERS u
    JOIN DRIVERS d ON u.UserID = d.UserID
    WHERE d.SponsorCompanyID = ? AND u.UserType = 'Driver'
  `, [companyId]);
  return rows;
}

/**
 * Creating new user action
 * Updated to handle Email, Phone, PassHash, and Driver/Admin specific table inserts.
 */
export async function createUser(userData) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Insert into USERS table
    const [userResult] = await connection.execute(
      `INSERT INTO USERS (Username, Email, Phone, PassHash, FirstName, LastName, UserType, ActiveStatus) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userData.Username,
        userData.Email || null,
        userData.Phone || null,
        userData.PassHash, // Ensure this is hashed before calling this function
        userData.FirstName,
        userData.LastName,
        userData.UserType,
        userData.ActiveStatus !== undefined ? userData.ActiveStatus : 1
      ]
    );

    const newUserId = userResult.insertId;

    // 2. Insert into Role-Specific Tables
    const type = userData.UserType?.toLowerCase();

    if (type === "admin") {
      await connection.execute(`INSERT INTO ADMINS (UserID) VALUES (?)`, [newUserId]);
    } 
    else if (type === "driver") {
      await connection.execute(
        `INSERT INTO DRIVERS (UserID, LicenseNumber, PointBalance, PerformanceStatus) 
         VALUES (?, ?, 0, 'Good')`,
        [newUserId, userData.LicenseNumber]
      );
    }

    await connection.commit();
    return { success: true, userId: newUserId };

  } catch (error) {
    await connection.rollback();
    console.error("DATABASE ERROR:", error.sqlMessage || error.message);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Specifically for the apply.tsx flow
 * Creates a Sponsor user with ActiveStatus = 0
 */
export async function applySponsor(applicationData) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Create the User (Inactive)
    const [userResult] = await connection.execute(
      `INSERT INTO USERS (Username, Email, PassHash, FirstName, LastName, UserType, ActiveStatus, Bio) 
       VALUES (?, ?, ?, ?, ?, 'Sponsor', 0, ?)`,
      [
        applicationData.Username,
        applicationData.Email,
        applicationData.PassHash,
        applicationData.FirstName,
        applicationData.LastName,
        applicationData.Reason || 'New Application'
      ]
    );

    const newUserId = userResult.insertId;

    // 2. Create the Sponsor entry (Pending)
    await connection.execute(
      `INSERT INTO SPONSORS (UserID, CompanyName, Description, Status) 
       VALUES (?, ?, ?, 'Pending')`,
      [
        newUserId, 
        applicationData.CompanyName, 
        applicationData.Reason || null
      ]
    );

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    console.error("SPONSOR APPLICATION ERROR:", error.message);
    throw error;
  } finally {
    connection.release();
  }
}

// Update user in the DB 
export async function updateUser(id, updates) {
  const fields = [];
  const values = [];

  const allowedFields = {
    Username: 'Username',
    Email: 'Email',
    Phone: 'Phone',
    PassHash: 'PassHash',
    FirstName: 'FirstName',
    MiddleName: 'MiddleName',
    LastName: 'LastName',
    Pronouns: 'Pronouns',
    ProfilePicture: 'ProfilePicture',
    Bio: 'Bio',
    UserType: 'UserType',
    ActiveStatus: 'ActiveStatus'
  };

  for (const [key, dbColumn] of Object.entries(allowedFields)) {
    if (updates[key] !== undefined) {
      if (key === 'PassHash') {
        const passHash = updates[key];
        if (passHash && typeof passHash === 'string' && passHash.length > 0) {
          if (!passHash.includes(':')) {
            throw new Error('Invalid password hash format: must be in salt:hash format');
          }
          fields.push(`${dbColumn} = ?`);
          values.push(passHash);
        }
      } else {
        fields.push(`${dbColumn} = ?`);
        values.push(updates[key]);
      }
    }
  }

  if (fields.length === 0) {
    return { affectedRows: 0, message: 'No fields to update' };
  }

  values.push(id);
  const sql = `UPDATE USERS SET ${fields.join(', ')} WHERE UserID = ?`;
  const [result] = await pool.execute(sql, values);
  return result;
}

// Delete user from the db
export async function deleteUser(id) {
  const [result] = await pool.execute('DELETE FROM USERS WHERE UserID = ?', [id]);
  return result;
}

// Get specific driver point data
export async function getDriverPoints(userId) {
  const [rows] = await pool.execute(
    `SELECT 
        d.UserID, 
        u.FirstName, 
        u.LastName, 
        u.Username,
        u.ProfilePicture,
        d.PointBalance,
        d.PerformanceStatus
     FROM DRIVERS d
     JOIN USERS u ON d.UserID = u.UserID 
     WHERE d.UserID = ?`, 
    [userId]
  );
  return rows[0];
}

export async function getSponsorsByDriverId(userId) {
  const [rows] = await pool.execute(`
    SELECT 
      s.SponsorID, 
      s.CompanyName, 
      s.Description,
      s.Status
    FROM SPONSORS s
    JOIN SPONSOR_DRIVERS sd ON s.SponsorID = sd.SponsorID
    JOIN DRIVERS d ON sd.DriverID = d.LicenseNumber
    WHERE d.UserID = ?
  `, [userId]);
  
  return rows;
}

// Point changing
export async function addPointTransaction(driverUserId, adminUserId, pointChange, reason) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const effectiveActorUserId = await resolveAuditActorUserId(adminUserId);

    const [driverRows] = await connection.execute(
      'SELECT LicenseNumber FROM DRIVERS WHERE UserID = ?',
      [driverUserId]
    );
    
    const licenseNumber = driverRows[0]?.LicenseNumber;
    
    if (!licenseNumber) {
      throw new Error("Driver License Number not found. Transaction aborted.");
    }

    await connection.execute(
      `INSERT INTO POINT_TRANSACTIONS (DriverID, UserChanged, PointChange, ReasonForChange, TimeChanged) 
       VALUES (?, ?, ?, ?, NOW())`,
      [licenseNumber, effectiveActorUserId, pointChange, reason]
    );

    await connection.execute(
      `UPDATE DRIVERS SET PointBalance = PointBalance + ? WHERE UserID = ?`,
      [pointChange, driverUserId]
    );

    await connection.execute(
      `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
       VALUES (?, NOW(), 'PointTransaction', ?)`,
      [
        effectiveActorUserId,
        JSON.stringify({
          pointsDelta: Number(pointChange),
          reason: String(reason),
          driverId: String(licenseNumber),
          targetDriverUserId: Number(driverUserId),
        }),
      ]
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// Retrieve all point changes for the user
export async function getPointHistory(userId) {
  const [rows] = await pool.execute(
    `SELECT
        pt.TransactionID,
        pt.DriverID,
        pt.UserChanged,
        actor.Username AS ChangedByUsername,
        actor.FirstName AS ChangedByFirstName,
        actor.LastName AS ChangedByLastName,
        pt.PointChange,
        pt.ReasonForChange,
        DATE_FORMAT(pt.TimeChanged, '%Y-%m-%d %H:%i:%s') AS TimeChanged
     FROM POINT_TRANSACTIONS pt
     JOIN DRIVERS d ON pt.DriverID = d.LicenseNumber
     LEFT JOIN USERS actor ON pt.UserChanged = actor.UserID
     WHERE d.UserID = ?
       AND pt.TimeChanged IS NOT NULL
       AND pt.TimeChanged >= '2000-01-01 00:00:00'
     ORDER BY pt.TimeChanged DESC`,
    [userId]
  );
  return rows;
}

// Change previous point transactions
export async function updatePointTransaction(transactionId, newPoints, newReason, adminUserId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const effectiveActorUserId = await resolveAuditActorUserId(adminUserId);

    const [oldRow] = await connection.execute(
      'SELECT PointChange, DriverID FROM POINT_TRANSACTIONS WHERE TransactionID = ?',
      [transactionId]
    );
    
    if (oldRow.length === 0) throw new Error("Transaction not found");
    
    const oldPoints = oldRow[0].PointChange;
    const licenseNumber = oldRow[0].DriverID; 
    const pointDifference = newPoints - oldPoints;

    await connection.execute(
      `UPDATE POINT_TRANSACTIONS 
       SET PointChange = ?, ReasonForChange = ?, UserChanged = ?, TimeChanged = NOW() 
       WHERE TransactionID = ?`,
      [newPoints, newReason, effectiveActorUserId, transactionId]
    );

    await connection.execute(
      `UPDATE DRIVERS SET PointBalance = PointBalance + ? WHERE LicenseNumber = ?`,
      [pointDifference, licenseNumber]
    );

    await connection.execute(
      `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
       VALUES (?, NOW(), 'PointTransaction', ?)`,
      [
        effectiveActorUserId,
        JSON.stringify({
          pointsDelta: Number(newPoints),
          reason: String(newReason),
          driverId: String(licenseNumber),
          transactionId: Number(transactionId),
          updated: true,
        }),
      ]
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// Retrieving all point transactions for the admin audit log
export async function getAllPointTransactions() {
  const [rows] = await pool.execute(`
    SELECT 
      pt.TransactionID,
      pt.DriverID, 
      d.UserID AS DriverUserID,
      u.FirstName,
      u.LastName,
      pt.UserChanged AS AdminUserID,
      actor.Username AS ChangedByUsername,
      actor.FirstName AS ChangedByFirstName,
      actor.LastName AS ChangedByLastName,
      pt.PointChange,
      pt.ReasonForChange,
      DATE_FORMAT(pt.TimeChanged, '%Y-%m-%d %H:%i:%s') as TimeChanged
    FROM POINT_TRANSACTIONS pt
    JOIN DRIVERS d ON pt.DriverID = d.LicenseNumber
    JOIN USERS u ON d.UserID = u.UserID
    LEFT JOIN USERS actor ON pt.UserChanged = actor.UserID
    WHERE pt.TimeChanged IS NOT NULL
      AND pt.TimeChanged >= '2000-01-01 00:00:00'
    ORDER BY pt.TimeChanged DESC
  `);
  return rows;
}

export { pool }; 

// Auth helpers
export async function getUserByUsername(username) {
  const [rows] = await pool.execute(
    'SELECT * FROM USERS WHERE Username = ?',
    [username]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function getUserByEmail(email) {
  const [rows] = await pool.execute(
    'SELECT * FROM USERS WHERE Email = ?',
    [email]
  );
  return rows.length > 0 ? rows[0] : null;
}

export async function logLoginAttempt(userId, success, result, ipAddress) {
  try {
    const effectiveUserId = await resolveAuditActorUserId(userId);
    await pool.execute(
      'INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties) VALUES (?, NOW(), ?, ?)',
      [effectiveUserId, 'LoginAttempt', JSON.stringify({ success, result, ipAddress })]
    );
  } catch (err) {
    console.error('Error logging login attempt to EVENTS:', {
      err,
      originalUserId: userId,
      cachedSystemAuditUserId,
      success,
      result,
      ipAddress,
    });
  }
}

export async function getNotifications(userId) {
  const [rows] = await pool.execute(
    'SELECT * FROM NOTIFICATIONS WHERE UserID = ? ORDER BY CreatedAt DESC',
    [userId]
  );
  return rows;
}

export async function markNotificationAsRead(notificationId) {
  await pool.execute(
    'UPDATE NOTIFICATIONS SET IsRead = TRUE WHERE NotificationID = ?',
    [notificationId]
  );

  return result.affectedRows > 0;
}