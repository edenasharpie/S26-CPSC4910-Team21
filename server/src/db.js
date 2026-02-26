import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();
//dotenv.config({ path: path.resolve(process.cwd(), '../..', '.fs-env') });
dotenv.config({ path: resolve(__dirname, '../../.fs-env') });

console.log("Connecting to DB Host:", process.env.DB_HOST || "NOT FOUND");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000
});

// Use named exports for ESM compatibility
export const query = async (sql, params) => {
  const [rows] = await pool.execute(sql, params);
  return { rows };
};

// Example of the function your loader needs
export const getUserById = async (id) => {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0];
};

// In your server/src/db.js
export async function getAllUsers() {
  const [rows] = await pool.execute('SELECT * FROM users');
  return rows;
};

export async function updateUser(id, updates) {
  const { username, displayName, email, accountType, pointToDollarRatio } = updates;
  const [result] = await pool.execute(
    `UPDATE users 
     SET username = ?, displayName = ?, email = ?, accountType = ?, point_to_dollar_ratio = ? 
     WHERE id = ?`,
    [username, displayName, email, accountType, pointToDollarRatio, id]
  );
  return result;
};

export { pool };