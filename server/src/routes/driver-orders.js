import express from 'express';
import { pool } from '../db.js';
import {
  getEffectiveSessionUser,
  routeUserMatchesEffectiveSession,
} from '../middleware/session-context.js';
import {
  getDriverNotificationContextByUserId,
  notifyDriver,
} from '../services/notification-service.js';

const router = express.Router({ mergeParams: true });

async function loadDriverContext(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (!routeUserMatchesEffectiveSession(req, userId)) {
      return res.status(403).json({ error: 'Access forbidden for requested user context.' });
    }

    const effectiveSessionUser = getEffectiveSessionUser(req);
    const effectiveRole = effectiveSessionUser?.UserType;

    if (effectiveRole && effectiveRole !== 'driver') {
      return res.status(404).json({ error: 'Driver account not found' });
    }

    const [userRows] = effectiveRole
      ? await pool.execute(
          'SELECT UserID, ActiveStatus FROM USERS WHERE UserID = ? LIMIT 1',
          [userId]
        )
      : await pool.execute(
          'SELECT UserID, UserType, ActiveStatus FROM USERS WHERE UserID = ? LIMIT 1',
          [userId]
        );

    if (userRows.length === 0 || (!effectiveRole && userRows[0].UserType !== 'driver')) {
      return res.status(404).json({ error: 'Driver account not found' });
    }

    if (!Boolean(userRows[0].ActiveStatus)) {
      return res.status(403).json({ error: 'Driver account is inactive.' });
    }

    const assumedOriginalSponsor = getAssumedSponsorOriginalUser(req, userId);

    let sponsorCompanyId = null;
    if (assumedOriginalSponsor) {
      const [sponsorRows] = await pool.execute(
        'SELECT SponsorCompanyID FROM SPONSORS WHERE UserID = ? LIMIT 1',
        [assumedOriginalSponsor.UserID]
      );

      if (sponsorRows.length === 0) {
        return res.status(403).json({ error: 'Assumed sponsor context is invalid.' });
      }

      sponsorCompanyId = Number(sponsorRows[0].SponsorCompanyID);
    } else {
      const rawSponsorCompanyId = req.query?.sponsorCompanyId;
      const parsed = typeof rawSponsorCompanyId === 'string' ? Number(rawSponsorCompanyId) : Number(rawSponsorCompanyId);
      sponsorCompanyId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }

    if (!Number.isInteger(sponsorCompanyId)) {
      return res.status(400).json({ error: 'sponsorCompanyId is required.' });
    }

    const [rows] = await pool.execute(
      'SELECT LicenseNumber FROM DRIVERS WHERE UserID = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    const licenseNumber = String(rows[0].LicenseNumber);

    const [enrollmentRows] = await pool.execute(
      `SELECT PointBalance
       FROM DRIVER_COMPANY_ENROLLMENT
       WHERE DriverID = ?
         AND SponsorCompanyID = ?
         AND EnrollmentStatus = 'active'
       LIMIT 1`,
      [licenseNumber, sponsorCompanyId]
    );

    if (enrollmentRows.length === 0) {
      return res.status(403).json({ error: 'Access forbidden: Driver not enrolled in the requested sponsor company' });
    }

    req.driver = {
      userId,
      licenseNumber,
      sponsorCompanyId,
      pointBalance: Number(enrollmentRows[0].PointBalance ?? 0),
    };

    return next();
  } catch (error) {
    console.error('Driver context error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

router.use(loadDriverContext);

function normalizeOrderItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      itemId: Number(item?.itemId),
      quantity: Number(item?.quantity ?? 0),
    }))
    .filter((item) => Number.isInteger(item.itemId) && item.itemId > 0)
    .map((item) => ({
      ...item,
      quantity: Number.isFinite(item.quantity) ? Math.floor(item.quantity) : 0,
    }))
    .filter((item) => item.quantity > 0);
}

