import { pool } from './src/db.js';
async function check() {
  try {
    const [sponsors] = await pool.execute(
      `SELECT s.SponsorID, s.UserID, u.FirstName, u.LastName, u.Username, s.SponsorCompanyID, sc.CompanyName
       FROM SPONSORS s
       JOIN USERS u ON s.UserID = u.UserID
       JOIN SPONSOR_COMPANIES sc ON s.SponsorCompanyID = sc.SponsorCompanyID
       LIMIT 10`
    );
    console.log('Sponsors:');
    console.log(sponsors);
    
    // Check what companies have drivers
    const [companies] = await pool.execute(
      `SELECT DISTINCT sc.SponsorCompanyID, sc.CompanyName, COUNT(d.UserID) as DriverCount
       FROM SPONSOR_COMPANIES sc
       LEFT JOIN DRIVERS d ON sc.SponsorCompanyID = d.SponsorCompanyID
       GROUP BY sc.SponsorCompanyID, sc.CompanyName
       ORDER BY DriverCount DESC`
    );
    console.log('\nCompanies with driver counts:');
    console.log(companies);
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}
check();
