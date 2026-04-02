import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();


/**
 * GET /api/reviews/sponsor-list
 * Fetches reviews where the 'ItemID' matches the Sponsor's ID.
 */
router.get('/sponsor-list', async (req, res) => {
  // Get Sponsor info from the authenticated session
  const sponsorId = req.user?.UserID;
  const userType = req.user?.UserType;

  if (!sponsorId || userType !== 'sponsor') {
    return res.status(403).json({ success: false, error: 'Unauthorized. Sponsor access only.' });
  }

  try {
    // Query using your specific columns: ReviewBody, IsVisible, etc.
    const [reviews] = await pool.execute(`
      SELECT 
        r.ReviewID, 
        r.UserID AS DriverID, 
        r.ItemID AS SponsorID, 
        r.Rating, 
        r.ReviewBody, 
        r.IsVisible,
        r.Timestamp,
        u.Username AS DriverName
      FROM REVIEWS r
      JOIN USERS u ON r.UserID = u.UserID
      WHERE r.ItemID = ?
      ORDER BY r.Timestamp DESC
    `, [sponsorId]);

    res.json({ success: true, reviews });
  } catch (err) {
    console.error('Error fetching reviews from RDS:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch reviews.' });
  }
});

/**
 * PATCH /api/reviews/toggle-visibility/:id
 * Allows a sponsor to hide/show a review (toggles IsVisible).
 */
router.patch('/toggle-visibility/:id', async (req, res) => {
  const { id } = req.params;
  const sponsorId = req.user?.UserID;

  try {
    // We only allow the update if the ItemID (Sponsor) matches the logged-in user
    const [result] = await pool.execute(
      'UPDATE REVIEWS SET IsVisible = NOT IsVisible WHERE ReviewID = ? AND ItemID = ?',
      [id, sponsorId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Review not found or unauthorized.' });
    }

    res.json({ success: true, message: 'Review visibility updated.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Database update failed.' });
  }
});

export default router;