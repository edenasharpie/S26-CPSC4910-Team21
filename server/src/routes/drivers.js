const express = require('express');
const router = express.Router();

const { getDriverProfile } = require('../../api/user'); 

//GET /api/drivers/profile/:userId
router.get('/profile/:userId', async (req, res) => {
    const pool = req.app.get('pool');
    const { userId } = req.params;

    try {
        const result = await getDriverProfile(pool, userId);
        
        if (result.success) {
            res.status(200).json(result.data);
        } else {
            res.status(404).json({ message: result.message });
        }
    } catch (error) {
        console.error("Error in driver profile route:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;