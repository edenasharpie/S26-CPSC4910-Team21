const express = require('express'); 
const router = express.Router();

const { changePasswordWithHistory } = require('../../api/user');

// Get drivers based off performance
router.get('/my-drivers/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const drivers = await dbQueries.getDriversByCompany(companyId);
    res.json(drivers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch drivers for review' });
  }
}); 

// POST /api/sponsors/change-password
router.post('/change-password', async (req, res) => {
    const pool = req.app.get('pool');
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
        return res.status(400).json({ error: "User ID and new password are required." });
    }

    try {
        const result = await changePasswordWithHistory(pool, userId, newPassword);

        if (result.success) {
            return res.status(200).json({ 
                message: "Sponsor password updated successfully." 
            });
        } else {
            return res.status(400).json({ 
                message: result.message || "Cannot reuse a recent password." 
            });
        }
    } catch (error) {
        console.error("Sponsor Password Change Error:", error);
        return res.status(500).json({ error: "Internal server error." });
    }
});

module.exports = router;