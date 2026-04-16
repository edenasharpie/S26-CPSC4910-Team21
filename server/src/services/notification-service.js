import { resolveAuditActorUserId } from '../db.js';

const MAX_CONTENT_LENGTH = 280;
const DEFAULT_NOTIFICATION_LIMIT = 20;
const MAX_NOTIFICATION_LIMIT = 100;

export function normalizeContent(content) {
  if (typeof content !== 'string') {
    return '';
  }

  return content
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, MAX_CONTENT_LENGTH);
}

export function serializeProperties(content, category, actorUserId, metadata = {}) {
  const normalizedContent = normalizeContent(content);
  const parsedActorUserId =
    actorUserId === null || actorUserId === undefined || actorUserId === ''
      ? null
      : Number(actorUserId);

  const properties = {
    content: normalizedContent,
    category: typeof category === 'string' && category.trim() ? category.trim() : 'general',
    actorUserId: Number.isInteger(parsedActorUserId) ? parsedActorUserId : null,
  };

  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) {
      properties[key] = value;
    }
  }

  return JSON.stringify(properties);
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function clampNotificationLimit(limit) {
  const parsedLimit = parseInteger(limit, DEFAULT_NOTIFICATION_LIMIT);
  if (parsedLimit <= 0) {
    return DEFAULT_NOTIFICATION_LIMIT;
  }
  return Math.min(parsedLimit, MAX_NOTIFICATION_LIMIT);
}

function normalizeOffset(offset) {
  const parsedOffset = parseInteger(offset, 0);
  return parsedOffset < 0 ? 0 : parsedOffset;
}

function parseBooleanFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function parseProperties(rawProperties) {
  if (!rawProperties) return {};
  if (typeof rawProperties === 'object') return rawProperties;
  try {
    return JSON.parse(rawProperties);
  } catch {
    return {};
  }
}

function normalizeCategory(category) {
  if (typeof category !== 'string') return null;
  const normalized = category.trim();
  return normalized ? normalized : null;
}

function buildNotificationListWhereClause(userId, category, unreadOnly) {
  const whereClauses = ['e.UserID = ?', `e.EventType = 'Notification'`];
  const params = [userId];

  if (category) {
    whereClauses.push(`JSON_UNQUOTE(JSON_EXTRACT(e.Properties, '$.category')) = ?`);
    params.push(category);
  }

  if (unreadOnly) {
    whereClauses.push(`JSON_EXTRACT(COALESCE(e.Properties, JSON_OBJECT()), '$.readAt') IS NULL`);
  }

  return {
    whereSql: whereClauses.join(' AND '),
    params,
  };
}

function toNotificationDto(row) {
  const properties = parseProperties(row.Properties);
  const content = typeof properties.content === 'string' ? properties.content : '';
  const category = typeof properties.category === 'string' && properties.category.trim()
    ? properties.category.trim()
    : 'general';
  const actorUserId = Number.isInteger(Number(properties.actorUserId))
    ? Number(properties.actorUserId)
    : null;
  const readAt = typeof properties.readAt === 'string' && properties.readAt.trim()
    ? properties.readAt.trim()
    : null;

  return {
    notificationId: Number(row.EventID),
    timestamp: row.Timestamp,
    content,
    category,
    actorUserId,
    readAt,
    properties,
  };
}

