import { pool, resolveAuditActorUserId } from '../db.js';
import { hashPassword } from '../utils/auth.js';

const BULK_USER_DEFAULT_PASSWORD = 'ChangeMe123!';
const USERNAME_MAX_LENGTH = 45;
const LINE_FIELD_COUNT = 7;

function normalizeLine(rawLine) {
  return typeof rawLine === 'string' ? rawLine.replace(/\r$/, '') : '';
}

function buildSummary() {
  return {
    processed: 0,
    succeeded: 0,
    failed: 0,
    createdUsers: 0,
    createdDrivers: 0,
    createdSponsors: 0,
    updatedUsers: 0,
    createdOrganizations: 0,
    pointsApplied: 0,
  };
}

function cleanField(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseRecord(rawLine, lineNumber) {
  const normalizedLine = normalizeLine(rawLine);
  const trimmedLine = normalizedLine.trim();
  if (!trimmedLine) {
    return null;
  }

  const parts = normalizedLine.split('|');
  if (parts.length > LINE_FIELD_COUNT) {
    throw new Error('Too many fields. Expected at most 7 pipe-delimited fields.');
  }

  while (parts.length < LINE_FIELD_COUNT) {
    parts.push('');
  }

  const [
    typeRaw,
    organizationNameRaw,
    firstNameRaw,
    lastNameRaw,
    emailRaw,
    pointsRaw,
    reasonRaw,
  ] = parts;

  return {
    lineNumber,
    rawLine: normalizedLine,
    type: cleanField(typeRaw).toUpperCase(),
    organizationName: cleanField(organizationNameRaw),
    firstName: cleanField(firstNameRaw),
    lastName: cleanField(lastNameRaw),
    email: cleanField(emailRaw),
    pointsRaw: cleanField(pointsRaw),
    reason: cleanField(reasonRaw),
  };
}

function parsePointsValue(pointsRaw) {
  if (!pointsRaw) {
    return null;
  }

  const parsed = Number(pointsRaw);
  if (!Number.isInteger(parsed)) {
    throw new Error('Points must be an integer value.');
  }

  return parsed;
}

function normalizeEmail(email) {
  return cleanField(email).toLowerCase();
}

function createBaseUsername(email) {
  const localPart = email.includes('@') ? email.split('@')[0] : email;
  const base = localPart
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, USERNAME_MAX_LENGTH);

  return base || `user${Date.now()}`;
}

async function usernameExists(connection, username) {
  const [rows] = await connection.execute(
    'SELECT UserID FROM USERS WHERE Username = ? LIMIT 1',
    [username]
  );
  return rows.length > 0;
}

async function buildUniqueUsername(connection, email) {
  const baseUsername = createBaseUsername(email);

  if (!(await usernameExists(connection, baseUsername))) {
    return baseUsername;
  }

  for (let suffix = 1; suffix <= 9999; suffix += 1) {
    const suffixText = String(suffix);
    const candidate = `${baseUsername.slice(0, USERNAME_MAX_LENGTH - suffixText.length)}${suffixText}`;
    if (!(await usernameExists(connection, candidate))) {
      return candidate;
    }
  }

  return `${baseUsername.slice(0, USERNAME_MAX_LENGTH - 6)}${Date.now().toString().slice(-6)}`;
}

async function getSponsorCompanyByName(connection, companyName) {
  const [rows] = await connection.execute(
    'SELECT SponsorCompanyID FROM SPONSOR_COMPANIES WHERE CompanyName = ? LIMIT 1',
    [companyName]
  );
  return rows[0] ?? null;
}

async function ensureSponsorCompany(connection, companyName) {
  const existing = await getSponsorCompanyByName(connection, companyName);
  if (existing) {
    return {
      sponsorCompanyId: Number(existing.SponsorCompanyID),
      created: false,
    };
  }

  const [insertResult] = await connection.execute(
    `INSERT INTO SPONSOR_COMPANIES (CompanyName, PointDollarValue, ContactInfo)
     VALUES (?, 0.01, ?)` ,
    [companyName, JSON.stringify({})]
  );

  return {
    sponsorCompanyId: Number(insertResult.insertId),
    created: true,
  };
}

