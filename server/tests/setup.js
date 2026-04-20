import { pool } from '../src/db.js';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.fs-env' });

export const BASE_URL = `http://localhost:${process.env.PORT}`;

// Helper function to log test results
export function log(title, data) {
  console.log('\n' + '='.repeat(50));
  console.log(title);
  console.log('='.repeat(50));
  console.log(JSON.stringify(data, null, 2));
}

/**
 * creates a test sponsor company in the database
 * @param {Object} options - Configuration options
 * @param {string} options.companyName - Name of the sponsor company (default: 'Test Sponsor Company')
 * @param {number} options.pointDollarValue - Point to dollar conversion rate (default: 0.01)
 * @param {Object} options.contactInfo - Contact information object (default: test data)
 * @returns {Promise<number>} The ID of the created sponsor company
 */
export async function createTestSponsor(options = {}) {
  const {
    companyName = 'Test Sponsor Company',
    pointDollarValue = 0.01,
    contactInfo = {
      email: 'test@example.com',
      phone: '555-0123',
      address: '123 Test St'
    }
  } = options;

  const connection = await pool.getConnection();
  
  try {
    const contactInfoJson = JSON.stringify(contactInfo);
    
    console.log('Attempting to insert sponsor:', { companyName, pointDollarValue, contactInfoJson });
    
    const [sponsorResult] = await connection.query(
      'INSERT INTO SPONSOR_COMPANIES (CompanyName, PointDollarValue, ContactInfo) VALUES (?, ?, ?)',
      [companyName, pointDollarValue, contactInfoJson]
    );
    
    console.log('Insert result:', sponsorResult);
    
    return sponsorResult.insertId;
  } catch (error) {
    console.error('Error in createTestSponsor:', error);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('SQL message:', error.sqlMessage);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Deletes sponsor companies from the database
 * @param {number[]} sponsorIds - Array of sponsor company IDs to delete
 * @returns {Promise<void>}
 */
export async function cleanupSponsorCompanies(sponsorIds) {
  if (!sponsorIds || sponsorIds.length === 0) {
    return;
  }

  const connection = await pool.getConnection();
  
  try {
    for (const id of sponsorIds) {
      try {
        await connection.query('DELETE FROM DRIVER_COMPANY_ENROLLMENT WHERE SponsorCompanyID = ?', [id]);
      } catch (error) {
        if (error?.code !== 'ER_NO_SUCH_TABLE' && error?.code !== 'ER_BAD_FIELD_ERROR') {
          throw error;
        }
      }

      await connection.query('DELETE FROM SPONSOR_COMPANIES WHERE SponsorCompanyID = ?', [id]);
      console.log(`Deleted sponsor company ${id}`);
    }
  } catch (error) {
    console.error('Error cleaning up sponsor companies:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Closes the database pool connection
 * Should be called at the end of tests
 * @returns {Promise<void>}
 */
export async function closePool() {
  await pool.end();
}

function buildTimestamp() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function buildUniqueValue(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a USERS record for testing.
 * @param {Object} options
 * @param {'driver'|'sponsor'|'admin'} [options.userType]
 * @param {number} [options.activeStatus]
 * @param {Object|string} [options.permissions]
 * @param {string} [options.username]
 * @param {string} [options.email]
 * @param {string} [options.firstName]
 * @param {string} [options.lastName]
 * @param {string} [options.passHash]
 * @returns {Promise<{ userId: number, username: string, email: string }>}
 */
export async function createTestUser(options = {}) {
  const {
    userType = 'driver',
    activeStatus = 1,
    permissions = {},
    username = buildUniqueValue(`test_${userType}`),
    email = `${buildUniqueValue(`mail_${userType}`)}@example.com`,
    firstName = 'Test',
    lastName = 'User',
    passHash = 'salt:hash',
  } = options;

  const timestamp = buildTimestamp();
  const permissionsJson = typeof permissions === 'string' ? permissions : JSON.stringify(permissions);

  const connection = await pool.getConnection();
  try {
    const [result] = await connection.query(
      `INSERT INTO USERS
        (Username, Email, PassHash, UserType, FirstName, LastName, ActiveStatus, LastLogin, LastPasswordChange, Permissions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, email, passHash, userType, firstName, lastName, activeStatus, timestamp, timestamp, permissionsJson]
    );

    const [storedRows] = await connection.query(
      'SELECT Username, Email FROM USERS WHERE UserID = ?',
      [result.insertId]
    );

    const storedUser = storedRows[0] ?? {};

    return {
      userId: result.insertId,
      username: storedUser.Username ?? username,
      email: storedUser.Email ?? email,
    };
  } finally {
    connection.release();
  }
}

/**
 * Create a DRIVERS record for an existing user.
 * @param {Object} options
 * @param {number} options.userId
 * @param {number|null} [options.sponsorCompanyId]
 * @param {string} [options.licenseNumber]
 * @param {number} [options.pointBalance]
 * @param {string} [options.performanceStatus]
 */
export async function createTestDriverProfile(options) {
  const {
    userId,
    sponsorCompanyId = null,
    licenseNumber = buildUniqueValue('DL'),
    pointBalance = 1000,
    performanceStatus = 'good',
  } = options;

  const connection = await pool.getConnection();
  try {
    await connection.query(
      `INSERT INTO DRIVERS
        (LicenseNumber, UserID, SponsorCompanyID, PointBalance, PerformanceStatus, AlertPoints, AlertOrders)
       VALUES (?, ?, ?, ?, ?, 1, 1)`,
      [licenseNumber, userId, sponsorCompanyId, pointBalance, performanceStatus]
    );

    if (Number.isInteger(sponsorCompanyId) && sponsorCompanyId > 0) {
      try {
        await connection.query(
          `INSERT INTO DRIVER_COMPANY_ENROLLMENT
            (DriverID, SponsorCompanyID, PointBalance, EnrollmentStatus, JoinedAt, LeftAt)
           VALUES (?, ?, ?, 'active', NOW(), NULL)
           ON DUPLICATE KEY UPDATE
             EnrollmentStatus = 'active',
             LeftAt = NULL,
             PointBalance = VALUES(PointBalance)`,
          [licenseNumber, sponsorCompanyId, pointBalance]
        );
      } catch (error) {
        if (error?.code !== 'ER_NO_SUCH_TABLE' && error?.code !== 'ER_BAD_FIELD_ERROR') {
          throw error;
        }
      }
    }

    return { userId, licenseNumber, sponsorCompanyId };
  } finally {
    connection.release();
  }
}

/**
 * Create a SPONSORS record for an existing user.
 * @param {Object} options
 * @param {number} options.userId
 * @param {number} options.sponsorCompanyId
 */
export async function createTestSponsorProfile(options) {
  const { userId, sponsorCompanyId } = options;

  const connection = await pool.getConnection();
  try {
    await connection.query(
      'INSERT INTO SPONSORS (UserID, SponsorCompanyID) VALUES (?, ?)',
      [userId, sponsorCompanyId]
    );
    return { userId, sponsorCompanyId };
  } finally {
    connection.release();
  }
}

export async function setUserActiveStatus(userId, activeStatus) {
  const connection = await pool.getConnection();
  try {
    await connection.query('UPDATE USERS SET ActiveStatus = ? WHERE UserID = ?', [activeStatus, userId]);
  } finally {
    connection.release();
  }
}

export async function setUserPermissions(userId, permissions) {
  const permissionsJson = typeof permissions === 'string' ? permissions : JSON.stringify(permissions);
  const connection = await pool.getConnection();
  try {
    await connection.query('UPDATE USERS SET Permissions = ? WHERE UserID = ?', [permissionsJson, userId]);
  } finally {
    connection.release();
  }
}

export async function getEventsByUserId(userId, eventType = null, limit = 20) {
  const connection = await pool.getConnection();
  try {
    if (eventType) {
      const [rows] = await connection.query(
        `SELECT EventID, UserID, EventType, Properties, Timestamp
         FROM EVENTS
         WHERE UserID = ? AND EventType = ?
         ORDER BY EventID DESC
         LIMIT ?`,
        [userId, eventType, limit]
      );
      return rows;
    }

    const [rows] = await connection.query(
      `SELECT EventID, UserID, EventType, Properties, Timestamp
       FROM EVENTS
       WHERE UserID = ?
       ORDER BY EventID DESC
       LIMIT ?`,
      [userId, limit]
    );
    return rows;
  } finally {
    connection.release();
  }
}
