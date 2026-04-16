import express from 'express';
import { pool } from '../db.js';
import { routeUserMatchesEffectiveSession } from '../middleware/session-context.js';
import {
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notification-service.js';

const router = express.Router({ mergeParams: true });

async function loadSponsorNotificationContext(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'Invalid sponsor user ID' });
    }

    if (!routeUserMatchesEffectiveSession(req, userId)) {
      return res.status(403).json({ error: 'Access forbidden for requested user context.' });
    }

    const [rows] = await pool.execute(
      `SELECT u.UserID, u.ActiveStatus, u.UserType
       FROM USERS u
       JOIN SPONSORS s ON s.UserID = u.UserID
       WHERE u.UserID = ?
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Sponsor account not found.' });
    }

    if (String(rows[0].UserType).toLowerCase() !== 'sponsor') {
      return res.status(403).json({ error: 'Only sponsors can view sponsor notifications.' });
    }

    if (!Boolean(rows[0].ActiveStatus)) {
      return res.status(403).json({ error: 'Sponsor account is inactive.' });
    }

    req.notificationUserId = userId;
    return next();
  } catch (error) {
    console.error('Sponsor notification context error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

router.use(loadSponsorNotificationContext);

router.get('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const result = await listNotificationsForUser(connection, req.notificationUserId, {
      limit: req.query.limit,
      offset: req.query.offset,
      category: req.query.category,
      unreadOnly: req.query.unreadOnly,
    });

    return res.json(result);
  } catch (error) {
    console.error('Error listing sponsor notifications:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    connection.release();
  }
});

router.patch('/:notificationId/read', async (req, res) => {
  const notificationId = Number(req.params.notificationId);
  if (!Number.isInteger(notificationId)) {
    return res.status(400).json({ error: 'Invalid notification ID' });
  }

  const connection = await pool.getConnection();
  try {
    const result = await markNotificationRead(connection, req.notificationUserId, notificationId);
    if (!result.found) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.json({ success: true, updated: result.updated });
  } catch (error) {
    console.error('Error marking sponsor notification read:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    connection.release();
  }
});

router.patch('/read-all', async (req, res) => {
  const category = typeof req.body?.category === 'string'
    ? req.body.category
    : req.query.category;

  const connection = await pool.getConnection();
  try {
    const result = await markAllNotificationsRead(connection, req.notificationUserId, { category });
    return res.json({ success: true, updatedCount: result.updatedCount });
  } catch (error) {
    console.error('Error marking all sponsor notifications read:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    connection.release();
  }
});

export default router;
