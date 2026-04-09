import axios from 'axios';
import { BASE_URL, log, closePool } from '../setup.js';

const API_URL = `${BASE_URL}/api/images/proxy`;

async function runTests() {
  try {
    console.log('Starting image proxy endpoint tests...\n');

    log('TEST 1: Missing url query parameter should return 400...', `GET ${API_URL}`);
    try {
      await axios.get(API_URL);
      throw new Error('Expected missing url request to fail with 400.');
    } catch (error) {
      if (error?.response?.status !== 400) {
        throw error;
      }
    }

    log('TEST 2: Invalid protocol should return 400...', `GET ${API_URL}?url=ftp://example.com/image.png`);
    try {
      await axios.get(API_URL, {
        params: {
          url: 'ftp://example.com/image.png',
        },
      });
      throw new Error('Expected invalid protocol request to fail with 400.');
    } catch (error) {
      if (error?.response?.status !== 400) {
        throw error;
      }
    }

    const testImageUrl = 'https://httpbin.org/image/png';
    log('TEST 3: Proxying a valid image URL...', `${API_URL}?url=${encodeURIComponent(testImageUrl)}`);
    try {
      const proxyResponse = await axios.get(API_URL, {
        params: { url: testImageUrl },
        responseType: 'arraybuffer',
      });

      if (proxyResponse.status !== 200) {
        throw new Error(`Expected status 200 from image proxy, received ${proxyResponse.status}`);
      }

      if (!proxyResponse.data || proxyResponse.data.byteLength === 0) {
        throw new Error('Expected proxied image response body to contain bytes.');
      }

      const contentType = String(proxyResponse.headers['content-type'] ?? '');
      if (!contentType.includes('image/')) {
        throw new Error(`Expected image content-type from proxy, received ${contentType || 'empty'}`);
      }
    } catch (error) {
      const status = error?.response?.status;
      const rawData = error?.response?.data;
      const errorText = Buffer.isBuffer(rawData)
        ? rawData.toString('utf8')
        : String(rawData?.error ?? rawData ?? '');

      if (status !== 502 || !errorText.includes('Upstream image request failed')) {
        throw error;
      }

      log('Image upstream unavailable; validated graceful 502 behavior.', {
        status,
        error: errorText,
      });
    }

    console.log('\nAll image proxy endpoint tests passed successfully.');
  } catch (error) {
    console.error('\nImage proxy endpoint tests failed.');
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
