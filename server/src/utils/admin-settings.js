export const DEFAULT_ADMIN_RETENTION_SETTINGS = Object.freeze({
  auditLogRetentionDays: 365,
  userDataRetentionDays: 90,
});

export const ADMIN_RETENTION_SETTINGS_LIMITS = Object.freeze({
  minDays: 1,
  maxDays: 9999,
});

function parseIntegerValue(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      return null;
    }

    const parsed = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  return null;
}

function isWithinRetentionRange(value) {
  return value >= ADMIN_RETENTION_SETTINGS_LIMITS.minDays && value <= ADMIN_RETENTION_SETTINGS_LIMITS.maxDays;
}

export function validateAdminRetentionSettings(rawSettings) {
  const auditLogRetentionDays = parseIntegerValue(rawSettings?.auditLogRetentionDays);
  const userDataRetentionDays = parseIntegerValue(rawSettings?.userDataRetentionDays);

  if (auditLogRetentionDays === null) {
    return {
      ok: false,
      error: 'auditLogRetentionDays must be an integer.',
    };
  }

  if (userDataRetentionDays === null) {
    return {
      ok: false,
      error: 'userDataRetentionDays must be an integer.',
    };
  }

  if (!isWithinRetentionRange(auditLogRetentionDays)) {
    return {
      ok: false,
      error: `auditLogRetentionDays must be between ${ADMIN_RETENTION_SETTINGS_LIMITS.minDays} and ${ADMIN_RETENTION_SETTINGS_LIMITS.maxDays}.`,
    };
  }

  if (!isWithinRetentionRange(userDataRetentionDays)) {
    return {
      ok: false,
      error: `userDataRetentionDays must be between ${ADMIN_RETENTION_SETTINGS_LIMITS.minDays} and ${ADMIN_RETENTION_SETTINGS_LIMITS.maxDays}.`,
    };
  }

  return {
    ok: true,
    value: {
      auditLogRetentionDays,
      userDataRetentionDays,
    },
  };
}

export function normalizeAdminRetentionSettings(rawSettings) {
  const validated = validateAdminRetentionSettings(rawSettings);
  if (validated.ok) {
    return validated.value;
  }

  return { ...DEFAULT_ADMIN_RETENTION_SETTINGS };
}
