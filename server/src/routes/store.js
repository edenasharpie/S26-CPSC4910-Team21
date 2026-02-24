import express from 'express';
import store from '../services/fakeStoreService.js';

const router = express.Router();

// GET /store/search - Search products from Fake Store API
router.get('/search', async (request, response) => {
  try {
    const query = request.query.query || '';
    const limit = parseInt(request.query.limit) || 20;
    const offset = parseInt(request.query.offset) || 0;

    const products = await store.searchProducts(query, limit, offset);
    
    // Transform products to a simpler format for frontend
    const transformedProducts = products.map(product => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      category: product.category,
      image: product.image
    }));

    response.json(transformedProducts);
  } catch (error) {
    console.error('Error searching store products:', error);
    response.status(500).json({ error: 'Failed to search store products' });
  }
});

// GET /store/products/:productId - Get a specific product by ID
router.get('/products/:productId', async (request, response) => {
  try {
    const { productId } = request.params;
    const product = await store.getProductById(productId);
    
    response.json({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      category: product.category,
      image: product.image
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    response.status(404).json({ error: 'Product not found' });
  }
});

export default router;
