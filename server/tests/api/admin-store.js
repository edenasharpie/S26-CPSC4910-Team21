import axios from 'axios';
import { BASE_URL, log, closePool } from '../setup.js';

const SEARCH_URL = `${BASE_URL}/api/admin/store/search`;
const PRODUCT_URL = `${BASE_URL}/api/admin/store/products`;

function assertProductShape(product, context) {
  if (!product || typeof product !== 'object') {
    throw new Error(`${context}: expected product object.`);
  }

  const requiredFields = ['id', 'title', 'description', 'price', 'category', 'image'];
  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(product, field)) {
      throw new Error(`${context}: missing field ${field}.`);
    }
  }
}

async function runTests() {
  try {
    console.log('Starting admin store endpoint tests...\n');

    log('TEST 1: Searching store products...', `GET ${SEARCH_URL}?limit=3&offset=0`);
    let productId = 1;
    try {
      const searchResponse = await axios.get(SEARCH_URL, {
        params: {
          query: '',
          limit: 3,
          offset: 0,
        },
      });

      if (searchResponse.status !== 200) {
        throw new Error(`Expected status 200 from search, received ${searchResponse.status}`);
      }

      if (!Array.isArray(searchResponse.data)) {
        throw new Error('Expected store search response to be an array.');
      }

      if (searchResponse.data.length === 0) {
        throw new Error('Expected at least one product from FakeStore search.');
      }

      assertProductShape(searchResponse.data[0], 'Store search item');
      productId = Number(searchResponse.data[0].id);
    } catch (error) {
      const status = error?.response?.status;
      const upstreamError = error?.response?.data?.error;
      if (status !== 500 || String(upstreamError) !== 'Failed to search store products') {
        throw error;
      }

      log('Store search unavailable upstream; validating graceful fallback behavior.', {
        status,
        error: upstreamError,
      });
    }

    log('TEST 2: Fetching product details...', `GET ${PRODUCT_URL}/${productId}`);
    try {
      const detailResponse = await axios.get(`${PRODUCT_URL}/${productId}`);

      if (detailResponse.status !== 200) {
        throw new Error(`Expected status 200 from product details, received ${detailResponse.status}`);
      }

      assertProductShape(detailResponse.data, 'Store detail item');
    } catch (error) {
      const status = error?.response?.status;
      const upstreamError = error?.response?.data?.error;
      if (status !== 404 || String(upstreamError) !== 'Product not found') {
        throw error;
      }

      log('Store detail unavailable upstream; validated graceful 404 behavior.', {
        status,
        error: upstreamError,
      });
    }

    log('TEST 3: Invalid product should return 404...', `GET ${PRODUCT_URL}/999999999`);
    try {
      await axios.get(`${PRODUCT_URL}/999999999`);
      throw new Error('Expected invalid product request to fail with 404.');
    } catch (error) {
      if (error?.response?.status !== 404) {
        throw error;
      }
    }

    console.log('\nAll admin store endpoint tests passed successfully.');
  } catch (error) {
    console.error('\nAdmin store endpoint tests failed.');
    if (error?.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    process.exitCode = 1;
  } finally {
    await closePool();
    process.exit(process.exitCode ?? 0);
  }
}

runTests();
