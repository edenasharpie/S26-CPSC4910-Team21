import express from 'express';
import { getAllUsersWithApps } from '../utils/queries.js';

const router = express.Router();

// GET /api/accounts/admin-list
router.get('/admin-list', async (req, res) => {
  try {
    const users = await getAllUsersWithApps();

    res.status(200).json(users);
    
  } catch (error) {
    console.error('Failed to fetch admin list:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Could not retrieve user list with application dates.' 
    });
  }
});

//export default router;
export default router;