function getAssumedSponsorOriginalUser(req, expectedDriverUserId) {
  const sessionContext = req.sessionContext;
  if (!sessionContext?.isAssumed) {
    return null;
  }

  const effectiveUser = sessionContext.effectiveUser;
  const originalUser = sessionContext.originalUser;

  if (
    !effectiveUser ||
    !originalUser ||
    String(effectiveUser.UserType).toLowerCase() !== 'driver' ||
    String(originalUser.UserType).toLowerCase() !== 'sponsor' ||
    Number(effectiveUser.UserID) !== Number(expectedDriverUserId)
  ) {
    return null;
  }

  return originalUser;
}

async function fetchCatalogItems(connection, itemIds, sponsorCompanyId) {
  const placeholders = itemIds.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT ci.ItemID, ci.ItemName, ci.PointCost, ci.ImageUrl
     FROM CATALOG_ITEMS ci
     JOIN CATALOGS c ON ci.CatalogID = c.CatalogID
     WHERE ci.ItemID IN (${placeholders}) AND c.SponsorCompanyID = ?`,
    [...itemIds, sponsorCompanyId]
  );
  return rows;
}

// GET /api/driver/:userId/orders
router.get('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT
         o.OrderID,
        DATE_FORMAT(o.OrderDate, '%Y-%m-%d %H:%i:%s') AS OrderDate,
         o.OrderPointsSpent,
         o.OrderDollarsSpent,
         o.OrderStatus,
         o.SponsorCompanyID,
         sc.CompanyName as SponsorCompanyName,
         oi.OrderItemID,
         oi.ItemID,
         oi.Quantity,
         oi.UnitPointCost,
         oi.UnitDollarCost,
         ci.ItemName,
         ci.ImageUrl
       FROM ORDERS o
       JOIN ORDER_ITEMS oi ON o.OrderID = oi.OrderID
       JOIN CATALOG_ITEMS ci ON oi.ItemID = ci.ItemID
       LEFT JOIN SPONSOR_COMPANIES sc ON o.SponsorCompanyID = sc.SponsorCompanyID
       WHERE o.DriverID = ?
         AND o.SponsorCompanyID = ?
         AND o.OrderDate IS NOT NULL
         AND o.OrderDate >= '2000-01-01 00:00:00'
       ORDER BY o.OrderDate DESC, oi.OrderItemID ASC`,
      [req.driver.licenseNumber, req.driver.sponsorCompanyId]
    );

    const ordersById = new Map();
    for (const row of rows) {
      if (!ordersById.has(row.OrderID)) {
        ordersById.set(row.OrderID, {
          orderId: row.OrderID,
          orderDate: row.OrderDate ?? null,
          orderPointsSpent: Number(row.OrderPointsSpent ?? 0),
          orderDollarsSpent: Number(row.OrderDollarsSpent ?? 0),
          orderStatus: row.OrderStatus,
          sponsorCompanyId: row.SponsorCompanyID,
          sponsorCompanyName: row.SponsorCompanyName ?? null,
          items: [],
        });
      }

      ordersById.get(row.OrderID).items.push({
        orderItemId: row.OrderItemID,
        itemId: row.ItemID,
        name: row.ItemName,
        imageUrl: row.ImageUrl,
        quantity: Number(row.Quantity ?? 0),
        unitPointCost: Number(row.UnitPointCost ?? 0),
        unitDollarCost: Number(row.UnitDollarCost ?? 0),
      });
    }

    return res.json([...ordersById.values()]);
  } catch (error) {
    console.error('Error fetching driver orders:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    connection.release();
  }
});

