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

//Conection pool to SQL
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

//Error handling for the connection pool
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

//Getting specific user by ID 
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

//Getting all users
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

//Getting drivers by sponsor comapny
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

//Creating new user action, edit to ask for email, phone number, profile picture, password and bio
//make picture, bio, and email optional, all other required, and password rule following
export async function createUser(userData) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [userResult] = await connection.execute(
      `INSERT INTO USERS (Username, FirstName, LastName, UserType, ActiveStatus) 
       VALUES (?, ?, ?, ?, 1)`,
      [userData.Username, userData.FirstName, userData.LastName, userData.UserType]
    );

    const newUserId = userResult.insertId;

    console.log("Created UserID:", newUserId);
    console.log("UserType received:", userData.UserType);

    if (userData.UserType?.toLowerCase() === "admin") {

      await connection.execute(
        `INSERT INTO ADMINS (UserID) VALUES (?)`,
        [newUserId]
      );
    }

    await connection.commit(); 
    return { success: true };

    //Error checking
  } catch (error) {
    await connection.rollback();
    console.error("DATABASE ERROR:", error.sqlMessage || error.message);
    throw error;
  } finally {
    connection.release();
  }
}

//Update user in the DB 
export async function updateUser(id, updates) {
  // Build dynamic UPDATE query to only update provided fields
  const fields = [];
  const values = [];

  // Map of allowed fields for USERS table
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

  // Only include fields that are explicitly provided and not undefined
  for (const [key, dbColumn] of Object.entries(allowedFields)) {
    if (updates[key] !== undefined) {
      // Special handling for PassHash: validate format if provided
      if (key === 'PassHash') {
        const passHash = updates[key];
        // Only update PassHash if it's non-empty and appears to be valid (contains colon for salt:hash format)
        if (passHash && typeof passHash === 'string' && passHash.length > 0) {
          if (!passHash.includes(':')) {
            throw new Error('Invalid password hash format: must be in salt:hash format');
          }
          fields.push(`${dbColumn} = ?`);
          values.push(passHash);
        }
        // If PassHash is empty or invalid, skip it (don't update)
      } else {
        fields.push(`${dbColumn} = ?`);
        values.push(updates[key]);
      }
    }
  }

  // If no fields to update, return early
  if (fields.length === 0) {
    return { affectedRows: 0, message: 'No fields to update' };
  }

  // Add the user ID for the WHERE clause
  values.push(id);

  const query = `UPDATE USERS SET ${fields.join(', ')} WHERE UserID = ?`;
  
  const [result] = await pool.execute(query, values);
  return result;
}

// Delete user from the db
//TODO: make so that it is not truely dleted just marked as inactive and removed from other areas and views
export async function deleteUser(id) {
  const [result] = await pool.execute('DELETE FROM USERS WHERE UserID = ?', [id]);
  return result;
}

// Get specific driver point data
export async function getDriverPoints(userId) {
  const [rows] = await pool.execute(
    `SELECT d.UserID, u.FirstName, u.LastName, d.PointBalance 
     FROM DRIVERS d
     JOIN USERS u ON d.UserID = u.UserID 
     WHERE d.UserID = ?`, 
    [userId]
  );
  return rows[0];
}

//Point changing
export async function addPointTransaction(driverUserId, adminUserId, pointChange, reason) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

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
      [licenseNumber, adminUserId, pointChange, reason]
    );

    await connection.execute(
      `UPDATE DRIVERS SET PointBalance = PointBalance + ? WHERE UserID = ?`,
      [pointChange, driverUserId]
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

//Retrieve all point changes for the user
export async function getPointHistory(userId) {
  const [rows] = await pool.execute(
    `SELECT pt.* FROM POINT_TRANSACTIONS pt
     JOIN DRIVERS d ON pt.DriverID = d.LicenseNumber
     WHERE d.UserID = ?
     ORDER BY pt.TimeChanged DESC`,
    [userId]
  );
  return rows;
}

//Change previous point transactions
export async function updatePointTransaction(transactionId, newPoints, newReason, adminUserId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

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
      [newPoints, newReason, adminUserId, transactionId]
    );

    await connection.execute(
      `UPDATE DRIVERS SET PointBalance = PointBalance + ? WHERE LicenseNumber = ?`,
      [pointDifference, licenseNumber]
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

//Retrieving all point transactions for the admin audit log
export async function getAllPointTransactions() {
  const [rows] = await pool.execute(`
    SELECT 
      pt.TransactionID,
      pt.DriverID, -- This is the LicenseNumber
      d.UserID AS DriverUserID,
      u.FirstName,
      u.LastName,
      pt.UserChanged AS AdminUserID,
      pt.PointChange,
      pt.ReasonForChange,
      DATE_FORMAT(pt.TimeChanged, '%Y-%m-%d %H:%i:%s') as TimeChanged
    FROM POINT_TRANSACTIONS pt
    JOIN DRIVERS d ON pt.DriverID = d.LicenseNumber
    JOIN USERS u ON d.UserID = u.UserID
    ORDER BY pt.TimeChanged DESC
  `);
  return rows;
}

export { pool }; 

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/**
 * Look up a user by their username.
 * @param {string} username
 * @returns {Promise<Object|null>}
 */
export async function getUserByUsername(username) {
  const [rows] = await pool.execute(
    'SELECT * FROM USERS WHERE Username = ?',
    [username]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Look up a user by their email address.
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
export async function getUserByEmail(email) {
  const [rows] = await pool.execute(
    'SELECT * FROM USERS WHERE Email = ?',
    [email]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Append a LoginAttempt row to the EVENTS audit log.
 * EVENTS.UserID is NOT NULL — null userId maps to sentinel 0.
 *
 * @param {number|null} userId
 * @param {boolean} success
 * @param {'username_not_found'|'failed'|'success'|'failed_too_many_attempts'} result
 * @param {string} ipAddress
 */
export async function logLoginAttempt(userId, success, result, ipAddress) {
  try {
    await pool.execute(
      'INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties) VALUES (?, NOW(), ?, ?)',
      [userId ?? 0, 'LoginAttempt', JSON.stringify({ success, result, ipAddress })]
    );
  } catch (err) {
    // Non-fatal — never crash the login flow because of a logging failure
    console.error('Error logging login attempt to EVENTS:', err);
  }
}

