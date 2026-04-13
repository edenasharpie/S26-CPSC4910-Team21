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
    const validEventTypes = new Set([
      'LoginAttempt',
      'PasswordChange',
      'AccountUpdate',
      'AccountStatusChange',
      'ApplicationStatusUpdate',
      'ReviewModerationEvent',
      'Notification',
      'PointTransaction',
    ]);

    const rawFilterParam = req.query.filter;
    const filterValues = Array.isArray(rawFilterParam)
      ? rawFilterParam
      : rawFilterParam
        ? [rawFilterParam]
        : [];

    const eventTypes = filterValues
      .flatMap((value) => String(value).split(','))
      .map((value) => value.trim())
      .filter(Boolean);

    const invalidEventType = eventTypes.find((eventType) => !validEventTypes.has(eventType));
    if (invalidEventType) {
      return res.status(400).json({ error: `Invalid filter value: ${invalidEventType}` });
    }

    const auditFilters = {
      eventTypes,
    };

    if (req.query.startDate) {
      const startDate = new Date(String(req.query.startDate));
      if (Number.isNaN(startDate.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate format.' });
      }
      auditFilters.startDate = startDate;
    }

    if (req.query.endDate) {
      const endDate = new Date(String(req.query.endDate));
      if (Number.isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'Invalid endDate format.' });
      }
      auditFilters.endDate = endDate;
    }

    if (req.query.targetUserId) {
      const targetUserId = Number.parseInt(String(req.query.targetUserId), 10);
      if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        return res.status(400).json({ error: 'Invalid targetUserId.' });
      }
      auditFilters.targetUserId = targetUserId;
    }

    if (req.query.targetUserType) {
      const targetUserType = String(req.query.targetUserType).trim().toLowerCase();
      const allowedUserTypes = new Set(['all', 'admin', 'driver', 'sponsor']);
      if (!allowedUserTypes.has(targetUserType)) {
        return res.status(400).json({ error: 'Invalid targetUserType. Must be all, admin, driver, or sponsor.' });
      }
      if (targetUserType !== 'all') {
        auditFilters.targetUserType = targetUserType;
      }
    }

    if (req.query.pointUserScope) {
      const pointUserScope = String(req.query.pointUserScope).trim();
      const allowedPointUserScopes = new Set(['any', 'changedBy', 'affected']);
      if (!allowedPointUserScopes.has(pointUserScope)) {
        return res.status(400).json({ error: 'Invalid pointUserScope. Must be any, changedBy, or affected.' });
      }
      auditFilters.pointUserScope = pointUserScope;
    }

    const logs = await getAuditLogs(auditFilters);
    return res.json(logs);
  } catch (err) {
    console.error('GET /api/admin/audit-logs error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