// POST /api/driver/:userId/orders
router.post('/', async (req, res) => {
  const items = normalizeOrderItems(req.body?.items);
  if (items.length === 0) {
    return res.status(400).json({ error: 'At least one order item is required' });
  }

  const assumedSponsorOriginalUser = getAssumedSponsorOriginalUser(req, req.driver.userId);
  const pointActorUserId = assumedSponsorOriginalUser
    ? Number(assumedSponsorOriginalUser.UserID)
    : req.driver.userId;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [sponsorRows] = await connection.execute(
      'SELECT PointDollarValue FROM SPONSOR_COMPANIES WHERE SponsorCompanyID = ?',
      [req.driver.sponsorCompanyId]
    );

    if (sponsorRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Sponsor company not found for driver' });
    }

    const pointDollarValue = Number(sponsorRows[0].PointDollarValue ?? 0);

    const itemIds = items.map((item) => item.itemId);
    const catalogItems = await fetchCatalogItems(connection, itemIds, req.driver.sponsorCompanyId);

    if (catalogItems.length !== itemIds.length) {
      await connection.rollback();
      return res.status(400).json({ error: 'One or more items are not available for this sponsor' });
    }

    const catalogById = new Map();
    for (const item of catalogItems) {
      catalogById.set(item.ItemID, item);
    }

    let totalPoints = 0;
    let totalDollars = 0;

    const orderItems = items.map((item) => {
      const catalogItem = catalogById.get(item.itemId);
      const unitPointCost = Number(catalogItem.PointCost ?? 0);
      const unitDollarCost = Number((unitPointCost * pointDollarValue).toFixed(2));
      const linePoints = unitPointCost * item.quantity;
      const lineDollars = Number((unitDollarCost * item.quantity).toFixed(2));

      totalPoints += linePoints;
      totalDollars += lineDollars;

      return {
        itemId: item.itemId,
        quantity: item.quantity,
        unitPointCost,
        unitDollarCost,
      };
    });

    if (totalPoints <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Order total must be greater than zero' });
    }

    if (totalPoints > req.driver.pointBalance) {
      await connection.rollback();
      return res.status(400).json({ error: 'Insufficient points for this order' });
    }

    const [orderResult] = await connection.execute(
      `INSERT INTO ORDERS
        (DriverID, SponsorCompanyID, OrderDate, OrderPointsSpent, OrderDollarsSpent, OrderStatus)
       VALUES (?, ?, NOW(), ?, ?, 'confirmed')`,
      [
        req.driver.licenseNumber,
        req.driver.sponsorCompanyId,
        totalPoints,
        totalDollars,
      ]
    );

    const orderId = orderResult.insertId;

    const orderItemValues = orderItems.map((item) => [
      orderId,
      item.itemId,
      item.quantity,
      item.unitPointCost,
      item.unitDollarCost,
    ]);

    await connection.query(
      `INSERT INTO ORDER_ITEMS
        (OrderID, ItemID, Quantity, UnitPointCost, UnitDollarCost)
       VALUES ?`,
      [orderItemValues]
    );

    const [balanceUpdate] = await connection.execute(
      `UPDATE DRIVER_COMPANY_ENROLLMENT
       SET PointBalance = PointBalance - ?
       WHERE DriverID = ?
         AND SponsorCompanyID = ?
         AND EnrollmentStatus = 'active'`,
      [totalPoints, req.driver.licenseNumber, req.driver.sponsorCompanyId]
    );

    if (!balanceUpdate || Number(balanceUpdate.affectedRows ?? 0) === 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Driver enrollment is not active for this sponsor company' });
    }

    await connection.execute(
      `INSERT INTO POINT_TRANSACTIONS
        (DriverID, SponsorCompanyID, UserChanged, PointChange, ReasonForChange, TimeChanged)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        req.driver.licenseNumber,
        req.driver.sponsorCompanyId,
        pointActorUserId,
        -totalPoints,
        `Order #${orderId} placed`,
      ]
    );

    if (assumedSponsorOriginalUser) {
      const driverNotificationContext = await getDriverNotificationContextByUserId(
        connection,
        req.driver.userId
      );

      await notifyDriver(connection, {
        driverContext: driverNotificationContext,
        actorUserId: pointActorUserId,
        content: `Your sponsor placed order #${orderId} on your behalf.`,
        category: 'driver_order_changed_by_sponsor',
        preference: 'orders',
        metadata: {
          orderId,
          sponsorCompanyId: req.driver.sponsorCompanyId,
          changeType: 'created_by_sponsor',
        },
      });
    }

    await connection.commit();

    return res.status(201).json({
      orderId,
      orderPointsSpent: totalPoints,
      orderDollarsSpent: totalDollars,
      orderStatus: 'confirmed',
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating order:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    connection.release();
  }
});

