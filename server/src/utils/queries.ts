// server/database/db.ts
// Database connection and helper functions

// TODO: implement connecting to RDS database with these queries; not trying to look for a local db.

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from '../db';
import { RowDataPacket } from 'mysql2';
import { readFileSync } from 'fs';

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const mysql = require('mysql2/promise');
import { verifyPassword, hashPassword } from './auth';

// Create/connect to database
const db = new Database(join(__dirname, 'fleetscore.db'));

// Enable foreign keys (important for data integrity)
db.pragma('foreign_keys = ON');

/**
 * Get user by username
 */
export function getUserByUsername(username: string) {
  const stmt = db.prepare(`
    SELECT * FROM users WHERE username = ?
  `);
  return stmt.get(username);
}

/**
 * Get user by ID
 */
export function getUserById(id: number) {
  const stmt = db.prepare(`
    SELECT * FROM users WHERE id = ?
  `);
  return stmt.get(id);
}

/**
 * Update user profile
 */
export function updateUserProfile(userId: number, updates: {
  display_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
}) {
  const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(updates);
  
  const stmt = db.prepare(`
    UPDATE users 
    SET ${fields}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  
  return stmt.run(...values, userId);
}

/**
 * Change user password
 * Saves old password to history and updates user with new password
 * Note: All validation should be done before calling this function
 */
export function changePassword(
  userId: number, 
  oldPasswordHash: string, 
  newPasswordHash: string,
  ipAddress?: string,
  userAgent?: string
): { success: boolean; error?: string } {
  
  try {
    // Begin transaction (better-sqlite3 transactions are synchronous)
    const saveHistory = db.prepare(`
      INSERT INTO password_history (user_id, password_hash, changed_from_ip, user_agent)
      VALUES (?, ?, ?, ?)
    `);
    
    const updatePassword = db.prepare(`
      UPDATE users 
      SET password_hash = ?, 
          last_password_change = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    // Execute both statements
    saveHistory.run(userId, oldPasswordHash, ipAddress || null, userAgent || null);
    updatePassword.run(newPasswordHash, userId);
    
    return { success: true };
  } catch (err: any) {
    console.error('Database error in changePassword:', err);
    return { success: false, error: 'Database error occurred' };
  }
}

async function changePasswordWithHistory(userId, newPassword) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query<RowDataPacket[]>(
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
 * Get password history for a user
 * Returns array of password hashes
 */
export function getPasswordHistory(userId: number, limit = 10) {
  const stmt = db.prepare(`
    SELECT password_hash, changed_at FROM password_history 
    WHERE user_id = ?
    ORDER BY changed_at DESC
    LIMIT ?
  `);
  
  return stmt.all(userId, limit) as Array<{ password_hash: string; changed_at: string }>;
}

/**
 * Update point to dollar ratio (Admin/Sponsor only)
 */
export function updatePointRatio(userId: number, ratio: number) {
  const stmt = db.prepare(`
    UPDATE users 
    SET point_to_dollar_ratio = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  
  return stmt.run(ratio, userId);
}

/**
 * Clean up old password history (older than 2 years)
 */
export function cleanupOldPasswords() {
  const stmt = db.prepare(`
    DELETE FROM password_history
    WHERE changed_at < datetime('now', '-2 years')
  `);
  
  const result = stmt.run();
  console.log(`🧹 Cleaned up ${result.changes} old password records`);
  return result.changes;
}

export async function getAllUsersWithApps() {
  const query = `
    SELECT 
      u.UserID, 
      u.FirstName, 
      u.LastName, 
      u.Username, 
      u.UserType, 
      u.ProfilePicture,
      da.TimeSubmitted
    FROM USERS u
    LEFT JOIN DRIVER_APPLICATIONS da ON u.UserID = da.DriverID
    ORDER BY u.LastName ASC
  `;
  const stmt = db.prepare(query);
  return stmt.all(); 
}

// Based off performanceStatus enum
export async function getSponsorDriverReview(companyId: string) {
  const query = `
    SELECT 
      u.FirstName, 
      u.LastName, 
      d.PerformanceStatus,
      d.PointBalance
    FROM USERS u
    JOIN DRIVERS d ON u.UserID = d.UserID
    WHERE d.SponsorCompanyID = ?
    ORDER BY d.PerformanceStatus ASC; 
  `;

  // For your better-sqlite3 or mysql2 setup:
  const stmt = db.prepare(query);
  return stmt.all(companyId); 
}

export default db;