async function resolveAdminCompany(connection, organizationName) {
  if (!organizationName) {
    throw new Error('Organization name is required for admin D/S records.');
  }

  const existing = await getSponsorCompanyByName(connection, organizationName);
  if (!existing) {
    throw new Error('Organization not found. Add an O record first or use an existing organization name.');
  }

  return Number(existing.SponsorCompanyID);
}

async function getUserByEmail(connection, email) {
  const [rows] = await connection.execute(
    `SELECT UserID, UserType
     FROM USERS
     WHERE Email = ?
     LIMIT 1`,
    [email]
  );
  return rows[0] ?? null;
}

async function getDriverByUserId(connection, userId) {
  const [rows] = await connection.execute(
    `SELECT LicenseNumber, SponsorCompanyID
     FROM DRIVERS
     WHERE UserID = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}

async function getSponsorByUserId(connection, userId) {
  const [rows] = await connection.execute(
    `SELECT SponsorCompanyID
     FROM SPONSORS
     WHERE UserID = ?
     LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}

async function generateUniqueLicenseNumber(connection, lineNumber) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const candidate = `BLK${Date.now().toString().slice(-8)}${lineNumber}${attempt}`.slice(0, 45);
    const [rows] = await connection.execute(
      'SELECT LicenseNumber FROM DRIVERS WHERE LicenseNumber = ? LIMIT 1',
      [candidate]
    );
    if (rows.length === 0) {
      return candidate;
    }
  }

  throw new Error('Unable to generate a unique driver license number.');
}

async function createUserRecord(connection, { firstName, lastName, email, userType }) {
  const username = await buildUniqueUsername(connection, email);
  const passHash = await hashPassword(BULK_USER_DEFAULT_PASSWORD);

  const [insertResult] = await connection.execute(
    `INSERT INTO USERS
      (Username, Email, PassHash, FirstName, LastName, UserType, ActiveStatus, LastLogin, LastPasswordChange, Permissions)
     VALUES (?, ?, ?, ?, ?, ?, 1, NOW(), NOW(), ?)` ,
    [username, email, passHash, firstName, lastName, userType, JSON.stringify({})]
  );

  return Number(insertResult.insertId);
}

async function createDriverProfile(connection, { userId, sponsorCompanyId, lineNumber }) {
  const licenseNumber = await generateUniqueLicenseNumber(connection, lineNumber);

  await connection.execute(
    `INSERT INTO DRIVERS
      (LicenseNumber, UserID, SponsorCompanyID, PointBalance, PerformanceStatus, AlertPoints, AlertOrders)
     VALUES (?, ?, ?, 0, 'good', 1, 1)` ,
    [licenseNumber, userId, sponsorCompanyId]
  );

  return licenseNumber;
}

async function createSponsorProfile(connection, { userId, sponsorCompanyId }) {
  await connection.execute(
    'INSERT INTO SPONSORS (UserID, SponsorCompanyID) VALUES (?, ?)',
    [userId, sponsorCompanyId]
  );
}

async function updateSponsorName(connection, userId, firstName, lastName) {
  await connection.execute(
    'UPDATE USERS SET FirstName = ?, LastName = ? WHERE UserID = ?',
    [firstName, lastName, userId]
  );
}

async function addDriverPointTransaction(connection, { driverUserId, pointChange, reason, actorUserId }) {
  if (pointChange === null) {
    return;
  }

  const [driverRows] = await connection.execute(
    'SELECT LicenseNumber FROM DRIVERS WHERE UserID = ? LIMIT 1',
    [driverUserId]
  );

  const driverRow = driverRows[0] ?? null;
  if (!driverRow) {
    throw new Error('Driver profile not found for point transaction.');
  }

  const effectiveActorUserId = await resolveAuditActorUserId(actorUserId);

  await connection.execute(
    `INSERT INTO POINT_TRANSACTIONS
      (DriverID, UserChanged, PointChange, ReasonForChange, TimeChanged)
     VALUES (?, ?, ?, ?, NOW())`,
    [driverRow.LicenseNumber, effectiveActorUserId, pointChange, reason]
  );

  await connection.execute(
    'UPDATE DRIVERS SET PointBalance = PointBalance + ? WHERE UserID = ?',
    [pointChange, driverUserId]
  );

  await connection.execute(
    `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
     VALUES (?, NOW(), 'PointTransaction', ?)`,
    [
      effectiveActorUserId,
      JSON.stringify({
        pointsDelta: Number(pointChange),
        reason: String(reason),
        driverId: String(driverRow.LicenseNumber),
        targetDriverUserId: Number(driverUserId),
      }),
    ]
  );
}

