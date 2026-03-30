import express from 'express';
import { pool } from '../db.js';
import { userExists } from '../utils/queries.js';

const router = express.Router({ mergeParams: true });

async function loadDriverContext(req, res, next) {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const exists = await userExists(userId);
    if (!exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [rows] = await pool.execute(
      'SELECT LicenseNumber, SponsorCompanyID, PointBalance FROM DRIVERS WHERE UserID = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    req.driver = {
      userId,
      licenseNumber: rows[0].LicenseNumber,
      sponsorCompanyId: rows[0].SponsorCompanyID,
      pointBalance: Number(rows[0].PointBalance ?? 0),
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
         o.OrderDate,
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
       ORDER BY o.OrderDate DESC, oi.OrderItemID ASC`,
      [req.driver.licenseNumber]
    );

    const ordersById = new Map();
    for (const row of rows) {
      if (!ordersById.has(row.OrderID)) {
        ordersById.set(row.OrderID, {
          orderId: row.OrderID,
          orderDate: row.OrderDate,
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

    await connection.execute(
      'UPDATE DRIVERS SET PointBalance = PointBalance - ? WHERE UserID = ?',
      [totalPoints, req.driver.userId]
    );

    await connection.execute(
      `INSERT INTO POINT_TRANSACTIONS
        (DriverID, UserChanged, PointChange, ReasonForChange, TimeChanged)
       VALUES (?, ?, ?, ?, NOW())`,
      [req.driver.licenseNumber, req.driver.userId, -totalPoints, `Order #${orderId} placed`]
    );

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

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [orderRows] = await connection.execute(
      'SELECT OrderStatus, OrderPointsSpent FROM ORDERS WHERE OrderID = ? AND DriverID = ?',
      [orderId, req.driver.licenseNumber]
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
       WHERE OrderID = ?`,
      [totalPoints, totalDollars, orderId]
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
      await connection.execute(
        'UPDATE DRIVERS SET PointBalance = PointBalance - ? WHERE UserID = ?',
        [delta, req.driver.userId]
      );

      await connection.execute(
        `INSERT INTO POINT_TRANSACTIONS
          (DriverID, UserChanged, PointChange, ReasonForChange, TimeChanged)
         VALUES (?, ?, ?, ?, NOW())`,
        [
          req.driver.licenseNumber,
          req.driver.userId,
          -delta,
          `Order #${orderId} updated`,
        ]
      );
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

// DELETE /api/driver/:userId/orders/:orderId (cancel)
router.delete('/:orderId', async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId)) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [orderRows] = await connection.execute(
      'SELECT OrderStatus, OrderPointsSpent FROM ORDERS WHERE OrderID = ? AND DriverID = ?',
      [orderId, req.driver.licenseNumber]
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
       WHERE OrderID = ?`,
      [orderId]
    );

    await connection.execute(
      'UPDATE DRIVERS SET PointBalance = PointBalance + ? WHERE UserID = ?',
      [refundPoints, req.driver.userId]
    );

    await connection.execute(
      `INSERT INTO POINT_TRANSACTIONS
        (DriverID, UserChanged, PointChange, ReasonForChange, TimeChanged)
       VALUES (?, ?, ?, ?, NOW())`,
      [
        req.driver.licenseNumber,
        req.driver.userId,
        refundPoints,
        `Order #${orderId} cancelled`,
      ]
    );

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
