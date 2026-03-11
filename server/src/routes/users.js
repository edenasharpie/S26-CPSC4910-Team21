import express from 'express';
import { validatePasswordComplexity } from '../utils/auth.js';

const router = express.Router();

import { getProfile, changePasswordWithHistory } from '../../api/user.ts';


/**
 * GET /api/user/profile/:id
 */
router.get('/profile/:id', async (req, res) => {
  try {
    const pool = req.app.get('pool'); 
    
    const result = await getProfile(pool, req.params.id);
    
    res.status(result.status).json(result.data || { error: result.error });
  } catch (error) {
    console.error("Profile Route Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/user/change-password
 */
router.post('/change-password', async (req, res) => {
  const { userId, newPassword } = req.body;
  const pool = req.app.get('pool');

  // Validate password complexity (story 4287)
  const complexity = validatePasswordComplexity(newPassword);
  if (!complexity.valid) {
    return res.status(400).json({ message: complexity.error });
  }

  try {
    const result = await changePasswordWithHistory(pool, userId, newPassword);

    if (result.success) {
      return res.status(200).json({ message: "Password updated successfully!" });
    } else {
      return res.status(400).json({ message: result.error });
    }
    
  } catch (error) {
    console.error("Change Password Route Error:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// TODO: not sure which one of these (or if any) we should have here
//module.exports = router;
export default router;