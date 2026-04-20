import assert from 'node:assert/strict';
import {
  normalizeCommentPayload,
  normalizeDraftPayload,
} from '../../src/services/review-interactions-service.js';

function runNormalizeDraftPayloadTests() {
  const valid = normalizeDraftPayload(' Draft body ', 5);
  assert.equal(valid.error, undefined, 'Expected valid draft payload to have no error');
  assert.equal(valid.body, 'Draft body', 'Expected draft body to be trimmed');
  assert.equal(valid.rating, 5, 'Expected draft rating to be preserved');

  const missingBody = normalizeDraftPayload('', 5);
  assert.equal(missingBody.error, 'body is required');

  const invalidRating = normalizeDraftPayload('Body', 9);
  assert.equal(invalidRating.error, 'rating must be an integer between 1 and 5');

  const oversizedBody = normalizeDraftPayload('x'.repeat(1001), 5);
  assert.equal(oversizedBody.error, 'body must be 1000 characters or fewer');
}

function runNormalizeCommentPayloadTests() {
  const validTopLevel = normalizeCommentPayload(' First comment ', null);
  assert.equal(validTopLevel.error, undefined, 'Expected valid comment payload to have no error');
  assert.equal(validTopLevel.text, 'First comment', 'Expected comment text to be trimmed');
  assert.equal(validTopLevel.parentCommentId, null, 'Expected top-level comment parent to be null');

  const validReply = normalizeCommentPayload('Reply text', 77);
  assert.equal(validReply.error, undefined, 'Expected valid reply payload to have no error');
  assert.equal(validReply.parentCommentId, 77, 'Expected numeric parent comment id to be preserved');

  const missingText = normalizeCommentPayload('  ', null);
  assert.equal(missingText.error, 'text is required');

  const invalidParent = normalizeCommentPayload('Reply', -1);
  assert.equal(invalidParent.error, 'parentCommentId must be a positive integer when provided');

  const oversizedComment = normalizeCommentPayload('x'.repeat(1001), null);
  assert.equal(oversizedComment.error, 'text must be 1000 characters or fewer');
}

function runTests() {
  runNormalizeDraftPayloadTests();
  runNormalizeCommentPayloadTests();
  console.log('Review interaction service unit tests completed successfully.');
}

runTests();
