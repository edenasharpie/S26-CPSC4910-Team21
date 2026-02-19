import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../..', 'fs-env') });

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

export const updateUser = async (id, data) => {
  const { displayName, email } = data;
  const [result] = await pool.execute(
    'UPDATE users SET displayName = ?, email = ? WHERE id = ?',
    [displayName, email, id]
  );
  return result;
};

export { pool };