import axios from 'axios';

const BASE_URL = 'https://fakestoreapi.com';

class FakeStoreService {
  async searchProducts(query, limit = 20, offset = 0) {
    try {
      const response = await axios.get(`${BASE_URL}/products`);
      
      let products = response.data;

      // filter by query if provided
      if (query) {
        const lowerQuery = query.toLowerCase();
        products = products.filter(p => 
          p.title.toLowerCase().includes(lowerQuery) ||
          p.description.toLowerCase().includes(lowerQuery) ||
          p.category.toLowerCase().includes(lowerQuery)
        );
      }

      // apply pagination
      const paginatedProducts = products.slice(offset, offset + limit);
      
      return paginatedProducts;
    } catch (error) {
      console.error('Store API Error:', error.response?.data || error.message);
      throw new Error('Failed to fetch store listings');
    }
  }

  async getProductById(productId) {
    try {
      const response = await axios.get(`${BASE_URL}/products/${productId}`);
      
      return response.data;
    } catch (error) {
      console.error('Store API Error:', error.response?.data || error.message);
      throw new Error('Failed to fetch store product details');
    }
  }

  // convert product to catalog item format
  transformToCatalogItem(product, pointCost) {
    return {
      originalSource: `${BASE_URL}/products/${product.id}`,
      name: product.title,
      description: product.description || '',
      pointCost: pointCost,
      imageUrl: product.image || null,
      externalProductId: product.id
    };
  }
}

export default new FakeStoreService();