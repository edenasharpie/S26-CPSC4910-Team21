import axios from 'axios';
import {
  BASE_URL,
  closePool,
  createTestSponsor,
  createTestSponsorProfile,
  createTestUser,
  log,
} from '../setup.js';
import { pool } from '../../src/db.js';

const ADMIN_BULK_API_URL = `${BASE_URL}/api/admin/users/bulk-load`;
const SPONSOR_BULK_API_URL = `${BASE_URL}/api/sponsors`;

const createdUserIds = new Set();
const createdCompanyNames = new Set();
const createdSponsorCompanyIds = new Set();
const trackedEmails = new Set();

async function trackCreatedUsersByEmails(emails) {
  if (!Array.isArray(emails) || emails.length === 0) {
    return;
  }

  const connection = await pool.getConnection();
  try {
    for (const email of emails) {
      const [rows] = await connection.query('SELECT UserID FROM USERS WHERE Email = ?', [email]);
      if (rows[0]) {
        createdUserIds.add(Number(rows[0].UserID));
      }
    }
  } finally {
    connection.release();
  }
}

async function getDriverSnapshotByEmail(email) {
  const [rows] = await pool.query(
    `SELECT
       u.UserID,
       d.LicenseNumber,
       d.SponsorCompanyID,
       d.PointBalance
     FROM USERS u
     JOIN DRIVERS d ON d.UserID = u.UserID
     WHERE u.Email = ?
     LIMIT 1`,
    [email]
  );

  return rows[0] ?? null;
}

async function getLatestPointTransactionForDriver(licenseNumber) {
  const [rows] = await pool.query(
    `SELECT PointChange, ReasonForChange
     FROM POINT_TRANSACTIONS
     WHERE DriverID = ?
     ORDER BY TransactionID DESC
     LIMIT 1`,
    [licenseNumber]
  );

  return rows[0] ?? null;
}

async function cleanupUsers(userIds) {
  if (!userIds || userIds.size === 0) return;

  const connection = await pool.getConnection();
  try {
    for (const userId of userIds) {
      const [driverRows] = await connection.query(
        'SELECT LicenseNumber FROM DRIVERS WHERE UserID = ?',
        [userId]
      );

      for (const row of driverRows) {
        await connection.query('DELETE FROM POINT_TRANSACTIONS WHERE DriverID = ?', [row.LicenseNumber]);
      }

      await connection.query('DELETE FROM EVENTS WHERE UserID = ?', [userId]);
      try {
        await connection.query(
          'DELETE FROM DRIVER_COMPANY_ENROLLMENT WHERE DriverID IN (SELECT LicenseNumber FROM DRIVERS WHERE UserID = ?)',
          [userId]
        );
      } catch (error) {
        if (error?.code !== 'ER_NO_SUCH_TABLE' && error?.code !== 'ER_BAD_FIELD_ERROR') {
          throw error;
        }
      }
      await connection.query('DELETE FROM DRIVERS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM SPONSORS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM ADMINS WHERE UserID = ?', [userId]);
      await connection.query('DELETE FROM USERS WHERE UserID = ?', [userId]);
    }
  } catch (error) {
    console.error('Error cleaning up users:', error.message);
  } finally {
    connection.release();
  }
}

async function cleanupCompanies(companyIds, companyNames) {
  const connection = await pool.getConnection();
  try {
    for (const companyId of companyIds) {
      try {
        await connection.query('DELETE FROM DRIVER_COMPANY_ENROLLMENT WHERE SponsorCompanyID = ?', [companyId]);
      } catch (error) {
        if (error?.code !== 'ER_NO_SUCH_TABLE' && error?.code !== 'ER_BAD_FIELD_ERROR') {
          throw error;
        }
      }
      await connection.query('DELETE FROM SPONSOR_COMPANIES WHERE SponsorCompanyID = ?', [companyId]);
    }

    for (const companyName of companyNames) {
      try {
        await connection.query(
          'DELETE FROM DRIVER_COMPANY_ENROLLMENT WHERE SponsorCompanyID IN (SELECT SponsorCompanyID FROM SPONSOR_COMPANIES WHERE CompanyName = ?)',
          [companyName]
        );
      } catch (error) {
        if (error?.code !== 'ER_NO_SUCH_TABLE' && error?.code !== 'ER_BAD_FIELD_ERROR') {
          throw error;
        }
      }
      await connection.query('DELETE FROM SPONSOR_COMPANIES WHERE CompanyName = ?', [companyName]);
    }
  } catch (error) {
    console.error('Error cleaning up companies:', error.message);
  } finally {
    connection.release();
  }
}

