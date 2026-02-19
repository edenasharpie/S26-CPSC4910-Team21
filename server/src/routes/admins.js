const express = require('express');
const router = express.Router();
const { changePasswordWithHistory } = require('../../api/user'); 

router.post('/change-password', async (req, res) => {
    const pool = req.app.get('pool');
    const { userId, newPassword } = req.body;

    try {
        const result = await changePasswordWithHistory(pool, userId, newPassword);
        if (result.success) {
            res.status(200).json({ message: "Password updated successfully." });
        } else {
            res.status(400).json({ message: result.message }); 
        }
    } catch (error) {
        console.error("Admin Password Error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;