export async function listNotificationsForUser(connection, userId, options = {}) {
  const parsedUserId = Number(userId);
  if (!Number.isInteger(parsedUserId)) {
    throw new Error('listNotificationsForUser requires an integer userId');
  }

  const limit = clampNotificationLimit(options.limit);
  const offset = normalizeOffset(options.offset);
  const category = normalizeCategory(options.category);
  const unreadOnly = parseBooleanFlag(options.unreadOnly);

  const { whereSql, params } = buildNotificationListWhereClause(parsedUserId, category, unreadOnly);

  const [rows] = await connection.query(
    `SELECT
       e.EventID,
       DATE_FORMAT(e.Timestamp, '%Y-%m-%d %H:%i:%s') AS Timestamp,
       e.Properties
     FROM EVENTS e
     WHERE ${whereSql}
     ORDER BY e.Timestamp DESC, e.EventID DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [countRows] = await connection.query(
    `SELECT COUNT(*) AS totalCount
     FROM EVENTS e
     WHERE ${whereSql}`,
    params
  );

  const [unreadCountRows] = await connection.query(
    `SELECT COUNT(*) AS unreadCount
     FROM EVENTS e
     WHERE ${whereSql}
       AND JSON_EXTRACT(COALESCE(e.Properties, JSON_OBJECT()), '$.readAt') IS NULL`,
    params
  );

  return {
    notifications: rows.map(toNotificationDto),
    totalCount: Number(countRows[0]?.totalCount ?? 0),
    unreadCount: Number(unreadCountRows[0]?.unreadCount ?? 0),
    limit,
    offset,
  };
}

export async function markNotificationRead(connection, userId, notificationId) {
  const parsedUserId = Number(userId);
  const parsedNotificationId = Number(notificationId);

  if (!Number.isInteger(parsedUserId) || !Number.isInteger(parsedNotificationId)) {
    throw new Error('markNotificationRead requires integer userId and notificationId');
  }

  const [existingRows] = await connection.execute(
    `SELECT EventID
     FROM EVENTS
     WHERE EventID = ? AND UserID = ? AND EventType = 'Notification'
     LIMIT 1`,
    [parsedNotificationId, parsedUserId]
  );

  if (existingRows.length === 0) {
    return { found: false, updated: false };
  }

  const [updateResult] = await connection.execute(
    `UPDATE EVENTS
     SET Properties = JSON_SET(
       COALESCE(Properties, JSON_OBJECT()),
       '$.readAt', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'),
       '$.readByAction', 'single'
     )
     WHERE EventID = ?
       AND UserID = ?
       AND EventType = 'Notification'
       AND JSON_EXTRACT(COALESCE(Properties, JSON_OBJECT()), '$.readAt') IS NULL`,
    [parsedNotificationId, parsedUserId]
  );

  return {
    found: true,
    updated: Number(updateResult.affectedRows) > 0,
  };
}

export async function markAllNotificationsRead(connection, userId, options = {}) {
  const parsedUserId = Number(userId);
  if (!Number.isInteger(parsedUserId)) {
    throw new Error('markAllNotificationsRead requires an integer userId');
  }

  const category = normalizeCategory(options.category);
  const whereClauses = ['UserID = ?', `EventType = 'Notification'`];
  const params = [parsedUserId];

  if (category) {
    whereClauses.push(`JSON_UNQUOTE(JSON_EXTRACT(Properties, '$.category')) = ?`);
    params.push(category);
  }

  whereClauses.push(`JSON_EXTRACT(COALESCE(Properties, JSON_OBJECT()), '$.readAt') IS NULL`);

  const [updateResult] = await connection.execute(
    `UPDATE EVENTS
     SET Properties = JSON_SET(
       COALESCE(Properties, JSON_OBJECT()),
       '$.readAt', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'),
       '$.readByAction', 'all'
     )
     WHERE ${whereClauses.join(' AND ')}`,
    params
  );

  return {
    updatedCount: Number(updateResult.affectedRows ?? 0),
  };
}

export async function insertNotificationEvent(connection, {
  recipientUserId,
  actorUserId = null,
  content,
  category = 'general',
  metadata = {},
}) {
  const parsedRecipientId = Number(recipientUserId);
  if (!Number.isInteger(parsedRecipientId)) {
    throw new Error('insertNotificationEvent requires an integer recipientUserId');
  }

  const effectiveActorUserId = await resolveAuditActorUserId(actorUserId);
  const properties = serializeProperties(content, category, effectiveActorUserId, metadata);

  await connection.execute(
    `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
     VALUES (?, NOW(), 'Notification', ?)`,
    [parsedRecipientId, properties]
  );
}

export async function insertPointTransactionEvent(connection, {
  actorUserId = null,
  pointsDelta,
  reason,
  driverLicenseNumber,
  targetDriverUserId,
  transactionId = null,
  updated = false,
}) {
  const effectiveActorUserId = await resolveAuditActorUserId(actorUserId);

  await connection.execute(
    `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
     VALUES (?, NOW(), 'PointTransaction', ?)`,
    [
      effectiveActorUserId,
      JSON.stringify({
        pointsDelta: Number(pointsDelta),
        reason: String(reason),
        driverId: String(driverLicenseNumber),
        targetDriverUserId: Number(targetDriverUserId),
        transactionId: transactionId === null ? null : Number(transactionId),
        updated: Boolean(updated),
      }),
    ]
  );
}

export async function getActiveSponsorRecipientUserIds(connection, sponsorCompanyId) {
  const parsedCompanyId = Number(sponsorCompanyId);
  if (!Number.isInteger(parsedCompanyId)) {
    return [];
  }

  const [rows] = await connection.execute(
    `SELECT s.UserID
     FROM SPONSORS s
     JOIN USERS u ON u.UserID = s.UserID
     WHERE s.SponsorCompanyID = ?
       AND u.ActiveStatus = 1`,
    [parsedCompanyId]
  );

  return rows
    .map((row) => Number(row.UserID))
    .filter((userId) => Number.isInteger(userId));
}

export async function notifySponsorCompany(connection, {
  sponsorCompanyId,
  actorUserId = null,
  content,
  category,
  metadata = {},
}) {
  const recipientUserIds = await getActiveSponsorRecipientUserIds(connection, sponsorCompanyId);

  for (const recipientUserId of recipientUserIds) {
    await insertNotificationEvent(connection, {
      recipientUserId,
      actorUserId,
      content,
      category,
      metadata,
    });
  }

  return recipientUserIds.length;
}

export async function getDriverNotificationContextByUserId(connection, driverUserId) {
  const parsedDriverUserId = Number(driverUserId);
  if (!Number.isInteger(parsedDriverUserId)) {
    return null;
  }

  const [rows] = await connection.execute(
    `SELECT d.UserID, d.LicenseNumber, d.SponsorCompanyID, d.AlertPoints, d.AlertOrders, u.ActiveStatus
     FROM DRIVERS d
     JOIN USERS u ON u.UserID = d.UserID
     WHERE d.UserID = ?
     LIMIT 1`,
    [parsedDriverUserId]
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    userId: Number(rows[0].UserID),
    licenseNumber: rows[0].LicenseNumber,
    sponsorCompanyId: rows[0].SponsorCompanyID === null ? null : Number(rows[0].SponsorCompanyID),
    alertPoints: Boolean(rows[0].AlertPoints),
    alertOrders: Boolean(rows[0].AlertOrders),
    isActive: Boolean(rows[0].ActiveStatus),
  };
}

export async function getDriverNotificationContextByLicense(connection, licenseNumber) {
  const normalizedLicense = typeof licenseNumber === 'string' ? licenseNumber.trim() : '';
  if (!normalizedLicense) {
    return null;
  }

  const [rows] = await connection.execute(
    `SELECT d.UserID, d.LicenseNumber, d.SponsorCompanyID, d.AlertPoints, d.AlertOrders, u.ActiveStatus
     FROM DRIVERS d
     JOIN USERS u ON u.UserID = d.UserID
     WHERE d.LicenseNumber = ?
     LIMIT 1`,
    [normalizedLicense]
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    userId: Number(rows[0].UserID),
    licenseNumber: rows[0].LicenseNumber,
    sponsorCompanyId: rows[0].SponsorCompanyID === null ? null : Number(rows[0].SponsorCompanyID),
    alertPoints: Boolean(rows[0].AlertPoints),
    alertOrders: Boolean(rows[0].AlertOrders),
    isActive: Boolean(rows[0].ActiveStatus),
  };
}

export async function notifyDriver(connection, {
  driverContext,
  actorUserId = null,
  content,
  category,
  metadata = {},
  preference = 'none',
  force = false,
}) {
  if (!driverContext || !Number.isInteger(Number(driverContext.userId))) {
    return false;
  }

  if (!driverContext.isActive) {
    return false;
  }

  const shouldSend =
    force ||
    preference === 'none' ||
    (preference === 'points' && driverContext.alertPoints) ||
    (preference === 'orders' && driverContext.alertOrders);

  if (!shouldSend) {
    return false;
  }

  await insertNotificationEvent(connection, {
    recipientUserId: driverContext.userId,
    actorUserId,
    content,
    category,
    metadata,
  });

  return true;
}
