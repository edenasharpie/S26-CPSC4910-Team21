import {
  MAX_CATALOG_IMAGE_URL_LENGTH,
  validateCatalogImageUrl,
} from '../../src/utils/catalog-image-url.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runTests() {
  console.log('Starting catalog image URL validator unit tests...\n');

  console.log('TEST 1: valid https URL should pass...');
  const validResult = validateCatalogImageUrl('https://example.com/images/item.jpg', { required: true });
  assert(validResult.isValid, 'Expected valid https URL to pass validation.');
  assert(validResult.value === 'https://example.com/images/item.jpg', 'Expected validated URL to be preserved.');

  console.log('TEST 2: invalid URL format should fail...');
  const invalidFormatResult = validateCatalogImageUrl('not-a-url', { required: true });
  assert(!invalidFormatResult.isValid, 'Expected invalid URL format to fail validation.');

  console.log('TEST 3: unsupported protocol should fail...');
  const invalidProtocolResult = validateCatalogImageUrl('ftp://example.com/item.jpg', { required: true });
  assert(!invalidProtocolResult.isValid, 'Expected unsupported protocol to fail validation.');

  console.log('TEST 4: required imageUrl should reject empty values...');
  const requiredMissingResult = validateCatalogImageUrl('', { required: true });
  assert(!requiredMissingResult.isValid, 'Expected empty required imageUrl to fail validation.');

  console.log('TEST 5: optional imageUrl should allow undefined...');
  const optionalUndefinedResult = validateCatalogImageUrl(undefined, { required: false });
  assert(optionalUndefinedResult.isValid, 'Expected optional undefined imageUrl to pass validation.');

  console.log('TEST 6: max length boundary should pass at exactly 1000 chars...');
  const urlPrefix = 'https://example.com/';
  const maxLengthUrl = `${urlPrefix}${'a'.repeat(MAX_CATALOG_IMAGE_URL_LENGTH - urlPrefix.length)}`;
  assert(maxLengthUrl.length === MAX_CATALOG_IMAGE_URL_LENGTH, 'Expected max length URL to be exactly 1000 chars.');
  const atLimitResult = validateCatalogImageUrl(maxLengthUrl, { required: true });
  assert(atLimitResult.isValid, 'Expected imageUrl at max length to pass validation.');

  console.log('TEST 7: max length boundary should fail at 1001 chars...');
  const overLimitUrl = `${maxLengthUrl}a`;
  assert(overLimitUrl.length === MAX_CATALOG_IMAGE_URL_LENGTH + 1, 'Expected over-limit URL length to be 1001 chars.');
  const overLimitResult = validateCatalogImageUrl(overLimitUrl, { required: true });
  assert(!overLimitResult.isValid, 'Expected over-limit imageUrl to fail validation.');

  console.log('\nAll catalog image URL validator unit tests passed successfully.');
}

try {
  runTests();
  process.exit(0);
} catch (error) {
  console.error('\nCatalog image URL validator unit tests failed.');
  console.error('Error:', error.message);
  process.exit(1);
}
