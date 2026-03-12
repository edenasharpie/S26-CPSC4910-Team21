//const express = require('express');
import express from 'express';
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
       ORDER BY c.CreatedAt ASC`, // ASC shows the conversation flow
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

//module.exports = router;
export default router;