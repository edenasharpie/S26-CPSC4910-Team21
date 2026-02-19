const express = require('express');
const router = express.Router();

const dbQueries = require('../utils/queries'); 

// GET /api/accounts/admin-list
router.get('/admin-list', async (req, res) => {
  try {
    const users = await dbQueries.getAllUsersWithApps();

    res.status(200).json(users);
    
  } catch (error) {
    console.error('Failed to fetch admin list:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Could not retrieve user list with application dates.' 
    });
  }
});

module.exports = router;