import { pool } from '../db.js';
import { verifyPassword, hashPassword } from './auth.js';

/**
 * Get user by username
 * @param {string} username - The username to search for
 * @returns {Promise<Object|null>} User object or null if not found
 */
export async function getUserByUsername(username) {
  try {
    const connection = await pool.getConnection();
    
    try {
      const [rows] = await connection.execute(
        'SELECT * FROM USERS WHERE Username = ?',
        [username]
      );
      
      return rows.length > 0 ? rows[0] : null;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error fetching user by username:', error);
    throw error;
  }
}

/**
 * Get user by ID
 * @param {number} id - The user ID to search for
 * @returns {Promise<Object|null>} User object or null if not found
 */
export async function getUserById(id) {
  try {
    const connection = await pool.getConnection();
    
    try {
      const [rows] = await connection.execute(
        'SELECT * FROM USERS WHERE UserID = ?',
        [id]
      );
      
      return rows.length > 0 ? rows[0] : null;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error fetching user by ID:', error);
    throw error;
  }
}

/**
 * Update user profile
 * @param {number} userId - The user ID to update
 * @param {Object} updates - Object with fields to update
 * @returns {Promise<Object>} Result of the update operation
 */
export async function updateUserProfile(userId, updates) {
  try {
    const connection = await pool.getConnection();
    
    try {
      const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = [...Object.values(updates), userId];
      
      const [result] = await connection.execute(
        `UPDATE USERS SET ${fields} WHERE UserID = ?`,
        values
      );
      
      return result;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
}

/**
 * Change user password with history validation
 * @param {number} userId - The user ID
 * @param {string} newPassword - The new password (plain text)
 * @param {'user_initiated'|'admin_initiated'|'password_reset'} [changeMethod='user_initiated']
 * @returns {Promise<Object>} Result object with success status
 */
export async function changePasswordWithHistory(userId, newPassword, changeMethod = 'user_initiated') {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Fetch up to 5 recent old hashes from PasswordChange events, plus the current hash.
    // Per schema: Properties.oldHash stores the hash that was replaced at the time of each change.
    const [rows] = await connection.query(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(Properties, '$.oldHash')) AS PassHash
       FROM EVENTS
       WHERE UserID = ? AND EventType = 'PasswordChange'
         AND JSON_EXTRACT(Properties, '$.oldHash') IS NOT NULL
       ORDER BY Timestamp DESC
       LIMIT 5`,
      [userId]
    );

    // Also check the current password hash from USERS
    const [currentRows] = await connection.query(
      'SELECT PassHash FROM USERS WHERE UserID = ?',
      [userId]
    );
    const allHashes = [
      ...currentRows.map((r) => r.PassHash),
      ...rows.map((r) => r.PassHash),
    ].filter(Boolean);

    for (const hash of allHashes) {
      const isMatch = await verifyPassword(newPassword, hash);
      if (isMatch) {
        throw new Error("REUSE_ERROR");
      }
    }

    // Hash the new password using salted SHA-256
    const newHash = await hashPassword(newPassword);

    // Store old hash in EVENTS before overwriting
    const [userRows] = await connection.query(
      'SELECT PassHash FROM USERS WHERE UserID = ?',
      [userId]
    );
    const oldHash = userRows[0]?.PassHash ?? null;

    // Update the USERS table
    await connection.query(
      'UPDATE USERS SET PassHash = ?, LastPasswordChange = NOW() WHERE UserID = ?',
      [newHash, userId]
    );

    // Log the change in EVENTS with the old hash so future reuse checks work
    await connection.query(
      'INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties) VALUES (?, NOW(), ?, ?)',
      [
        userId,
        'PasswordChange',
        JSON.stringify({
          success: true,
          changeMethod,
          oldHash,
        }),
      ]
    );

    await connection.commit();
    return { success: true };

  } catch (error) {
    await connection.rollback();
    
    if (error.message === "REUSE_ERROR") {
      return { success: false, error: "Cannot reuse one of your last 5 passwords." };
    }
    
    console.error("Database Error:", error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Get all users with their application information
 * @returns {Promise<Array>} Array of user objects with application data
 */
export async function getAllUsersWithApps() {
  try {
    const connection = await pool.getConnection();
    
    try {
      const [rows] = await connection.execute(
        `SELECT 
          u.UserID, 
          u.FirstName, 
          u.LastName, 
          u.Username, 
          u.UserType, 
          u.ProfilePicture,
          da.TimeSubmitted
        FROM USERS u
        LEFT JOIN DRIVER_APPLICATIONS da ON u.UserID = da.DriverID
        ORDER BY u.LastName ASC`
      );
      
      return rows;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error fetching users with applications:', error);
    throw error;
  }
}

/**
 * Get sponsor's driver review based on performance status
 * @param {string|number} companyId - The sponsor company ID
 * @returns {Promise<Array>} Array of driver review data
 */
export async function getSponsorDriverReview(companyId) {
  try {
    const connection = await pool.getConnection();
    
    try {
      const [rows] = await connection.execute(
        `SELECT 
          u.FirstName, 
          u.LastName, 
          d.PerformanceStatus,
          d.PointBalance
        FROM USERS u
        JOIN DRIVERS d ON u.UserID = d.UserID
        WHERE d.SponsorCompanyID = ?
        ORDER BY d.PerformanceStatus ASC`,
        [companyId]
      );
      
      return rows;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error fetching sponsor driver review:', error);
    throw error;
  }
}

/**
 * Update sponsor company description
 * @param {number|string} companyId - The ID of the sponsor company
 * @param {string} companyDescription - The new company description (max 1000 characters)
 * @returns {Promise<{success: boolean, error?: string, data?: any}>} Promise with success/error status
 */
export async function updateSponsorCompanyDescription(companyId, companyDescription) {
  try {
    const connection = await pool.getConnection();
    
    try {
      // Update the description
      const [result] = await connection.execute(
        'UPDATE SPONSOR_COMPANIES SET companyDescription = ?, updatedAt = NOW() WHERE id = ?',
        [companyDescription, companyId]
      );

      if (result.affectedRows === 0) {
        return { success: false, error: 'Sponsor company not found' };
      }

      // Fetch and return updated record
      const [rows] = await connection.execute(
        'SELECT id, companyDescription FROM SPONSOR_COMPANIES WHERE id = ?',
        [companyId]
      );

      return {
        success: true,
        data: rows[0]
      };
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error updating sponsor company description:', error);
    return { success: false, error: 'Database error occurred' };
  }
}

/**
 * Get driver's sponsor company ID by user ID
 * @param {number} userId - The user ID of the driver
 * @returns {Promise<number|null>} Promise with sponsor company ID or null if not associated
 */
export async function getDriverSponsorCompanyId(userId) {
  try {
    const connection = await pool.getConnection();
    
    try {
      const [rows] = await connection.execute(
        'SELECT SponsorCompanyID FROM DRIVERS WHERE UserID = ?',
        [userId]
      );

      if (rows.length === 0) {
        return null;
      }

      return rows[0].SponsorCompanyID;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error fetching driver sponsor company ID:', error);
    throw error;
  }
}

/**
 * Get sponsor's company ID by user ID
 * @param {number} userId - The user ID of the sponsor
 * @returns {Promise<number|null>} Promise with sponsor company ID or null if not found
 */
export async function getSponsorCompanyId(userId) {
  try {
    const connection = await pool.getConnection();
    
    try {
      const [rows] = await connection.execute(
        'SELECT SponsorCompanyID FROM SPONSORS WHERE UserID = ?',
        [userId]
      );

      if (rows.length === 0) {
        return null;
      }

      return rows[0].SponsorCompanyID;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error fetching sponsor company ID:', error);
    throw error;
  }
}

/**
 * Get catalogs filtered by sponsor company ID
 * @param {number} sponsorCompanyId - The sponsor company ID to filter by
 * @param {number} limit - Maximum number of results
 * @param {number} offset - Number of results to skip
 * @returns {Promise<Array>} Promise with array of catalog summaries
 */
export async function getCatalogsBySponsorCompany(sponsorCompanyId, limit = 10, offset = 0) {
  try {
    const connection = await pool.getConnection();
    
    try {
      // Ensure limit and offset are integers for MySQL
      const limitInt = parseInt(limit);
      const offsetInt = parseInt(offset);
      
      const [rows] = await connection.query(
        `SELECT 
          c.CatalogID as id,
          c.SponsorCompanyID as sponsorCompanyId,
          sc.CompanyName as sponsorCompanyName,
          COUNT(ci.ItemID) as itemCount
         FROM CATALOGS c
         LEFT JOIN CATALOG_ITEMS ci ON c.CatalogID = ci.CatalogID
         LEFT JOIN SPONSOR_COMPANIES sc ON c.SponsorCompanyID = sc.SponsorCompanyID
         WHERE c.SponsorCompanyID = ?
         GROUP BY c.CatalogID
         LIMIT ? OFFSET ?`,
        [sponsorCompanyId, limitInt, offsetInt]
      );

      return rows;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error fetching catalogs by sponsor company:', error);
    throw error;
  }
}

/**
 * Get all catalogs across all sponsor companies (admin view)
 * @param {number} limit - Maximum number of results
 * @param {number} offset - Number of results to skip
 * @returns {Promise<Array>} Promise with array of catalog summaries
 */
export async function getAllCatalogs(limit = 10, offset = 0) {
  try {
    const connection = await pool.getConnection();
    
    try {
      // Ensure limit and offset are integers for MySQL
      const limitInt = parseInt(limit);
      const offsetInt = parseInt(offset);
      
      const [rows] = await connection.query(
        `SELECT 
          c.CatalogID as id,
          c.SponsorCompanyID as sponsorCompanyId,
          sc.CompanyName as sponsorCompanyName,
          COUNT(ci.ItemID) as itemCount
         FROM CATALOGS c
         LEFT JOIN CATALOG_ITEMS ci ON c.CatalogID = ci.CatalogID
         LEFT JOIN SPONSOR_COMPANIES sc ON c.SponsorCompanyID = sc.SponsorCompanyID
         GROUP BY c.CatalogID
         ORDER BY c.CatalogID DESC
         LIMIT ? OFFSET ?`,
        [limitInt, offsetInt]
      );

      return rows;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error fetching all catalogs:', error);
    throw error;
  }
}

/**
 * Verify that a catalog belongs to a specific sponsor company
 * @param {number} catalogId - The catalog ID to check
 * @param {number} sponsorCompanyId - The sponsor company ID that should own the catalog
 * @returns {Promise<boolean>} Promise with boolean indicating ownership
 */
export async function verifyCatalogOwnership(catalogId, sponsorCompanyId) {
  try {
    const connection = await pool.getConnection();
    
    try {
      const [rows] = await connection.execute(
        'SELECT CatalogID FROM CATALOGS WHERE CatalogID = ? AND SponsorCompanyID = ?',
        [catalogId, sponsorCompanyId]
      );

      return rows.length > 0;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error verifying catalog ownership:', error);
    throw error;
  }
}

/**
 * Check if a user exists in the USERS table
 * @param {number} userId - The user ID to check
 * @returns {Promise<boolean>} Promise with boolean indicating if user exists
 */
export async function userExists(userId) {
  try {
    const connection = await pool.getConnection();
    
    try {
      const [rows] = await connection.execute(
        'SELECT UserID FROM USERS WHERE UserID = ?',
        [userId]
      );

      return rows.length > 0;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error checking if user exists:', error);
    throw error;
  }
}

/**
 * Get driver application report with aggregated counts by status
 * @param {Object} filters - Filter options
 * @param {string} [filters.status] - Filter by application status (pending, accepted, rejected)
 * @param {string} [filters.startDate] - Filter applications on or after this date (ISO 8601)
 * @param {string} [filters.endDate] - Filter applications on or before this date (ISO 8601)
 * @param {number} [filters.sponsorCompanyId] - Filter by sponsor company ID
 * @param {string} [filters.driverId] - Filter by driver license number
 * @returns {Promise<Object>} Promise with report data including counts and filter metadata
 */
export async function getDriverApplicationReport(filters = {}) {
  try {
    const connection = await pool.getConnection();
    
    try {
      // Build dynamic WHERE clause
      let whereClause = 'WHERE 1=1';
      const params = [];

      if (filters.status) {
        whereClause += ' AND ApplicationStatus = ?';
        params.push(filters.status);
      }

      if (filters.startDate) {
        whereClause += ' AND TimeSubmitted >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        whereClause += ' AND TimeSubmitted <= ?';
        params.push(filters.endDate);
      }

      if (filters.sponsorCompanyId) {
        whereClause += ' AND SponsorCompanyID = ?';
        params.push(filters.sponsorCompanyId);
      }

      if (filters.driverId) {
        whereClause += ' AND DriverID = ?';
        params.push(filters.driverId);
      }

      // Query to get counts grouped by status
      const query = `
        SELECT 
          ApplicationStatus,
          COUNT(*) as count
        FROM DRIVER_APPLICATIONS
        ${whereClause}
        GROUP BY ApplicationStatus
      `;

      const [rows] = await connection.query(query, params);

      // Initialize counts
      const report = {
        totalApplications: 0,
        pendingCount: 0,
        acceptedCount: 0,
        rejectedCount: 0
      };

      // Populate counts from query results
      rows.forEach(row => {
        const count = parseInt(row.count);
        report.totalApplications += count;
        
        if (row.ApplicationStatus === 'pending') {
          report.pendingCount = count;
        } else if (row.ApplicationStatus === 'accepted') {
          report.acceptedCount = count;
        } else if (row.ApplicationStatus === 'rejected') {
          report.rejectedCount = count;
        }
      });

      // Add filter metadata to response
      if (filters.startDate) {
        report.dateRangeStart = filters.startDate;
      }
      if (filters.endDate) {
        report.dateRangeEnd = filters.endDate;
      }
      if (filters.sponsorCompanyId) {
        report.sponsorCompanyId = filters.sponsorCompanyId;
      }
      if (filters.driverId) {
        report.driverId = filters.driverId;
      }

      // Include detailed records if requested
      if (filters.includeDetails) {
        const detailsQuery = `
          SELECT 
            ApplicationID,
            DriverID,
            SponsorCompanyID,
            ApplicationStatus,
            TimeSubmitted,
            NULL AS TimeStatusChanged
          FROM DRIVER_APPLICATIONS
          ${whereClause}
          ORDER BY TimeSubmitted DESC
        `; // NULL AS because apparently there wasnt any column in the database
        
        const [detailRows] = await connection.query(detailsQuery, params);
        report.detailedRecords = detailRows;
      }

      return report;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error generating driver application report:', error);
    throw error;
  }
}

/**
 * Get point transactions report with aggregated statistics
 * @param {Object} filters - Filter options
 * @param {string} [filters.startDate] - Filter transactions on or after this date (ISO 8601)
 * @param {string} [filters.endDate] - Filter transactions on or before this date (ISO 8601)
 * @param {string} [filters.driverId] - Filter by driver license number
 * @param {string} [filters.reasonForChange] - Filter by reason for change
 * @param {boolean} [filters.includeDetails] - Include detailed transaction records
 * @returns {Promise<Object>} Promise with report data including statistics and optional details
 */
export async function getPointTransactionsReport(filters = {}) {
  try {
    const connection = await pool.getConnection();
    
    try {
      // Build dynamic WHERE clause
      let whereClause = 'WHERE 1=1';
      const params = [];

      if (filters.startDate) {
        whereClause += ' AND TimeChanged >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        whereClause += ' AND TimeChanged <= ?';
        params.push(filters.endDate);
      }

      if (filters.driverId) {
        whereClause += ' AND DriverID = ?';
        params.push(filters.driverId);
      }

      if (filters.reasonForChange) {
        whereClause += ' AND ReasonForChange = ?';
        params.push(filters.reasonForChange);
      }

      // Query to get aggregated statistics
      const statsQuery = `
        SELECT 
          COUNT(*) as totalTransactions,
          SUM(CASE WHEN PointChange > 0 THEN PointChange ELSE 0 END) as totalPointsAdded,
          SUM(CASE WHEN PointChange < 0 THEN ABS(PointChange) ELSE 0 END) as totalPointsDeducted,
          SUM(PointChange) as netPointChange
        FROM POINT_TRANSACTIONS
        ${whereClause}
      `;

      const [statsRows] = await connection.query(statsQuery, params);
      const stats = statsRows[0];

      // Initialize report
      const report = {
        totalTransactions: parseInt(stats.totalTransactions) || 0,
        totalPointsAdded: parseInt(stats.totalPointsAdded) || 0,
        totalPointsDeducted: parseInt(stats.totalPointsDeducted) || 0,
        netPointChange: parseInt(stats.netPointChange) || 0
      };

      // Add filter metadata to response
      if (filters.startDate) {
        report.dateRangeStart = filters.startDate;
      }
      if (filters.endDate) {
        report.dateRangeEnd = filters.endDate;
      }
      if (filters.driverId) {
        report.driverId = filters.driverId;
      }
      if (filters.reasonForChange) {
        report.reasonForChange = filters.reasonForChange;
      }

      // Include detailed records if requested
      if (filters.includeDetails) {
        const detailsQuery = `
          SELECT 
            TransactionID,
            DriverID,
            UserChanged,
            PointChange,
            ReasonForChange,
            TimeChanged
          FROM POINT_TRANSACTIONS
          ${whereClause}
          ORDER BY TimeChanged DESC
        `;
        
        const [detailRows] = await connection.query(detailsQuery, params);
        report.detailedRecords = detailRows;
      }

      return report;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error generating point transactions report:', error);
    throw error;
  }
}

/**
 * Get orders report with aggregated statistics
 * @param {Object} filters - Filter options
 * @param {string} [filters.startDate] - Filter orders on or after this date (ISO 8601)
 * @param {string} [filters.endDate] - Filter orders on or before this date (ISO 8601)
 * @param {string} [filters.driverId] - Filter by driver license number
 * @param {number} [filters.sponsorCompanyId] - Filter by sponsor company ID
 * @param {string} [filters.orderStatus] - Filter by order status (confirmed, shipped, delivered, cancelled)
 * @param {boolean} [filters.includeDetails] - Include detailed order records
 * @returns {Promise<Object>} Promise with report data including statistics and optional details
 */
export async function getOrdersReport(filters = {}) {
  try {
    const connection = await pool.getConnection();
    
    try {
      // Build dynamic WHERE clause
      let whereClause = 'WHERE 1=1';
      const params = [];

      if (filters.startDate) {
        whereClause += ' AND OrderDate >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        whereClause += ' AND OrderDate <= ?';
        params.push(filters.endDate);
      }

      if (filters.driverId) {
        whereClause += ' AND DriverID = ?';
        params.push(filters.driverId);
      }

      if (filters.sponsorCompanyId) {
        whereClause += ' AND SponsorCompanyID = ?';
        params.push(filters.sponsorCompanyId);
      }

      if (filters.orderStatus) {
        whereClause += ' AND OrderStatus = ?';
        params.push(filters.orderStatus);
      }

      // Query to get aggregated statistics
      const statsQuery = `
        SELECT 
          COUNT(*) as totalOrders,
          SUM(OrderPointsSpent) as totalPointsSpent,
          SUM(OrderDollarsSpent) as totalDollarsSpent,
          SUM(CASE WHEN OrderStatus = 'confirmed' THEN 1 ELSE 0 END) as confirmedCount,
          SUM(CASE WHEN OrderStatus = 'shipped' THEN 1 ELSE 0 END) as shippedCount,
          SUM(CASE WHEN OrderStatus = 'delivered' THEN 1 ELSE 0 END) as deliveredCount,
          SUM(CASE WHEN OrderStatus = 'cancelled' THEN 1 ELSE 0 END) as cancelledCount
        FROM ORDERS
        ${whereClause}
      `;

      const [statsRows] = await connection.query(statsQuery, params);
      const stats = statsRows[0];

      // Initialize report
      const report = {
        totalOrders: parseInt(stats.totalOrders) || 0,
        totalPointsSpent: parseInt(stats.totalPointsSpent) || 0,
        totalDollarsSpent: parseFloat(stats.totalDollarsSpent) || 0,
        confirmedCount: parseInt(stats.confirmedCount) || 0,
        shippedCount: parseInt(stats.shippedCount) || 0,
        deliveredCount: parseInt(stats.deliveredCount) || 0,
        cancelledCount: parseInt(stats.cancelledCount) || 0
      };

      // Add filter metadata to response
      if (filters.startDate) {
        report.dateRangeStart = filters.startDate;
      }
      if (filters.endDate) {
        report.dateRangeEnd = filters.endDate;
      }
      if (filters.driverId) {
        report.driverId = filters.driverId;
      }
      if (filters.sponsorCompanyId) {
        report.sponsorCompanyId = filters.sponsorCompanyId;
      }
      if (filters.orderStatus) {
        report.orderStatus = filters.orderStatus;
      }

      // Include detailed records if requested
      if (filters.includeDetails) {
        const detailsQuery = `
          SELECT 
            OrderID,
            DriverID,
            SponsorCompanyID,
            OrderDate,
            OrderPointsSpent,
            OrderDollarsSpent,
            OrderStatus
          FROM ORDERS
          ${whereClause}
          ORDER BY OrderDate DESC
        `;
        
        const [detailRows] = await connection.query(detailsQuery, params);
        report.detailedRecords = detailRows;
      }

      return report;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error generating orders report:', error);
    throw error;
  }
}

/**
 * Get audit log entries from the EVENTS table.
 * @param {string[]} filters - Optional array of EventType values to filter by
 *                             (e.g. ['LoginAttempt', 'PasswordChange']).
 *                             Pass an empty array to return all event types.
 * @returns {Promise<Object[]>} Array of event rows joined with username.
 */
export async function getAuditLogs(filters = []) {
  const connection = await pool.getConnection();
  try {
    let query = `
      SELECT
        e.EventID,
        e.UserID,
        u.Username,
        e.Timestamp,
        e.EventType,
        e.Properties
      FROM EVENTS e
      LEFT JOIN USERS u ON e.UserID = u.UserID
    `;
    const params = [];

    if (filters.length > 0) {
      const placeholders = filters.map(() => '?').join(', ');
      query += ` WHERE e.EventType IN (${placeholders})`;
      params.push(...filters);
    }

    query += ' ORDER BY e.Timestamp DESC LIMIT 500';

    const [rows] = await connection.execute(query, params);
    return rows;
  } finally {
    connection.release();
  }
}

/**
 * Get all sponsor company IDs.
 * @returns {Promise<number[]>} Array of sponsor company IDs.
 */
export async function getAllSponsorCompanyIds() {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      'SELECT SponsorCompanyID FROM SPONSOR_COMPANIES ORDER BY SponsorCompanyID ASC'
    );

    return rows.map((row) => Number(row.SponsorCompanyID));
  } finally {
    connection.release();
  }
}

/**
 * Insert or update a generated daily report record.
 * Enforces one report per sponsor/reportType/date using the table unique constraint.
 * @param {Object} record - Report record to upsert.
 * @returns {Promise<void>}
 */
export async function upsertGeneratedReport(record) {
  const connection = await pool.getConnection();
  try {
    await connection.execute(
      `INSERT INTO GENERATED_REPORTS (
         SponsorCompanyID,
         ReportType,
         ReportDate,
         GeneratedAt,
         SchedulerRunAt,
         GenerationStatus,
         GenerationError,
         ReportPayload,
         IsVisible
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         GeneratedAt = VALUES(GeneratedAt),
         SchedulerRunAt = VALUES(SchedulerRunAt),
         GenerationStatus = VALUES(GenerationStatus),
         GenerationError = VALUES(GenerationError),
         ReportPayload = VALUES(ReportPayload),
         IsVisible = 1`,
      [
        record.sponsorCompanyId,
        record.reportType,
        record.reportDate,
        record.generatedAt,
        record.schedulerRunAt,
        record.generationStatus,
        record.generationError,
        record.reportPayload ? JSON.stringify(record.reportPayload) : null,
      ]
    );
  } finally {
    connection.release();
  }
}

/**
 * List generated daily reports for a sponsor company.
 * @param {number} sponsorCompanyId - Sponsor company ID.
 * @param {Object} options - Optional filters and pagination.
 * @returns {Promise<{reports: Object[], total: number, limit: number, offset: number}>}
 */
export async function listGeneratedReportsForSponsor(sponsorCompanyId, options = {}) {
  const connection = await pool.getConnection();
  try {
    const limit = Number.isInteger(options.limit) ? options.limit : 20;
    const offset = Number.isInteger(options.offset) ? options.offset : 0;

    let whereClause = 'WHERE SponsorCompanyID = ? AND IsVisible = 1';
    const params = [sponsorCompanyId];

    if (options.reportType) {
      whereClause += ' AND ReportType = ?';
      params.push(options.reportType);
    }

    if (options.startDate) {
      whereClause += ' AND ReportDate >= ?';
      params.push(options.startDate);
    }

    if (options.endDate) {
      whereClause += ' AND ReportDate <= ?';
      params.push(options.endDate);
    }

    const [countRows] = await connection.query(
      `SELECT COUNT(*) AS total
       FROM GENERATED_REPORTS
       ${whereClause}`,
      params
    );

    const [rows] = await connection.query(
      `SELECT
         ReportID,
         SponsorCompanyID,
         ReportType,
         ReportDate,
         GeneratedAt,
         SchedulerRunAt,
         GenerationStatus,
         GenerationError
       FROM GENERATED_REPORTS
       ${whereClause}
       ORDER BY ReportDate DESC, ReportType ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return {
      reports: rows,
      total: Number(countRows[0]?.total ?? 0),
      limit,
      offset,
    };
  } finally {
    connection.release();
  }
}

/**
 * Fetch a generated report by id within a sponsor company boundary.
 * @param {number} reportId - Generated report ID.
 * @param {number} sponsorCompanyId - Sponsor company ID.
 * @returns {Promise<Object|null>} Generated report row.
 */
export async function getGeneratedReportByIdForSponsor(reportId, sponsorCompanyId) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      `SELECT
         ReportID,
         SponsorCompanyID,
         ReportType,
         ReportDate,
         GeneratedAt,
         SchedulerRunAt,
         GenerationStatus,
         GenerationError,
         ReportPayload
       FROM GENERATED_REPORTS
       WHERE ReportID = ? AND SponsorCompanyID = ? AND IsVisible = 1
       LIMIT 1`,
      [reportId, sponsorCompanyId]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    if (typeof row.ReportPayload === 'string') {
      try {
        row.ReportPayload = JSON.parse(row.ReportPayload);
      } catch {
        row.ReportPayload = null;
      }
    }

    return row;
  } finally {
    connection.release();
  }
}