// PATCH /api/driver/:userId/orders/:orderId
router.patch('/:orderId', async (req, res) => {
  const items = normalizeOrderItems(req.body?.items);
  if (items.length === 0) {
    return res.status(400).json({ error: 'At least one order item is required' });
  }

  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId)) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }

  const assumedSponsorOriginalUser = getAssumedSponsorOriginalUser(req, req.driver.userId);
  const pointActorUserId = assumedSponsorOriginalUser
    ? Number(assumedSponsorOriginalUser.UserID)
    : req.driver.userId;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [orderRows] = await connection.execute(
      'SELECT OrderStatus, OrderPointsSpent FROM ORDERS WHERE OrderID = ? AND DriverID = ? AND SponsorCompanyID = ?',
      [orderId, req.driver.licenseNumber, req.driver.sponsorCompanyId]
    );

    if (orderRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Order not found' });
    }

    if (orderRows[0].OrderStatus !== 'confirmed') {
      await connection.rollback();
      return res.status(409).json({ error: 'Only confirmed orders can be updated' });
    }

    const [sponsorRows] = await connection.execute(
      'SELECT PointDollarValue FROM SPONSOR_COMPANIES WHERE SponsorCompanyID = ?',
      [req.driver.sponsorCompanyId]
    );

    const pointDollarValue = Number(sponsorRows[0]?.PointDollarValue ?? 0);

    const itemIds = items.map((item) => item.itemId);
    const catalogItems = await fetchCatalogItems(connection, itemIds, req.driver.sponsorCompanyId);

    if (catalogItems.length !== itemIds.length) {
      await connection.rollback();
      return res.status(400).json({ error: 'One or more items are not available for this sponsor' });
    }

    const catalogById = new Map();
    for (const item of catalogItems) {
      catalogById.set(item.ItemID, item);
    }

    let totalPoints = 0;
    let totalDollars = 0;

    const orderItems = items.map((item) => {
      const catalogItem = catalogById.get(item.itemId);
      const unitPointCost = Number(catalogItem.PointCost ?? 0);
      const unitDollarCost = Number((unitPointCost * pointDollarValue).toFixed(2));
      const linePoints = unitPointCost * item.quantity;
      const lineDollars = Number((unitDollarCost * item.quantity).toFixed(2));

      totalPoints += linePoints;
      totalDollars += lineDollars;

      return {
        itemId: item.itemId,
        quantity: item.quantity,
        unitPointCost,
        unitDollarCost,
      };
    });

    if (totalPoints <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Order total must be greater than zero' });
    }

    const oldPoints = Number(orderRows[0].OrderPointsSpent ?? 0);
    const delta = totalPoints - oldPoints;

    if (delta > 0 && delta > req.driver.pointBalance) {
      await connection.rollback();
      return res.status(400).json({ error: 'Insufficient points for this update' });
    }

    await connection.execute(
      `UPDATE ORDERS
       SET OrderPointsSpent = ?, OrderDollarsSpent = ?
       WHERE OrderID = ?
         AND DriverID = ?
         AND SponsorCompanyID = ?`,
      [totalPoints, totalDollars, orderId, req.driver.licenseNumber, req.driver.sponsorCompanyId]
    );

    await connection.execute('DELETE FROM ORDER_ITEMS WHERE OrderID = ?', [orderId]);

    const orderItemValues = orderItems.map((item) => [
      orderId,
      item.itemId,
      item.quantity,
      item.unitPointCost,
      item.unitDollarCost,
    ]);

    await connection.query(
      `INSERT INTO ORDER_ITEMS
        (OrderID, ItemID, Quantity, UnitPointCost, UnitDollarCost)
       VALUES ?`,
      [orderItemValues]
    );

    if (delta !== 0) {
      const [balanceUpdate] = await connection.execute(
        `UPDATE DRIVER_COMPANY_ENROLLMENT
         SET PointBalance = PointBalance - ?
         WHERE DriverID = ?
           AND SponsorCompanyID = ?
           AND EnrollmentStatus = 'active'`,
        [delta, req.driver.licenseNumber, req.driver.sponsorCompanyId]
      );

      if (!balanceUpdate || Number(balanceUpdate.affectedRows ?? 0) === 0) {
        await connection.rollback();
        return res.status(409).json({ error: 'Driver enrollment is not active for this sponsor company' });
      }

      await connection.execute(
        `INSERT INTO POINT_TRANSACTIONS
          (DriverID, SponsorCompanyID, UserChanged, PointChange, ReasonForChange, TimeChanged)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [
          req.driver.licenseNumber,
          req.driver.sponsorCompanyId,
          pointActorUserId,
          -delta,
          `Order #${orderId} updated`,
        ]
      );
    }

    if (assumedSponsorOriginalUser) {
      const driverNotificationContext = await getDriverNotificationContextByUserId(
        connection,
        req.driver.userId
      );

      await notifyDriver(connection, {
        driverContext: driverNotificationContext,
        actorUserId: pointActorUserId,
        content: `Your sponsor updated order #${orderId}.`,
        category: 'driver_order_changed_by_sponsor',
        preference: 'orders',
        metadata: {
          orderId,
          sponsorCompanyId: req.driver.sponsorCompanyId,
          changeType: 'updated_by_sponsor',
        },
      });
    }

    await connection.commit();

    return res.json({
      orderId,
      orderPointsSpent: totalPoints,
      orderDollarsSpent: totalDollars,
      orderStatus: 'confirmed',
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating order:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    connection.release();
  }
});

