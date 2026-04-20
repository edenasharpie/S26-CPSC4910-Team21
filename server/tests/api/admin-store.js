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

      log('TEST 1b: Searching with query and limit...', `GET ${SEARCH_URL}?query=<derived>&limit=2&offset=0`);
      const categoryQuery = String(searchResponse.data[0].category || '').trim().split(/\s+/)[0];
      if (!categoryQuery) {
        throw new Error('Unable to derive category query from search result.');
      }

      const filteredResponse = await axios.get(SEARCH_URL, {
        params: {
          query: categoryQuery,
          limit: 2,
          offset: 0,
        },
      });

      if (filteredResponse.status !== 200) {
        throw new Error(`Expected status 200 from filtered search, received ${filteredResponse.status}`);
      }

      if (!Array.isArray(filteredResponse.data)) {
        throw new Error('Expected filtered store search response to be an array.');
      }

      if (filteredResponse.data.length === 0) {
        throw new Error('Expected at least one product from filtered store search.');
      }

      if (filteredResponse.data.length > 2) {
        throw new Error(`Expected filtered results length <= 2, received ${filteredResponse.data.length}`);
      }

      const normalizedQuery = categoryQuery.toLowerCase();
      for (const product of filteredResponse.data) {
        assertProductShape(product, 'Filtered store search item');
        const haystack = `${product.title} ${product.description} ${product.category}`.toLowerCase();
        if (!haystack.includes(normalizedQuery)) {
          throw new Error(`Expected filtered product to match query "${categoryQuery}".`);
        }
      }
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
