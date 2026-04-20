import axios from 'axios';
import { BASE_URL, closePool, log } from '../setup.js';

const API_BASE_URL = `${BASE_URL}/api`;

async function expect404(requestFactory, message) {
  try {
    await requestFactory();
    throw new Error(`${message} expected 404 but request succeeded`);
  } catch (error) {
    if (!error.response || error.response.status !== 404) {
      throw error;
    }
  }
}

async function runTests() {
  try {
    console.log('Starting deprecated user review route removal tests...\n');

    log('TEST 1: /api/user/post-review returns 404', 'POST /api/user/post-review');
    await expect404(
      () =>
        axios.post(`${API_BASE_URL}/user/post-review`, {
          itemId: 1,
          userId: 1,
          rating: 5,
          body: 'legacy review payload',
        }),
      '/api/user/post-review'
    );

    log('TEST 2: /api/user/review/:reviewId/comments returns 404', 'GET /api/user/review/1/comments');
    await expect404(
      () => axios.get(`${API_BASE_URL}/user/review/1/comments`),
      '/api/user/review/:reviewId/comments'
    );

    log('TEST 3: /api/user/comments returns 404', 'POST /api/user/comments');
    await expect404(
      () =>
        axios.post(`${API_BASE_URL}/user/comments`, {
          reviewId: 1,
          userId: 1,
          text: 'legacy comment payload',
        }),
      '/api/user/comments'
    );

    log('TEST 4: /api/user/drafts returns 404', 'POST /api/user/drafts');
    await expect404(
      () =>
        axios.post(`${API_BASE_URL}/user/drafts`, {
          itemId: 1,
          userId: 1,
          rating: 5,
          body: 'legacy draft payload',
        }),
      '/api/user/drafts'
    );

    log('TEST 5: /api/user/drafts/:userId/:itemId returns 404', 'GET /api/user/drafts/1/1');
    await expect404(
      () => axios.get(`${API_BASE_URL}/user/drafts/1/1`),
      '/api/user/drafts/:userId/:itemId'
    );

    log('TEST 6: /api/user/reviews/finalize returns 404', 'POST /api/user/reviews/finalize');
    await expect404(
      () =>
        axios.post(`${API_BASE_URL}/user/reviews/finalize`, {
          itemId: 1,
          userId: 1,
          rating: 5,
          body: 'legacy finalize payload',
        }),
      '/api/user/reviews/finalize'
    );

    console.log('\nDeprecated user review route removal tests completed successfully!');
  } catch (error) {
    console.error('\nDeprecated user review route removal tests failed:');
    process.exitCode = 1;

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  } finally {
    await closePool();
  }
}

runTests();
