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
 * @returns {Promise<Object>} Result object with success status
 */
export async function changePasswordWithHistory(userId, newPassword) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT PassHash FROM (
        SELECT PassHash, TimeChanged FROM POINT_TRANSACTIONS WHERE UserID = ?
        UNION 
        SELECT PassHash, NULL as TimeChanged FROM USERS WHERE UserID = ?
      ) as combined_history 
      ORDER BY TimeChanged DESC LIMIT 5`,
      [userId, userId]
    );

    for (const record of rows) {
      const isMatch = await verifyPassword(newPassword, record.PassHash);
      if (isMatch) {
        throw new Error("REUSE_ERROR");
      }
    }

    // Hash the new password using salted SHA-256
    const newHash = await hashPassword(newPassword);

    // Update the USERS table
    await connection.query(
      'UPDATE USERS SET PassHash = ?, LastPasswordChange = NOW() WHERE UserID = ?',
      [newHash, userId]
    );

    // Log this change in password_history 
    await connection.query(
      'INSERT INTO EVENTS (EventID, UserID, Timestamp, EventType, Properties) VALUES (UUID(), ?, NOW(), "PasswordChange", ?)',
      [userId, JSON.stringify({ method: 'user_initiated' })]
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