async function processOrganizationRecord(connection, record, summary) {
  if (!record.organizationName) {
    throw new Error('Organization records require an organization name.');
  }

  const company = await ensureSponsorCompany(connection, record.organizationName);
  if (company.created) {
    summary.createdOrganizations += 1;
  }

  return {
    message: company.created
      ? `Organization created (${record.organizationName}).`
      : `Organization already exists (${record.organizationName}).`,
  };
}

async function processDriverRecord(connection, record, context, summary) {
  if (!record.firstName || !record.lastName || !record.email) {
    throw new Error('Driver records require first name, last name, and email.');
  }

  const points = parsePointsValue(record.pointsRaw);
  if (points !== null && !record.reason) {
    throw new Error('Reason is required when points are provided.');
  }

  let targetCompanyId;
  if (context.mode === 'sponsor') {
    if (record.organizationName) {
      throw new Error('Sponsor uploads must leave organization name blank.');
    }
    targetCompanyId = context.sponsorCompanyId;
  } else {
    targetCompanyId = await resolveAdminCompany(connection, record.organizationName);
  }

  const normalizedEmail = normalizeEmail(record.email);
  const existingUser = await getUserByEmail(connection, normalizedEmail);

  if (!existingUser) {
    const newUserId = await createUserRecord(connection, {
      firstName: record.firstName,
      lastName: record.lastName,
      email: normalizedEmail,
      userType: 'driver',
    });

    await createDriverProfile(connection, {
      userId: newUserId,
      sponsorCompanyId: targetCompanyId,
      lineNumber: record.lineNumber,
    });

    summary.createdUsers += 1;
    summary.createdDrivers += 1;

    if (points !== null) {
      await addDriverPointTransaction(connection, {
        driverUserId: newUserId,
        pointChange: points,
        reason: record.reason,
        actorUserId: context.actorUserId,
      });
      summary.pointsApplied += points;
    }

    return {
      message: points !== null
        ? `Driver created and ${points} points applied.`
        : 'Driver created.',
    };
  }

  if (String(existingUser.UserType).toLowerCase() !== 'driver') {
    throw new Error('Email belongs to a non-driver account.');
  }

  const driverProfile = await getDriverByUserId(connection, existingUser.UserID);
  if (!driverProfile) {
    throw new Error('Existing driver account is missing a driver profile.');
  }

  if (Number(driverProfile.SponsorCompanyID) !== Number(targetCompanyId)) {
    throw new Error('Driver already belongs to a different organization.');
  }

  if (points !== null) {
    await addDriverPointTransaction(connection, {
      driverUserId: Number(existingUser.UserID),
      pointChange: points,
      reason: record.reason,
      actorUserId: context.actorUserId,
    });
    summary.pointsApplied += points;
  }

  summary.updatedUsers += 1;

  return {
    message: points !== null
      ? `Existing driver updated with ${points} points.`
      : 'Existing driver already present in organization.',
  };
}

