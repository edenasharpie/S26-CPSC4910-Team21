const axios = require('axios');
require('dotenv').config();

const ETSY_BASE_URL = 'https://openapi.etsy.com/v3';

class EtsyService {
  constructor() {
    this.apiKey = process.env.ETSY_API_KEYSTRING;
    this.sharedSecret = process.env.ETSY_API_SHARED_SECRET;
  }

  async searchListings(query, limit = 20, offset = 0) {
    try {
      const response = await axios.get(`${ETSY_BASE_URL}/application/listings/active`, {
        headers: {
          'x-api-key': this.apiKey
        },
        params: {
          keywords: query,
          limit,
          offset,
          includes: 'Images,Shop'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Etsy API Error:', error.response?.data || error.message);
      throw new Error('Failed to fetch Etsy listings');
    }
  }

  async getListingById(listingId) {
    try {
      const response = await axios.get(
        `${ETSY_BASE_URL}/application/listings/${listingId}`,
        {
          headers: {
            'x-api-key': this.apiKey
          },
          params: {
            includes: 'Images,Shop'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Etsy API Error:', error.response?.data || error.message);
      throw new Error('Failed to fetch Etsy listing');
    }
  }

  // convert listing to catalog item format
  listingToCatalogItem(etsyListing, pointCost) {
    return {
      originalSource: etsyListing.url,
      name: etsyListing.title,
      description: etsyListing.description || '',
      pointCost: pointCost,
      imageUrl: etsyListing.images?.[0]?.url_570xN || null,
      etsyListingId: etsyListing.listing_id
    };
  }
}

module.exports = new EtsyService();