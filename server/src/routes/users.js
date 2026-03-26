import express from 'express';
import { validatePasswordComplexity } from '../utils/auth.js';
import { changePasswordWithHistory, getUserById } from '../utils/queries.js';
import { pool } from '../db.js';

const router = express.Router();


/**
 * GET /api/user/profile/:id
 */
router.get('/profile/:id', async (req, res) => {
  try {
    const user = await getUserById(Number(req.params.id));
    if (!user) return res.status(404).json({ error: 'User not found.' });
    // Omit sensitive fields before returning
    const { PassHash, ...safeUser } = user;
    res.status(200).json(safeUser);
  } catch (error) {
    console.error('Profile Route Error:', error);
    res.status(500).json({ message: 'Server error' });
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

// TODO: confirm which review/comment endpoints are required for this sprint.
// TODO: COMMENTS and REVIEW_DRAFTS tables are not in the current schema.

// POST a review
router.post('/post-review', async (req, res) => {
  const { itemId, userId, rating, body } = req.body;

  try {
    const [result] = await pool.execute(
      `INSERT INTO REVIEWS (ItemID, UserID, Rating, ReviewBody, IsVisible)
       VALUES (?, ?, ?, ?, 1)`,
      [itemId, userId, rating, body]
    );

    res.status(201).json({
      message: "Review submitted successfully!",
      reviewId: result.insertId
    });
  } catch (error) {
    console.error("Database Error:", error);
    res.status(500).json({ error: "Could not post review. Please try again." });
  }
});

// GET to fetch all comments
router.get('/review/:reviewId/comments', async (req, res) => {
  const { reviewId } = req.params;
  try {
    const [rows] = await pool.execute(
      `SELECT c.*, u.FirstName, u.LastName
       FROM COMMENTS c
       JOIN USERS u ON c.UserID = u.UserID
       WHERE c.ReviewID = ?
       ORDER BY c.CreatedAt ASC`,
      [reviewId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST to comment or reply
router.post('/comments', async (req, res) => {
  const { reviewId, userId, parentCommentId, text } = req.body;
  try {
    await pool.execute(
      `INSERT INTO COMMENTS (ReviewID, UserID, ParentCommentID, CommentText)
       VALUES (?, ?, ?, ?)`,
      [reviewId, userId, parentCommentId || null, text]
    );
    res.json({ message: "Comment posted!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST to save/update a draft
router.post('/drafts', async (req, res) => {
  const { itemId, userId, rating, body } = req.body;
  try {
    await pool.execute(
      `INSERT INTO REVIEW_DRAFTS (ItemID, UserID, Rating, ReviewBody)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE Rating = VALUES(Rating), ReviewBody = VALUES(ReviewBody)`,
      [itemId, userId, rating, body]
    );
    res.json({ message: "Draft saved!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET a review draft
router.get('/drafts/:userId/:itemId', async (req, res) => {
  const { userId, itemId } = req.params;
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM REVIEW_DRAFTS WHERE UserID = ? AND ItemID = ?`,
      [userId, itemId]
    );
    res.json(rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST the final draft and remove from drafts
router.post('/reviews/finalize', async (req, res) => {
  const { itemId, userId, rating, body } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Insert into real reviews
    await connection.execute(
      `INSERT INTO REVIEWS (ItemID, UserID, Rating, ReviewBody) VALUES (?, ?, ?, ?)`,
      [itemId, userId, rating, body]
    );

    // Delete the draft
    await connection.execute(
      `DELETE FROM REVIEW_DRAFTS WHERE UserID = ? AND ItemID = ?`,
      [userId, itemId]
    );

    await connection.commit();
    res.json({ message: "Review posted and draft removed!" });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// Drivers create application
router.post('/submit-application', async (req, res) => {
  const { driverId, sponsorCompanyId, explanation } = req.body;

  try {
    // ApplicationStatus defaults to 'pending' based on your ENUM
    const [result] = await pool.execute(
      `INSERT INTO DRIVER_APPLICATIONS 
       (DriverID, SponsorCompanyID, ApplicationStatus, DecisionExplanation, TimeSubmitted)
       VALUES (?, ?, 'pending', ?, NOW())`,
      [driverId, sponsorCompanyId, explanation]
    );

    res.status(201).json({ 
      message: "Application submitted successfully!", 
      applicationId: result.insertId 
    });
  } catch (error) {
    console.error("Submission Error:", error);
    res.status(500).json({ error: "Could not submit application. You may already have a pending request." });
  }
});

router.get('/my-applications/:driverId', async (req, res) => {
    const { driverId } = req.params;

    try {
        const [rows] = await pool.execute(
            `SELECT 
                a.ApplicationID, 
                a.SponsorCompanyID, 
                u.FirstName AS SponsorName, 
                a.ApplicationStatus, 
                a.DecisionExplanation, 
                a.TimeSubmitted
             FROM DRIVER_APPLICATIONS a
             JOIN USERS u ON a.SponsorCompanyID = u.UserID
             WHERE a.DriverID = ?
             ORDER BY a.TimeSubmitted DESC`,
            [driverId]
        );
        res.json(rows);
    } catch (error) {
        console.error("Fetch Apps Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

//module.exports = router;
export default router;