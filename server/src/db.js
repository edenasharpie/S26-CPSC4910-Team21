import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

join(__dirname, '../../../fs-env');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
});

export { pool };

// Use named exports for ESM compatibility
export const query = async (sql, params) => {
  const [rows] = await pool.execute(sql, params);
  return { rows };
};

export const getUserById = async (id) => {
  // We cast dates to strings directly in SQL to prevent React hydration errors
  const [rows] = await pool.execute(
    `SELECT *, 
     DATE_FORMAT(LastLogin, '%Y-%m-%d %H:%i:%s') as LastLogin, 
     DATE_FORMAT(LastPasswordChange, '%Y-%m-%d %H:%i:%s') as LastPasswordChange 
     FROM USERS WHERE UserID = ?`, 
    [id]
  );
  return rows[0];
};

// In your server/src/db.js
export async function getAllUsers() {
  const [rows] = await pool.execute('SELECT * FROM USERS');
  return rows;
};

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
};

export { pool };