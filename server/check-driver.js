import { pool } from './src/db.js';
async function check() {
  try {
    const [driver] = await pool.execute(
      `SELECT u.UserID, u.FirstName, u.LastName, d.SponsorCompanyID, sc.CompanyName
       FROM USERS u
       JOIN DRIVERS d ON u.UserID = d.UserID
       LEFT JOIN SPONSOR_COMPANIES sc ON d.SponsorCompanyID = sc.SponsorCompanyID
       WHERE u.UserID = ?`,
      [123456811]
    );
    console.log('Driver info:', driver);
    
    // Also check sponsor user 1
    const [sponsor] = await pool.execute(
      `SELECT s.SponsorID, s.UserID, s.SponsorCompanyID, sc.CompanyName
       FROM SPONSORS s
       JOIN SPONSOR_COMPANIES sc ON s.SponsorCompanyID = sc.SponsorCompanyID
       WHERE s.UserID = ?`,
      [1]
    );
    console.log('Sponsor user 1:', sponsor);
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}
check();
