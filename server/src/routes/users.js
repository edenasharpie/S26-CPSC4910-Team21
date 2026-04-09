import express from 'express';
import { validatePasswordComplexity, hashPassword } from '../utils/auth.js';
import { changePasswordWithHistory, getUserById } from '../utils/queries.js';
import { pool } from '../db.js';
import {
  routeUserMatchesEffectiveSession,
} from '../middleware/session-context.js';

const router = express.Router();


/**
 * GET /api/user/profile/:id
 */
router.get('/profile/:id', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    let licenseNumber = null;
    if (String(user.UserType).toLowerCase() === 'driver') {
      const [driverRows] = await pool.execute(
        'SELECT LicenseNumber FROM DRIVERS WHERE UserID = ? LIMIT 1',
        [userId]
      );
      licenseNumber = driverRows[0]?.LicenseNumber ?? null;
    }

    // Omit sensitive fields before returning
    const { PassHash, ...safeUser } = user;
    res.status(200).json({
      ...safeUser,
      LicenseNumber: licenseNumber,
    });
  } catch (error) {
    console.error('Profile Route Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PATCH /api/user/profile/:id
 */
router.patch('/profile/:id', async (req, res) => {
  let connection;
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'Invalid user id.' });
    }

    if (!routeUserMatchesEffectiveSession(req, userId)) {
      return res.status(403).json({ error: 'Access forbidden for requested user context.' });
    }

    const firstName = typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : undefined;
    const lastName = typeof req.body?.lastName === 'string' ? req.body.lastName.trim() : undefined;
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : undefined;
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : undefined;
    const phoneRaw = typeof req.body?.phone === 'string' ? req.body.phone.trim() : undefined;
    const phone = phoneRaw === '' ? null : phoneRaw;
    const middleNameRaw = typeof req.body?.middleName === 'string' ? req.body.middleName.trim() : undefined;
    const middleName = middleNameRaw === '' ? null : middleNameRaw;
    const pronounsRaw = typeof req.body?.pronouns === 'string' ? req.body.pronouns.trim() : undefined;
    const pronouns = pronounsRaw === '' ? null : pronounsRaw;
    const profilePictureRaw = typeof req.body?.profilePicture === 'string' ? req.body.profilePicture.trim() : undefined;
    const profilePicture = profilePictureRaw === '' ? null : profilePictureRaw;
    const bioRaw = typeof req.body?.bio === 'string' ? req.body.bio.trim() : undefined;
    const bio = bioRaw === '' ? null : bioRaw;
    const licenseNumberRaw = typeof req.body?.licenseNumber === 'string' ? req.body.licenseNumber.trim() : undefined;
    const licenseNumber = licenseNumberRaw === '' ? null : licenseNumberRaw;

    const updates = [];
    const values = [];
    const hasLicenseNumberUpdate = licenseNumber !== undefined;

    if (firstName !== undefined) {
      if (!firstName) {
        return res.status(400).json({ error: 'firstName cannot be empty.' });
      }
      updates.push('FirstName = ?');
      values.push(firstName);
    }

    if (lastName !== undefined) {
      if (!lastName) {
        return res.status(400).json({ error: 'lastName cannot be empty.' });
      }
      updates.push('LastName = ?');
      values.push(lastName);
    }

    if (username !== undefined) {
      if (!username) {
        return res.status(400).json({ error: 'username cannot be empty.' });
      }
      updates.push('Username = ?');
      values.push(username);
    }

    if (email !== undefined) {
      if (!email) {
        return res.status(400).json({ error: 'email cannot be empty.' });
      }
      updates.push('Email = ?');
      values.push(email);
    }

    if (phone !== undefined) {
      updates.push('Phone = ?');
      values.push(phone);
    }

    if (middleName !== undefined) {
      updates.push('MiddleName = ?');
      values.push(middleName);
    }

    if (pronouns !== undefined) {
      updates.push('Pronouns = ?');
      values.push(pronouns);
    }

    if (profilePicture !== undefined) {
      updates.push('ProfilePicture = ?');
      values.push(profilePicture);
    }

    if (bio !== undefined) {
      updates.push('Bio = ?');
      values.push(bio);
    }

    if (updates.length === 0 && !hasLicenseNumberUpdate) {
      return res.status(400).json({ error: 'No valid profile fields provided for update.' });
    }

    if (hasLicenseNumberUpdate && !licenseNumber) {
      return res.status(400).json({ error: 'licenseNumber cannot be empty.' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    if (updates.length > 0) {
      const [updateResult] = await connection.execute(
        `UPDATE USERS SET ${updates.join(', ')} WHERE UserID = ?`,
        [...values, userId]
      );

      if (updateResult.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'User not found.' });
      }
    }

    if (hasLicenseNumberUpdate) {
      const [driverUpdateResult] = await connection.execute(
        'UPDATE DRIVERS SET LicenseNumber = ? WHERE UserID = ?',
        [licenseNumber, userId]
      );

      if (driverUpdateResult.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Driver profile not found for this user.' });
      }
    }

    const [rows] = await connection.execute(
      `SELECT u.UserID, u.Username, u.Email, u.Phone, u.UserType, u.FirstName, u.MiddleName, u.LastName, u.Pronouns,
              u.ActiveStatus, u.ProfilePicture, u.Bio, d.LicenseNumber
       FROM USERS u
       LEFT JOIN DRIVERS d ON d.UserID = u.UserID
       WHERE u.UserID = ?
       LIMIT 1`,
      [userId]
    );

    await connection.commit();

    return res.status(200).json(rows[0]);
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username or email already exists.' });
    }
    console.error('Profile Update Route Error:', error);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    if (connection) {
      connection.release();
    }
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

/**
 * POST /api/user/register-driver
 * Public endpoint for driver self-registration.
 */
router.post('/register-driver', async (req, res) => {
  const {
    username,
    email,
    password,
    firstName,
    lastName,
    licenseNumber,
    phone,
  } = req.body ?? {};

  if (!username || !email || !password || !firstName || !lastName || !licenseNumber) {
    return res.status(400).json({
      error: 'Missing required fields: username, email, password, firstName, lastName, licenseNumber',
    });
  }

  const complexity = validatePasswordComplexity(String(password));
  if (!complexity.valid) {
    return res.status(400).json({ error: complexity.error });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [existingUsers] = await connection.execute(
      'SELECT UserID FROM USERS WHERE Username = ? OR Email = ?',
      [String(username).trim(), String(email).trim()]
    );

    if (existingUsers.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const [existingDrivers] = await connection.execute(
      'SELECT UserID FROM DRIVERS WHERE LicenseNumber = ?',
      [String(licenseNumber).trim()]
    );

    if (existingDrivers.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'License number is already registered' });
    }

    const passHash = await hashPassword(String(password));
    const defaultPermissions = JSON.stringify({});

    const [userResult] = await connection.execute(
      `INSERT INTO USERS
        (Username, Email, Phone, PassHash, UserType, FirstName, LastName, ActiveStatus, LastLogin, LastPasswordChange, Permissions)
       VALUES (?, ?, ?, ?, 'driver', ?, ?, 1, NOW(), NOW(), ?)`,
      [
        String(username).trim(),
        String(email).trim(),
        phone ? String(phone).trim() : null,
        passHash,
        String(firstName).trim(),
        String(lastName).trim(),
        defaultPermissions,
      ]
    );

    const newUserId = userResult.insertId;

    await connection.execute(
      `INSERT INTO DRIVERS
        (LicenseNumber, UserID, SponsorCompanyID, PointBalance, PerformanceStatus, AlertPoints, AlertOrders)
       VALUES (?, ?, NULL, 0, 'good', 1, 1)`,
      [String(licenseNumber).trim(), newUserId]
    );

    await connection.commit();

    return res.status(201).json({
      message: 'Driver account created successfully.',
      userId: newUserId,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Driver registration error:', error);
    return res.status(500).json({ error: 'Failed to create driver account.' });
  } finally {
    if (connection) {
      connection.release();
    }
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
    const rawDriverId = String(driverId ?? '').trim();
    const rawSponsorCompanyId = Number(sponsorCompanyId);
    const rawExplanation = String(explanation ?? '').trim();

    if (!rawDriverId || !Number.isInteger(rawSponsorCompanyId) || !rawExplanation) {
      return res.status(400).json({ error: 'driverId, sponsorCompanyId, and explanation are required.' });
    }

    // DRIVER_APPLICATIONS.DriverID should store DRIVERS.LicenseNumber.
    let licenseNumber = rawDriverId;
    const numericDriverId = Number(rawDriverId);

    if (Number.isInteger(numericDriverId)) {
      const [driverRows] = await pool.execute(
        'SELECT LicenseNumber FROM DRIVERS WHERE UserID = ? LIMIT 1',
        [numericDriverId]
      );

      if (driverRows.length > 0) {
        licenseNumber = driverRows[0].LicenseNumber;
      }
    }

    const [driverByLicenseRows] = await pool.execute(
      'SELECT LicenseNumber FROM DRIVERS WHERE LicenseNumber = ? LIMIT 1',
      [licenseNumber]
    );

    if (driverByLicenseRows.length === 0) {
      return res.status(404).json({ error: 'Driver not found. Could not resolve driver license number.' });
    }

    const [sponsorRows] = await pool.execute(
      'SELECT SponsorCompanyID FROM SPONSOR_COMPANIES WHERE SponsorCompanyID = ? LIMIT 1',
      [rawSponsorCompanyId]
    );

    if (sponsorRows.length === 0) {
      return res.status(404).json({ error: 'Sponsor company not found.' });
    }

    const [existingPendingRows] = await pool.execute(
      `SELECT ApplicationID
       FROM DRIVER_APPLICATIONS
       WHERE DriverID = ? AND SponsorCompanyID = ? AND ApplicationStatus = 'pending'
       LIMIT 1`,
      [licenseNumber, rawSponsorCompanyId]
    );

    if (existingPendingRows.length > 0) {
      return res.status(409).json({ error: 'You already have a pending application for this sponsor.' });
    }

    // ApplicationStatus defaults to 'pending' based on your ENUM
    const [result] = await pool.execute(
      `INSERT INTO DRIVER_APPLICATIONS 
       (DriverID, SponsorCompanyID, ApplicationStatus, DecisionExplanation, TimeSubmitted)
       VALUES (?, ?, 'pending', ?, NOW())`,
      [licenseNumber, rawSponsorCompanyId, rawExplanation]
    );

    res.status(201).json({ 
      message: "Application submitted successfully!", 
      applicationId: result.insertId,
      driverId: licenseNumber,
      sponsorCompanyId: rawSponsorCompanyId,
    });
  } catch (error) {
    console.error("Submission Error:", error);
    res.status(500).json({ error: "Could not submit application. You may already have a pending request." });
  }
});

router.get('/my-applications/:driverId', async (req, res) => {
    const { driverId } = req.params;

    try {
        const rawDriverId = String(driverId ?? '').trim();
        if (!rawDriverId) {
          return res.status(400).json({ error: 'driverId is required.' });
        }

        // DRIVER_APPLICATIONS.DriverID stores DRIVERS.LicenseNumber.
        let licenseNumber = rawDriverId;
        const numericDriverId = Number(rawDriverId);

        if (Number.isInteger(numericDriverId)) {
          const [driverRows] = await pool.execute(
            'SELECT LicenseNumber FROM DRIVERS WHERE UserID = ? LIMIT 1',
            [numericDriverId]
          );

          if (driverRows.length > 0) {
            licenseNumber = driverRows[0].LicenseNumber;
          }
        }

        const [rows] = await pool.execute(
            `SELECT 
                a.ApplicationID, 
                a.SponsorCompanyID, 
                sc.CompanyName AS SponsorName,
                a.ApplicationStatus, 
                a.DecisionExplanation, 
                a.TimeSubmitted
             FROM DRIVER_APPLICATIONS a
             JOIN SPONSOR_COMPANIES sc ON a.SponsorCompanyID = sc.SponsorCompanyID
             WHERE a.DriverID = ?
             ORDER BY a.TimeSubmitted DESC`,
            [licenseNumber]
        );
        res.json(rows);
    } catch (error) {
        console.error("Fetch Apps Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

//module.exports = router;
export default router;