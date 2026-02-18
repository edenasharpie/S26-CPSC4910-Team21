import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

// Use path.join with '..' to step out of the project folder into C:\4910\
const envPath = path.join(process.cwd(), '../..', '.env');

// This log will now help you verify the fix in the terminal
console.log("🔍 Final Path Check:", envPath);

const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error("❌ Still cannot find .env at:", envPath);
} else {
  console.log("✅ Success! .env loaded from parent directory.");
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  // Increase connection timeout to 30 seconds for remote stability
  connectTimeout: 30000 
});

// Using the named export to fix the "is not a function" error
export async function getUserById(id) {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0];
}

export { pool };