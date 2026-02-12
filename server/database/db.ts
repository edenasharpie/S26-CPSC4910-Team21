// server/database/db.ts
// Database connection and helper functions

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create/connect to database
const db = new Database(join(__dirname, 'fleetscore.db'));

// Enable foreign keys (important for data integrity)
db.pragma('foreign_keys = ON');

/**
 * Initialize the database with schema
 */
export function initializeDatabase() {
  console.log('📊 Initializing database...');
  
  // Read and execute the schema file
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  
  db.exec(schema);
  
  console.log('✅ Database initialized successfully!');
  console.log('📝 Tables created: users, password_history');
}

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

export default db;