import { pool } from '../src/db.js';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.fs-env' });

export const BASE_URL = `http://localhost:${process.env.PORT}`;

// Helper function to log test results
export function log(title, data) {
  console.log('\n' + '='.repeat(50));
  console.log(title);
  console.log('='.repeat(50));
  console.log(JSON.stringify(data, null, 2));
}

/**
 * creates a test sponsor company in the database
 * @param {Object} options - Configuration options
 * @param {string} options.companyName - Name of the sponsor company (default: 'Test Sponsor Company')
 * @param {number} options.pointDollarValue - Point to dollar conversion rate (default: 0.01)
 * @param {Object} options.contactInfo - Contact information object (default: test data)
 * @returns {Promise<number>} The ID of the created sponsor company
 */
export async function createTestSponsor(options = {}) {
  const {
    companyName = 'Test Sponsor Company',
    pointDollarValue = 0.01,
    contactInfo = {
      email: 'test@example.com',
      phone: '555-0123',
      address: '123 Test St'
    }
  } = options;

  const connection = await pool.getConnection();
  
  try {
    const contactInfoJson = JSON.stringify(contactInfo);
    
    const [sponsorResult] = await connection.query(
      'INSERT INTO SPONSOR_COMPANIES (CompanyName, PointDollarValue, ContactInfo) VALUES (?, ?, ?)',
      [companyName, pointDollarValue, contactInfoJson]
    );
    
    return sponsorResult.insertId;
  } finally {
    connection.release();
  }
}

/**
 * Deletes sponsor companies from the database
 * @param {number[]} sponsorIds - Array of sponsor company IDs to delete
 * @returns {Promise<void>}
 */
export async function cleanupSponsorCompanies(sponsorIds) {
  if (!sponsorIds || sponsorIds.length === 0) {
    return;
  }

  const connection = await pool.getConnection();
  
  try {
    for (const id of sponsorIds) {
      await connection.query('DELETE FROM SPONSOR_COMPANIES WHERE SponsorCompanyID = ?', [id]);
      console.log(`Deleted sponsor company ${id}`);
    }
  } catch (error) {
    console.error('Error cleaning up sponsor companies:', error.message);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Closes the database pool connection
 * Should be called at the end of tests
 * @returns {Promise<void>}
 */
export async function closePool() {
  await pool.end();
}
