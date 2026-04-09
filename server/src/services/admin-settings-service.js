import { pool, resolveAuditActorUserId } from '../db.js';
import { DEFAULT_ADMIN_RETENTION_SETTINGS, normalizeAdminRetentionSettings } from '../utils/admin-settings.js';

export const ADMIN_SETTINGS_EVENT_TYPE = 'SystemSettingsUpdate';

function parsePropertiesValue(rawProperties) {
  if (!rawProperties) {
    return null;
  }

  if (typeof rawProperties === 'object') {
    return rawProperties;
  }

  if (typeof rawProperties !== 'string') {
    return null;
  }

  try {
    return JSON.parse(rawProperties);
  } catch {
    return null;
  }
}

export async function getSystemAdminRetentionSettings() {
  const [rows] = await pool.execute(
    `SELECT Properties
     FROM EVENTS
     WHERE EventType = ?
     ORDER BY EventID DESC
     LIMIT 1`,
    [ADMIN_SETTINGS_EVENT_TYPE]
  );

  if (rows.length === 0) {
    return { ...DEFAULT_ADMIN_RETENTION_SETTINGS };
  }

  const properties = parsePropertiesValue(rows[0].Properties);
  return normalizeAdminRetentionSettings(properties);
}

export async function saveSystemAdminRetentionSettings(settings, actorUserId = null) {
  const effectiveActorUserId = await resolveAuditActorUserId(actorUserId);
  const properties = JSON.stringify({
    auditLogRetentionDays: settings.auditLogRetentionDays,
    userDataRetentionDays: settings.userDataRetentionDays,
  });

  await pool.execute(
    'INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties) VALUES (?, NOW(), ?, ?)',
    [effectiveActorUserId, ADMIN_SETTINGS_EVENT_TYPE, properties]
  );

  return {
    auditLogRetentionDays: settings.auditLogRetentionDays,
    userDataRetentionDays: settings.userDataRetentionDays,
  };
}
