const express = require('express');
const router = express.Router();

const { changePasswordWithHistory } = require('../utils/queries');
import { getProfile, getUserById } from '../api/user';

// This is where you pass the 'pool' into the logic functions
router.get('/profile/:id', async (req, res) => {
  try {
    // 'pool' is defined globally in your index.js or passed via middleware
    const user = await getUserById(req.app.get('pool'), req.params.id);
    
    if (!user) return res.status(404).json({ message: "User not found" });
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});


router.post('/change-password', async (req, res) => {
  const { userId, newPassword } = req.body;

  try {
    const result = await changePasswordWithHistory(userId, newPassword);

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