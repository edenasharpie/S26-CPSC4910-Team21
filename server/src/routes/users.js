const express = require('express');
const router = express.Router();

const { getProfile, changePasswordWithHistory } = require('../../api/user.ts');

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

module.exports = router;