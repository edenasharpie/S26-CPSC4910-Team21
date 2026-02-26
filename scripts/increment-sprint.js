#!/usr/bin/env node

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../.fs-env');

// create database connection
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function incrementSprint() {
  let connection;
  
  try {
    connection = await pool.getConnection();

    // get current version
    const [currentRows] = await connection.query('SELECT Version, ReleaseDate FROM METADATA LIMIT 1');
    
    if (currentRows.length === 0) {
      console.error('No metadata record found in METADATA table');
      process.exit(1);
    }

    const currentVersion = currentRows[0].Version;
    const currentDate = currentRows[0].ReleaseDate;
    
    console.log('Current sprint information:');
    console.log(`  Version: ${currentVersion}`);
    console.log(`  Release Date: ${currentDate}`);
    console.log('');

    // increment version and update release date
    const newVersion = currentVersion + 1;
    const newDate = new Date();
    
    await connection.query(
      'UPDATE METADATA SET Version = ?, ReleaseDate = ?',
      [newVersion, newDate]
    );

    console.log('New sprint information:');
    console.log(`  Version: ${newVersion}`);
    console.log(`  Release Date: ${newDate.toISOString().slice(0, 19).replace('T', ' ')}`);

  } catch (error) {
    console.error('Error incrementing sprint:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
    await pool.end();
  }
}

incrementSprint();
