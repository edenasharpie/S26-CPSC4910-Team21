import assert from 'node:assert/strict';
import { closePool } from '../setup.js';
import {
  normalizeContent,
  serializeProperties,
} from '../../src/services/notification-service.js';

function runAssertions() {
  const normalizedLineBreaks = normalizeContent('Hello\n\nworld\tfrom\r\nFleetScore');
  assert.equal(normalizedLineBreaks, 'Hello world from FleetScore');

  const normalizedSpaces = normalizeContent('   many    spaces   here   ');
  assert.equal(normalizedSpaces, 'many spaces here');

  const nonStringContent = normalizeContent(null);
  assert.equal(nonStringContent, '');

  const longInput = `X${'a'.repeat(500)}`;
  const truncated = normalizeContent(longInput);
  assert.equal(truncated.length, 280);

  const serializedDefaultCategory = JSON.parse(serializeProperties('Example', '', '42', {
    applicationId: 21,
    hidden: undefined,
  }));

  assert.equal(serializedDefaultCategory.category, 'general');
  assert.equal(serializedDefaultCategory.actorUserId, 42);
  assert.equal(serializedDefaultCategory.content, 'Example');
  assert.equal(serializedDefaultCategory.applicationId, 21);
  assert.equal(Object.prototype.hasOwnProperty.call(serializedDefaultCategory, 'hidden'), false);

  const serializedCategory = JSON.parse(serializeProperties('Order updated', 'driver_order_status_changed', null, {
    oldStatus: 'confirmed',
    newStatus: 'shipped',
  }));

  assert.equal(serializedCategory.category, 'driver_order_status_changed');
  assert.equal(serializedCategory.actorUserId, null);
  assert.equal(serializedCategory.oldStatus, 'confirmed');
  assert.equal(serializedCategory.newStatus, 'shipped');

  const serializedHiddenMetadata = JSON.parse(serializeProperties('Dismissed notification', 'general', null, {
    hiddenAt: '2026-04-16 11:45:00',
    hiddenByAction: 'single',
    readAt: undefined,
  }));

  assert.equal(serializedHiddenMetadata.hiddenAt, '2026-04-16 11:45:00');
  assert.equal(serializedHiddenMetadata.hiddenByAction, 'single');
  assert.equal(Object.prototype.hasOwnProperty.call(serializedHiddenMetadata, 'readAt'), false);
}

async function runTests() {
  try {
    console.log('Starting notification content censoring tests...\n');
    runAssertions();
    console.log('Notification content censoring tests completed successfully!');
  } catch (error) {
    console.error('Notification content censoring tests failed:', error);
    process.exitCode = 1;
  } finally {
    await closePool();
    process.exit(process.exitCode ?? 0);
  }
}

runTests();
