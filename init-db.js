// init-db.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

// Point this exactly to your fs-env file location
const envPath = 'C:/4910/fs-env';
dotenv.config({ path: envPath });

console.log("🔍 Checking Environment Variables...");
console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_USER:", process.env.DB_USER);

async function init() {
  // Create a local pool here to ensure it uses the newly loaded env variables
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
  });

  try {
    console.log("Connecting to RDS at:", process.env.DB_HOST);
    
    // 1. Create the table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) NOT NULL UNIQUE,
        displayName VARCHAR(255),
        email VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 2. Add a test user for the edit page (ID 1)
    await pool.execute(`
      INSERT IGNORE INTO users (id, username, displayName, email) 
      VALUES (1, 'admin_user', 'System Admin', 'admin@example.com')
    `);

    console.log("✅ Success! 'users' table created and test user ID: 1 added.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Database Error:", err.message);
    process.exit(1);
  }
}

init();