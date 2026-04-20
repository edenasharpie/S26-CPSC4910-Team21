import axios from 'axios';
import store from '../../src/services/fakeStoreService.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runTests() {
  const originalGet = axios.get;

  try {
    console.log('Starting fake store service unit tests...\n');

    console.log('TEST 1: searchProducts filters by query and applies pagination...');
    const mockProducts = [
      {
        id: 1,
        title: 'Blue Shirt',
        description: 'Cotton shirt for work',
        category: "men's clothing",
        price: 24.99,
        image: 'https://example.com/blue-shirt.jpg',
      },
      {
        id: 2,
        title: 'Road Backpack',
        description: 'Travel-ready backpack',
        category: 'bags',
        price: 39.99,
        image: 'https://example.com/backpack.jpg',
      },
      {
        id: 3,
        title: 'Red Shirt',
        description: 'Performance shirt',
        category: "women's clothing",
        price: 21.5,
        image: 'https://example.com/red-shirt.jpg',
      },
    ];

    axios.get = async (url) => {
      if (url !== 'https://fakestoreapi.com/products') {
        throw new Error(`Unexpected URL for searchProducts: ${url}`);
      }

      return { data: mockProducts };
    };

    const filtered = await store.searchProducts('shirt', 20, 0);
    assert(filtered.length === 2, `Expected 2 filtered products, received ${filtered.length}`);
    assert(filtered.every((product) => `${product.title} ${product.description} ${product.category}`.toLowerCase().includes('shirt')),
      'Expected every filtered product to contain query text.');

    const paginated = await store.searchProducts('', 2, 1);
    assert(paginated.length === 2, `Expected paginated length 2, received ${paginated.length}`);
    assert(paginated[0].id === 2 && paginated[1].id === 3, 'Expected pagination to return products with ids 2 and 3.');

    console.log('TEST 2: transformToCatalogItem maps fields correctly...');
    const transformed = store.transformToCatalogItem(mockProducts[0], 150);
    assert(transformed.originalSource === 'https://fakestoreapi.com/products/1', 'Expected originalSource to map to FakeStore product URL.');
    assert(transformed.name === 'Blue Shirt', 'Expected title to map to name.');
    assert(transformed.description === 'Cotton shirt for work', 'Expected description mapping to be preserved.');
    assert(transformed.pointCost === 150, 'Expected pointCost to match provided value.');
    assert(transformed.imageUrl === 'https://example.com/blue-shirt.jpg', 'Expected imageUrl mapping to be preserved.');
    assert(transformed.externalProductId === 1, 'Expected externalProductId to map from product id.');

    console.log('TEST 3: getProductById returns upstream payload...');
    axios.get = async (url) => {
      if (url !== 'https://fakestoreapi.com/products/9') {
        throw new Error(`Unexpected URL for getProductById success case: ${url}`);
      }

      return {
        data: {
          id: 9,
          title: 'Desk Lamp',
          description: 'Bright LED lamp',
          category: 'electronics',
          price: 14.99,
          image: 'https://example.com/lamp.jpg',
        },
      };
    };

    const product = await store.getProductById(9);
    assert(product.id === 9, 'Expected getProductById to return requested product id.');

    console.log('TEST 4: getProductById surfaces service-level error message...');
    axios.get = async () => {
      const error = new Error('Upstream error');
      error.response = { data: { error: 'not found' } };
      throw error;
    };

    try {
      await store.getProductById(999999);
      throw new Error('Expected getProductById to throw for upstream failure.');
    } catch (error) {
      assert(error instanceof Error, 'Expected thrown error instance from getProductById.');
      assert(error.message === 'Failed to fetch store product details',
        `Expected normalized getProductById error message, received: ${error.message}`);
    }

    console.log('TEST 5: searchProducts surfaces service-level error message...');
    try {
      await store.searchProducts('anything', 5, 0);
      throw new Error('Expected searchProducts to throw for upstream failure.');
    } catch (error) {
      assert(error instanceof Error, 'Expected thrown error instance from searchProducts.');
      assert(error.message === 'Failed to fetch store listings',
        `Expected normalized searchProducts error message, received: ${error.message}`);
    }

    console.log('\nAll fake store service unit tests passed successfully.');
  } catch (error) {
    console.error('\nFake store service unit tests failed.');
    console.error('Error:', error.message);
    process.exitCode = 1;
  } finally {
    axios.get = originalGet;
    process.exit(process.exitCode ?? 0);
  }
}

runTests();