async function runTests() {
  try {
    console.log('Starting bulk-load endpoint tests...\n');

    const suffix = String(Date.now());
    const adminOrgName = `BL_Admin_Org_${suffix}`;
    const sponsorCompanyName = `BL_Sponsor_Org_${suffix}`;

    createdCompanyNames.add(adminOrgName);
    createdCompanyNames.add(sponsorCompanyName);

    const requesterAdmin = await createTestUser({
      userType: 'admin',
      username: `bladmin_${suffix}`,
      email: `bladmin_${suffix}@e.co`,
      firstName: 'Bulk',
      lastName: 'Admin',
    });
    createdUserIds.add(requesterAdmin.userId);

    const sponsorCompanyId = await createTestSponsor({
      companyName: sponsorCompanyName,
      pointDollarValue: 0.01,
    });
    createdSponsorCompanyIds.add(sponsorCompanyId);

    const sponsorUser = await createTestUser({
      userType: 'sponsor',
      username: `blsponsor_${suffix}`,
      email: `blsponsor_${suffix}@e.co`,
      firstName: 'Bulk',
      lastName: 'Sponsor',
    });
    createdUserIds.add(sponsorUser.userId);

    await createTestSponsorProfile({
      userId: sponsorUser.userId,
      sponsorCompanyId,
    });

    const adminDriverEmail = `bl_admin_driver_${suffix}@e.co`;
    const adminSponsorEmail = `bl_admin_sponsor_${suffix}@e.co`;
    const sponsorDriverEmail = `bl_sponsor_driver_${suffix}@e.co`;
    const sponsorSponsorEmail = `bl_sponsor_user_${suffix}@e.co`;

    trackedEmails.add(adminDriverEmail);
    trackedEmails.add(adminSponsorEmail);
    trackedEmails.add(sponsorDriverEmail);
    trackedEmails.add(sponsorSponsorEmail);

    const adminContent = [
      `O|${adminOrgName}|||||`,
      `D|${adminOrgName}|Ada|Driver|${adminDriverEmail}|25|Safe miles`,
      `S|${adminOrgName}|Sam|Sponsor|${adminSponsorEmail}||`,
      `D|${adminOrgName}|No|Reason|noreason_${suffix}@e.co|10|`,
      `X|${adminOrgName}|Bad|Type|bad_${suffix}@e.co||`,
      `D|${adminOrgName}|Too|Many|many_${suffix}@e.co|1|Reason|EXTRA`,
    ].join('\n');

    log('TEST 1: Admin bulk-load processes valid lines and reports invalid lines', 'POST /api/admin/users/bulk-load');
    const adminBulkResponse = await axios.post(ADMIN_BULK_API_URL, {
      content: adminContent,
      requesterUserId: requesterAdmin.userId,
    });

    if (adminBulkResponse.status !== 200) {
      throw new Error(`Expected 200 from admin bulk-load, received ${adminBulkResponse.status}`);
    }

    const adminSummary = adminBulkResponse.data?.summary;
    if (!adminSummary) {
      throw new Error('Expected admin bulk-load summary payload.');
    }

    if (adminSummary.processed !== 6 || adminSummary.succeeded !== 3 || adminSummary.failed !== 3) {
      throw new Error(
        `Unexpected admin summary counts: processed=${adminSummary.processed}, succeeded=${adminSummary.succeeded}, failed=${adminSummary.failed}`
      );
    }

    if (adminSummary.createdOrganizations !== 1 || adminSummary.createdDrivers !== 1 || adminSummary.createdSponsors !== 1) {
      throw new Error('Unexpected admin createdOrganizations/createdDrivers/createdSponsors counts.');
    }

    if (adminSummary.pointsApplied !== 25) {
      throw new Error(`Expected admin pointsApplied=25, received ${adminSummary.pointsApplied}`);
    }

    await trackCreatedUsersByEmails([adminDriverEmail, adminSponsorEmail]);

    const adminDriverSnapshot = await getDriverSnapshotByEmail(adminDriverEmail);
    if (!adminDriverSnapshot) {
      throw new Error('Expected admin bulk-loaded driver to exist in DRIVERS.');
    }

    const adminDriverTx = await getLatestPointTransactionForDriver(adminDriverSnapshot.LicenseNumber);
    if (!adminDriverTx || Number(adminDriverTx.PointChange) !== 25 || adminDriverTx.ReasonForChange !== 'Safe miles') {
      throw new Error('Expected admin bulk-loaded driver point transaction to be persisted with reason.');
    }

    const sponsorContent = [
      `D||Spon|Driver|${sponsorDriverEmail}|12|Onboarding bonus`,
      `S||Spon|User|${sponsorSponsorEmail}||`,
      'O|NotAllowed|||||',
      `D|ShouldBeBlank|Bad|Org|badorg_${suffix}@e.co||`,
      `S||No|Points|sponpoints_${suffix}@e.co|1|Not allowed`,
      `D||No|Reason|noreason2_${suffix}@e.co|3|`,
    ].join('\n');

    log('TEST 2: Sponsor bulk-load enforces sponsor-specific constraints', 'POST /api/sponsors/:userId/bulk-load');
    const sponsorBulkResponse = await axios.post(
      `${SPONSOR_BULK_API_URL}/${sponsorUser.userId}/bulk-load`,
      { content: sponsorContent }
    );

    if (sponsorBulkResponse.status !== 200) {
      throw new Error(`Expected 200 from sponsor bulk-load, received ${sponsorBulkResponse.status}`);
    }

    const sponsorSummary = sponsorBulkResponse.data?.summary;
    if (!sponsorSummary) {
      throw new Error('Expected sponsor bulk-load summary payload.');
    }

    if (sponsorSummary.processed !== 6 || sponsorSummary.succeeded !== 2 || sponsorSummary.failed !== 4) {
      throw new Error(
        `Unexpected sponsor summary counts: processed=${sponsorSummary.processed}, succeeded=${sponsorSummary.succeeded}, failed=${sponsorSummary.failed}`
      );
    }

    if (sponsorSummary.createdDrivers !== 1 || sponsorSummary.createdSponsors !== 1) {
      throw new Error('Unexpected sponsor createdDrivers/createdSponsors counts.');
    }

    if (sponsorSummary.pointsApplied !== 12) {
      throw new Error(`Expected sponsor pointsApplied=12, received ${sponsorSummary.pointsApplied}`);
    }

    await trackCreatedUsersByEmails([sponsorDriverEmail, sponsorSponsorEmail]);

    const sponsorDriverSnapshot = await getDriverSnapshotByEmail(sponsorDriverEmail);
    if (!sponsorDriverSnapshot) {
      throw new Error('Expected sponsor bulk-loaded driver to exist in DRIVERS.');
    }

    if (Number(sponsorDriverSnapshot.SponsorCompanyID) !== Number(sponsorCompanyId)) {
      throw new Error('Expected sponsor bulk-loaded driver to be attached to sponsor company.');
    }

    const sponsorDriverTx = await getLatestPointTransactionForDriver(sponsorDriverSnapshot.LicenseNumber);
    if (!sponsorDriverTx || Number(sponsorDriverTx.PointChange) !== 12 || sponsorDriverTx.ReasonForChange !== 'Onboarding bonus') {
      throw new Error('Expected sponsor bulk-loaded driver point transaction to be persisted with reason.');
    }

    console.log('\nBulk-load endpoint tests completed successfully!');
  } catch (error) {
    console.error('\nBulk-load endpoint tests failed.');
    if (error?.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error?.message ?? error);
    }
    process.exitCode = 1;
  } finally {
    await trackCreatedUsersByEmails(Array.from(trackedEmails));
    await cleanupUsers(createdUserIds);
    await cleanupCompanies(createdSponsorCompanyIds, createdCompanyNames);
    await closePool();
    process.exit(process.exitCode ?? 0);
  }
}

runTests();
