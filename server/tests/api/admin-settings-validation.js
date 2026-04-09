import assert from 'node:assert/strict';
import {
  DEFAULT_ADMIN_RETENTION_SETTINGS,
  normalizeAdminRetentionSettings,
  validateAdminRetentionSettings,
} from '../../src/utils/admin-settings.js';

function runValidationTests() {
  console.log('Starting admin settings validation unit tests...\n');

  const validNumbers = validateAdminRetentionSettings({
    auditLogRetentionDays: 365,
    userDataRetentionDays: 90,
  });
  assert.equal(validNumbers.ok, true, 'Expected numeric values to pass validation.');
  assert.deepEqual(validNumbers.value, {
    auditLogRetentionDays: 365,
    userDataRetentionDays: 90,
  });

  const validStrings = validateAdminRetentionSettings({
    auditLogRetentionDays: '730',
    userDataRetentionDays: '180',
  });
  assert.equal(validStrings.ok, true, 'Expected numeric strings to pass validation.');
  assert.deepEqual(validStrings.value, {
    auditLogRetentionDays: 730,
    userDataRetentionDays: 180,
  });

  const missingField = validateAdminRetentionSettings({
    auditLogRetentionDays: 365,
  });
  assert.equal(missingField.ok, false, 'Expected missing userDataRetentionDays to fail validation.');
  assert.match(missingField.error, /userDataRetentionDays/);

  const invalidType = validateAdminRetentionSettings({
    auditLogRetentionDays: 'NaN',
    userDataRetentionDays: 90,
  });
  assert.equal(invalidType.ok, false, 'Expected non-numeric string to fail validation.');
  assert.match(invalidType.error, /auditLogRetentionDays/);

  const invalidRange = validateAdminRetentionSettings({
    auditLogRetentionDays: 0,
    userDataRetentionDays: 90,
  });
  assert.equal(invalidRange.ok, false, 'Expected 0 days to fail minimum retention validation.');
  assert.match(invalidRange.error, /between/);

  const normalizedDefaults = normalizeAdminRetentionSettings({
    auditLogRetentionDays: -1,
    userDataRetentionDays: 'bad',
  });
  assert.deepEqual(
    normalizedDefaults,
    DEFAULT_ADMIN_RETENTION_SETTINGS,
    'Expected invalid persisted payload to fall back to defaults.'
  );

  console.log('All admin settings validation unit tests passed.');
}

try {
  runValidationTests();
  process.exit(0);
} catch (error) {
  console.error('Validation unit tests failed:', error.message);
  process.exit(1);
}
