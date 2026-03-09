import { Router } from 'express';
import { getAuditLogs } from '../utils/queries.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/admin/audit-logs
//
// Query params:
//   filter  Comma-separated EventType values to include.
//           If omitted, all event types are returned.
//           Valid values: LoginAttempt, PasswordChange, AccountUpdate,
//           AccountStatusChange, ApplicationStatusUpdate,
//           ReviewModerationEvent, Notification, PointTransaction
//
// Response: Array of EVENTS rows joined with USERS.Username
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const filterParam = req.query.filter;
    const filters = filterParam
      ? String(filterParam).split(',').map((f) => f.trim()).filter(Boolean)
      : [];

    const logs = await getAuditLogs(filters);
    return res.json(logs);
  } catch (err) {
    console.error('GET /api/admin/audit-logs error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
