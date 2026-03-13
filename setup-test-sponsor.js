import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.fs-env');

dotenv.config({ path: envPath });

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
});

const testPassword = 'TestPassword123!';
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.createHash('sha256').update(salt + testPassword).digest('hex');
const passhash = `${salt}:${hash}`;

async function updateSponsor() {
  try {
    // Get a sponsor user
    const [sponsors] = await pool.execute(
      `SELECT u.UserID, u.Username, s.SponsorCompanyID 
       FROM USERS u 
       JOIN SPONSORS s ON u.UserID = s.UserID 
       WHERE u.UserType = 'sponsor' AND u.ActiveStatus = 1 
       LIMIT 1`
    );

    if (sponsors.length === 0) {
      console.log('No active sponsor users found');
      process.exit(0);
    }

    const sponsor = sponsors[0];
    console.log(`Found sponsor: ${sponsor.Username} (ID: ${sponsor.UserID})`);
    console.log(`Company ID: ${sponsor.SponsorCompanyID}`);

    // Update password
    await pool.execute(
      `UPDATE USERS SET PassHash = ? WHERE UserID = ?`,
      [passhash, sponsor.UserID]
    );

    console.log(`\nPassword updated successfully!`);
    console.log(`\nTest Credentials:`);
    console.log(`Username: ${sponsor.Username}`);
    console.log(`Password: ${testPassword}`);
    console.log(`\nYou can now login to the sponsor dashboard with these credentials.`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateSponsor();