// PATCH /api/driver/:userId/orders/:orderId/status
// Only sponsors in assumed-driver view can change status.
router.patch('/:orderId/status', async (req, res) => {
  const orderId = Number(req.params.orderId);
  const nextStatus = String(req.body?.orderStatus ?? '').trim().toLowerCase();

  if (!Number.isInteger(orderId)) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }

  const allowedStatuses = ['confirmed', 'shipped', 'delivered', 'cancelled'];
  if (!allowedStatuses.includes(nextStatus)) {
    return res.status(400).json({ error: 'orderStatus must be one of confirmed, shipped, delivered, cancelled' });
  }

  const assumedSponsorOriginalUser = getAssumedSponsorOriginalUser(req, req.driver.userId);
  if (!assumedSponsorOriginalUser) {
    return res.status(403).json({ error: 'Only sponsors in assumed-driver view can update order status.' });
  }

  const sponsorUserId = Number(assumedSponsorOriginalUser.UserID);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [sponsorRows] = await connection.execute(
      'SELECT SponsorCompanyID FROM SPONSORS WHERE UserID = ? LIMIT 1',
      [sponsorUserId]
    );

    if (sponsorRows.length === 0) {
      await connection.rollback();
      return res.status(403).json({ error: 'Assumed sponsor context is invalid.' });
    }

    const sponsorCompanyId = Number(sponsorRows[0].SponsorCompanyID);

    const [orderRows] = await connection.execute(
      `SELECT OrderStatus
       FROM ORDERS
       WHERE OrderID = ? AND DriverID = ? AND SponsorCompanyID = ?
       LIMIT 1`,
      [orderId, req.driver.licenseNumber, sponsorCompanyId]
    );

    if (orderRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Order not found' });
    }

    const currentStatus = String(orderRows[0].OrderStatus ?? '').toLowerCase();
    if (currentStatus === nextStatus) {
      await connection.rollback();
      return res.status(200).json({ orderId, orderStatus: nextStatus });
    }

    if (currentStatus === 'cancelled' || currentStatus === 'delivered') {
      await connection.rollback();
      return res.status(409).json({ error: `Cannot change order status from ${currentStatus}.` });
    }

    const validTransitions = {
      confirmed: ['shipped', 'cancelled', 'delivered'],
      shipped: ['delivered', 'cancelled'],
    };

    if (!validTransitions[currentStatus]?.includes(nextStatus)) {
      await connection.rollback();
      return res.status(409).json({ error: `Cannot change order status from ${currentStatus} to ${nextStatus}.` });
    }

    await connection.execute(
      'UPDATE ORDERS SET OrderStatus = ? WHERE OrderID = ? AND DriverID = ? AND SponsorCompanyID = ?',
      [nextStatus, orderId, req.driver.licenseNumber, sponsorCompanyId]
    );

    const driverNotificationContext = await getDriverNotificationContextByUserId(
      connection,
      req.driver.userId
    );
    await notifyDriver(connection, {
      driverContext: driverNotificationContext,
      actorUserId: sponsorUserId,
      content: `Your order #${orderId} status changed to ${nextStatus}.`,
      category: 'driver_order_status_changed',
      preference: 'orders',
      metadata: {
        orderId,
        oldStatus: currentStatus,
        newStatus: nextStatus,
        sponsorCompanyId,
      },
    });

    await connection.commit();
    return res.status(200).json({ orderId, orderStatus: nextStatus });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating order status:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    connection.release();
  }
});

