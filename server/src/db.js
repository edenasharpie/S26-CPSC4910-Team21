import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Fix: Load environment variables correctly
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../../.fs-env');
console.log('Looking for .fs-env at:', envPath);
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error('Error loading .fs-env file:', result.error.message);
} else {
  console.log('Environment variables loaded successfully');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Use named exports for ESM compatibility
export const query = async (sql, params) => {
  const [rows] = await pool.execute(sql, params);
  return { rows };
};

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

export async function getAllUsers() {
  const [rows] = await pool.execute('SELECT * FROM USERS');
  return rows;
} 

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

    // 2️⃣ Normalize UserType check (prevents casing issues)
    if (userData.UserType?.toLowerCase() === "admin") {

      await connection.execute(
        `INSERT INTO ADMINS (UserID) VALUES (?)`,
        [newUserId]
      );

      console.log(`✅ Admin record successfully created for UserID: ${newUserId}`);
    }

    // 3. COMMIT is what makes it show up in Workbench
    await connection.commit(); 
    return { success: true };

  } catch (error) {
    await connection.rollback();
    // This will tell us if there's a specific constraint error
    console.error("DATABASE ERROR:", error.sqlMessage || error.message);
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateUser(id, updates) {
  const { 
    Username, Email, Phone, PassHash, 
    FirstName, MiddleName, LastName, 
    Pronouns, ProfilePicture, Bio, 
    UserType, ActiveStatus 
  } = updates;

  const [result] = await pool.execute(
    `UPDATE USERS 
     SET Username = ?, Email = ?, Phone = ?, PassHash = ?, 
         FirstName = ?, MiddleName = ?, LastName = ?, 
         Pronouns = ?, ProfilePicture = ?, Bio = ?, 
         UserType = ?, ActiveStatus = ? 
     WHERE UserID = ?`,
    [Username, Email, Phone, PassHash, FirstName, MiddleName, LastName, 
     Pronouns, ProfilePicture, Bio, UserType, ActiveStatus, id]
  );
  return result;
}

// Added the delete function for your "Delete User" button logic
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

export async function addPointTransaction(driverUserId, adminUserId, pointChange, reason) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Fetch the LicenseNumber using the Driver's UserID
    const [driverRows] = await connection.execute(
      'SELECT LicenseNumber FROM DRIVERS WHERE UserID = ?',
      [driverUserId]
    );
    
    const licenseNumber = driverRows[0]?.LicenseNumber;
    
    if (!licenseNumber) {
      throw new Error("Driver License Number not found. Transaction aborted.");
    }

    // 2. Insert into POINT_TRANSACTIONS (plural)
    // DriverID must be the LicenseNumber
    // UserChanged must be a valid UserID from the USERS table
    await connection.execute(
      `INSERT INTO POINT_TRANSACTIONS (DriverID, UserChanged, PointChange, ReasonForChange, TimeChanged) 
       VALUES (?, ?, ?, ?, NOW())`,
      [licenseNumber, adminUserId, pointChange, reason]
    );

    // 3. Update the DRIVERS table balance
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

export async function updatePointTransaction(transactionId, newPoints, newReason, adminUserId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Get the old points and the DriverID (LicenseNumber) from the transaction
    const [oldRow] = await connection.execute(
      'SELECT PointChange, DriverID FROM POINT_TRANSACTIONS WHERE TransactionID = ?',
      [transactionId]
    );
    
    if (oldRow.length === 0) throw new Error("Transaction not found");
    
    const oldPoints = oldRow[0].PointChange;
    const licenseNumber = oldRow[0].DriverID; // Maps to LicenseNumber
    
    // 2. Calculate the difference (e.g., if old was 10 and new is 15, we add 5 to the total)
    const pointDifference = newPoints - oldPoints;

    // 3. Update the POINT_TRANSACTIONS table (plural)
    // Set UserChanged to the admin's UserID
    await connection.execute(
      `UPDATE POINT_TRANSACTIONS 
       SET PointChange = ?, ReasonForChange = ?, UserChanged = ?, TimeChanged = NOW() 
       WHERE TransactionID = ?`,
      [newPoints, newReason, adminUserId, transactionId]
    );

    // 4. Update the DRIVERS table balance by applying the difference
    // This finds the driver via LicenseNumber to match the transaction's DriverID
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

export { pool }; // Only one export { pool } at the bottom

