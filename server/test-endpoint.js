import { pool } from './src/db.js';

async function test() {
  try {
    console.log('Testing API endpoint logic...');
    
    const userId = 123456915;
    const driverId = 123456811;
    
    // Simulate what the endpoint does
    const [sponsorRows] = await pool.execute(
      `SELECT sc.SponsorCompanyID
       FROM SPONSORS s
       JOIN SPONSOR_COMPANIES sc ON s.SponsorCompanyID = sc.SponsorCompanyID
       WHERE s.UserID = ?`,
      [userId]
    );
    
    console.log('Sponsor rows:', sponsorRows);
    
    if (sponsorRows.length === 0) {
      console.log('No sponsor found for userId', userId);
      process.exit(1);
    }
    
    const companyId = sponsorRows[0].SponsorCompanyID;
    console.log('Company ID:', companyId);
    
    // Get the driver
    const [drivers] = await pool.execute(
      `SELECT
         u.UserID, u.FirstName, u.LastName, u.Username, u.Email, u.Phone,
         d.PerformanceStatus, d.PointBalance, u.ActiveStatus
       FROM USERS u
       JOIN DRIVERS d ON u.UserID = d.UserID
       WHERE u.UserID = ? AND d.SponsorCompanyID = ?`,
      [driverId, companyId]
    );
    
    console.log('Driver rows:', drivers);
    
    if (drivers.length === 0) {
      console.log('Driver not found for this sponsor');
      process.exit(1);
    }
    
    console.log('SUCCESS - driver found:');
    console.log(drivers[0]);
    
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
}

test();