// DELETE /api/driver/:userId/orders/:orderId (cancel)
router.delete('/:orderId', async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId)) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }

  const assumedSponsorOriginalUser = getAssumedSponsorOriginalUser(req, req.driver.userId);
  const pointActorUserId = assumedSponsorOriginalUser
    ? Number(assumedSponsorOriginalUser.UserID)
    : req.driver.userId;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [orderRows] = await connection.execute(
      'SELECT OrderStatus, OrderPointsSpent FROM ORDERS WHERE OrderID = ? AND DriverID = ? AND SponsorCompanyID = ?',
      [orderId, req.driver.licenseNumber, req.driver.sponsorCompanyId]
    );

    if (orderRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Order not found' });
    }

    if (orderRows[0].OrderStatus !== 'confirmed') {
      await connection.rollback();
      return res.status(409).json({ error: 'Only confirmed orders can be cancelled' });
    }

    const refundPoints = Number(orderRows[0].OrderPointsSpent ?? 0);

    await connection.execute(
      `UPDATE ORDERS
       SET OrderStatus = 'cancelled'
       WHERE OrderID = ?
         AND DriverID = ?
         AND SponsorCompanyID = ?`,
      [orderId, req.driver.licenseNumber, req.driver.sponsorCompanyId]
    );

    const [balanceUpdate] = await connection.execute(
      `UPDATE DRIVER_COMPANY_ENROLLMENT
       SET PointBalance = PointBalance + ?
       WHERE DriverID = ?
         AND SponsorCompanyID = ?
         AND EnrollmentStatus = 'active'`,
      [refundPoints, req.driver.licenseNumber, req.driver.sponsorCompanyId]
    );

    if (!balanceUpdate || Number(balanceUpdate.affectedRows ?? 0) === 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Driver enrollment is not active for this sponsor company' });
    }

    await connection.execute(
      `INSERT INTO POINT_TRANSACTIONS
        (DriverID, SponsorCompanyID, UserChanged, PointChange, ReasonForChange, TimeChanged)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        req.driver.licenseNumber,
        req.driver.sponsorCompanyId,
        pointActorUserId,
        refundPoints,
        `Order #${orderId} cancelled`,
      ]
    );

    if (assumedSponsorOriginalUser) {
      const driverNotificationContext = await getDriverNotificationContextByUserId(
        connection,
        req.driver.userId
      );

      await notifyDriver(connection, {
        driverContext: driverNotificationContext,
        actorUserId: pointActorUserId,
        content: `Your sponsor cancelled order #${orderId}.`,
        category: 'driver_order_changed_by_sponsor',
        preference: 'orders',
        metadata: {
          orderId,
          sponsorCompanyId: req.driver.sponsorCompanyId,
          changeType: 'cancelled_by_sponsor',
        },
      });
    }

    await connection.commit();
    return res.json({ orderId, orderStatus: 'cancelled' });
  } catch (error) {
    await connection.rollback();
    console.error('Error cancelling order:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    connection.release();
  }
});

export default router;