async function processSponsorRecord(connection, record, context, summary) {
  if (!record.firstName || !record.lastName || !record.email) {
    throw new Error('Sponsor records require first name, last name, and email.');
  }

  if (record.pointsRaw || record.reason) {
    throw new Error('Sponsor records cannot include points or reason fields.');
  }

  let targetCompanyId;
  if (context.mode === 'sponsor') {
    if (record.organizationName) {
      throw new Error('Sponsor uploads must leave organization name blank.');
    }
    targetCompanyId = context.sponsorCompanyId;
  } else {
    targetCompanyId = await resolveAdminCompany(connection, record.organizationName);
  }

  const normalizedEmail = normalizeEmail(record.email);
  const existingUser = await getUserByEmail(connection, normalizedEmail);

  if (!existingUser) {
    const newUserId = await createUserRecord(connection, {
      firstName: record.firstName,
      lastName: record.lastName,
      email: normalizedEmail,
      userType: 'sponsor',
    });

    await createSponsorProfile(connection, {
      userId: newUserId,
      sponsorCompanyId: targetCompanyId,
    });

    summary.createdUsers += 1;
    summary.createdSponsors += 1;

    return {
      message: 'Sponsor user created.',
    };
  }

  if (String(existingUser.UserType).toLowerCase() !== 'sponsor') {
    throw new Error('Email belongs to a non-sponsor account.');
  }

  const sponsorProfile = await getSponsorByUserId(connection, existingUser.UserID);
  if (!sponsorProfile) {
    await createSponsorProfile(connection, {
      userId: Number(existingUser.UserID),
      sponsorCompanyId: targetCompanyId,
    });
  } else if (Number(sponsorProfile.SponsorCompanyID) !== Number(targetCompanyId)) {
    throw new Error('Sponsor already belongs to a different organization.');
  }

  await updateSponsorName(
    connection,
    Number(existingUser.UserID),
    record.firstName,
    record.lastName
  );

  summary.updatedUsers += 1;

  return {
    message: 'Existing sponsor user updated.',
  };
}

async function processRecord(connection, record, context, summary) {
  if (!['O', 'D', 'S'].includes(record.type)) {
    throw new Error('Type must be O, D, or S.');
  }

  if (context.mode === 'sponsor' && record.type === 'O') {
    throw new Error('Sponsor uploads cannot use type O records.');
  }

  if (record.type === 'O') {
    if (context.mode !== 'admin') {
      throw new Error('Organization records are only allowed for admin uploads.');
    }
    return processOrganizationRecord(connection, record, summary);
  }

  if (record.type === 'D') {
    return processDriverRecord(connection, record, context, summary);
  }

  return processSponsorRecord(connection, record, context, summary);
}

export async function processBulkLoadFile({
  content,
  mode,
  sponsorCompanyId = null,
  actorUserId = null,
}) {
  if (mode !== 'admin' && mode !== 'sponsor') {
    throw new Error('Invalid mode. Expected admin or sponsor.');
  }

  if (mode === 'sponsor' && !Number.isInteger(Number(sponsorCompanyId))) {
    throw new Error('Sponsor mode requires a valid sponsorCompanyId.');
  }

  const text = typeof content === 'string' ? content : '';
  const lines = text.split(/\n/);

  const summary = buildSummary();
  const results = [];
  const errors = [];

  const connection = await pool.getConnection();

  try {
    for (let index = 0; index < lines.length; index += 1) {
      const lineNumber = index + 1;

      let record;
      try {
        record = parseRecord(lines[index], lineNumber);
      } catch (error) {
        summary.processed += 1;
        summary.failed += 1;
        const message = error instanceof Error ? error.message : 'Unable to parse line.';
        errors.push({
          lineNumber,
          line: normalizeLine(lines[index]),
          message,
        });
        results.push({
          lineNumber,
          status: 'error',
          message,
        });
        continue;
      }

      if (!record) {
        continue;
      }

      summary.processed += 1;

      try {
        await connection.beginTransaction();

        const outcome = await processRecord(
          connection,
          record,
          {
            mode,
            sponsorCompanyId: Number(sponsorCompanyId),
            actorUserId,
          },
          summary
        );

        await connection.commit();

        summary.succeeded += 1;
        results.push({
          lineNumber,
          status: 'success',
          message: outcome.message,
        });
      } catch (error) {
        await connection.rollback();
        summary.failed += 1;

        const message = error instanceof Error ? error.message : 'Failed to process line.';
        errors.push({
          lineNumber,
          line: record.rawLine,
          message,
        });
        results.push({
          lineNumber,
          status: 'error',
          message,
        });
      }
    }
  } finally {
    connection.release();
  }

  return {
    mode,
    summary,
    results,
    errors,
  };
}