const REVIEW_COMMENT_EVENT_TYPE = 'ReviewComment';
const REVIEW_DRAFT_EVENT_TYPE = 'ReviewDraft';

function parseProperties(rawProperties) {
  if (!rawProperties) return {};
  if (typeof rawProperties === 'object') return rawProperties;

  try {
    return JSON.parse(rawProperties);
  } catch {
    return {};
  }
}

function normalizePositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function normalizeOptionalInteger(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function normalizeCommentText(value) {
  return String(value ?? '').trim();
}

function toCommentDto(row) {
  const properties = parseProperties(row.Properties);
  const reviewId = normalizePositiveInteger(properties.reviewId);
  const sponsorCompanyId = normalizePositiveInteger(properties.sponsorCompanyId);
  const parentCommentId = normalizeOptionalInteger(properties.parentCommentId);
  const text = normalizeCommentText(properties.text);

  return {
    commentId: Number(row.EventID),
    reviewId,
    sponsorCompanyId,
    userId: Number(row.UserID),
    firstName: row.FirstName ?? null,
    lastName: row.LastName ?? null,
    parentCommentId,
    text,
    createdAt: row.Timestamp,
  };
}

function toDraftDto(row) {
  if (!row) {
    return null;
  }

  const properties = parseProperties(row.Properties);

  return {
    draftId: Number(row.EventID),
    itemId: normalizePositiveInteger(properties.itemId),
    sponsorCompanyId: normalizePositiveInteger(properties.sponsorCompanyId),
    userId: Number(row.UserID),
    rating: normalizeOptionalInteger(properties.rating),
    body: String(properties.body ?? ''),
    updatedAt: typeof properties.updatedAt === 'string' ? properties.updatedAt : null,
    finalizedAt: typeof properties.finalizedAt === 'string' ? properties.finalizedAt : null,
    clearedAt: typeof properties.clearedAt === 'string' ? properties.clearedAt : null,
    timestamp: row.Timestamp,
  };
}

export function normalizeDraftPayload(bodyValue, ratingValue) {
  const body = String(bodyValue ?? '').trim();
  if (!body) {
    return { error: 'body is required' };
  }

  if (body.length > 1000) {
    return { error: 'body must be 1000 characters or fewer' };
  }

  const parsedRating = Number(ratingValue);
  if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return { error: 'rating must be an integer between 1 and 5' };
  }

  return {
    body,
    rating: parsedRating,
  };
}

export function normalizeCommentPayload(textValue, parentCommentIdValue) {
  const text = String(textValue ?? '').trim();
  if (!text) {
    return { error: 'text is required' };
  }

  if (text.length > 1000) {
    return { error: 'text must be 1000 characters or fewer' };
  }

  if (
    parentCommentIdValue !== undefined &&
    parentCommentIdValue !== null &&
    parentCommentIdValue !== ''
  ) {
    const parentCommentId = Number(parentCommentIdValue);
    if (!Number.isInteger(parentCommentId) || parentCommentId <= 0) {
      return { error: 'parentCommentId must be a positive integer when provided' };
    }

    return { text, parentCommentId };
  }

  return {
    text,
    parentCommentId: null,
  };
}

export async function ensureReviewInSponsorScope(connection, reviewId, sponsorCompanyId, options = {}) {
  const visibleOnly = options.visibleOnly === true;
  const [rows] = await connection.execute(
    `SELECT r.ReviewID, r.ItemID, r.UserID, r.IsVisible
     FROM REVIEWS r
     JOIN CATALOG_ITEMS ci ON ci.ItemID = r.ItemID
     JOIN CATALOGS c ON c.CatalogID = ci.CatalogID
     WHERE r.ReviewID = ?
       AND c.SponsorCompanyID = ?
       ${visibleOnly ? 'AND r.IsVisible = 1' : ''}
     LIMIT 1`,
    [reviewId, sponsorCompanyId]
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    reviewId: Number(rows[0].ReviewID),
    itemId: Number(rows[0].ItemID),
    userId: Number(rows[0].UserID),
    isVisible: Boolean(rows[0].IsVisible),
  };
}

export async function ensureItemInSponsorCatalog(connection, itemId, sponsorCompanyId) {
  const [rows] = await connection.execute(
    `SELECT ci.ItemID
     FROM CATALOG_ITEMS ci
     JOIN CATALOGS c ON c.CatalogID = ci.CatalogID
     WHERE ci.ItemID = ?
       AND c.SponsorCompanyID = ?
     LIMIT 1`,
    [itemId, sponsorCompanyId]
  );

  return rows.length > 0;
}

export async function ensureDriverEligibleOrder(connection, licenseNumber, sponsorCompanyId, itemId) {
  const [rows] = await connection.execute(
    `SELECT o.OrderID
     FROM ORDERS o
     JOIN ORDER_ITEMS oi ON oi.OrderID = o.OrderID
     WHERE o.DriverID = ?
       AND o.SponsorCompanyID = ?
       AND oi.ItemID = ?
       AND o.OrderStatus IN ('confirmed', 'shipped', 'delivered')
     LIMIT 1`,
    [licenseNumber, sponsorCompanyId, itemId]
  );

  return rows.length > 0;
}

export async function listDriverSponsorReviews(connection, sponsorCompanyId, options = {}) {
  const limit = Number.isInteger(Number(options.limit)) ? Math.min(Math.max(Number(options.limit), 1), 100) : 100;
  const itemId = normalizePositiveInteger(options.itemId);

  const whereClauses = ['c.SponsorCompanyID = ?', 'r.IsVisible = 1'];
  const params = [sponsorCompanyId];

  if (itemId) {
    whereClauses.push('r.ItemID = ?');
    params.push(itemId);
  }

  const [rows] = await connection.execute(
    `SELECT r.ReviewID, r.ItemID, r.UserID, r.Rating, r.ReviewBody, r.Timestamp, u.Username, u.FirstName, u.LastName,
            ci.ItemName
     FROM REVIEWS r
     JOIN USERS u ON u.UserID = r.UserID
     JOIN CATALOG_ITEMS ci ON ci.ItemID = r.ItemID
     JOIN CATALOGS c ON c.CatalogID = ci.CatalogID
     WHERE ${whereClauses.join(' AND ')}
     ORDER BY r.Timestamp DESC, r.ReviewID DESC
     LIMIT ${limit}`,
    params
  );

  return rows.map((row) => ({
    reviewId: Number(row.ReviewID),
    itemId: Number(row.ItemID),
    userId: Number(row.UserID),
    rating: Number(row.Rating),
    body: String(row.ReviewBody ?? ''),
    timestamp: row.Timestamp,
    username: row.Username,
    firstName: row.FirstName,
    lastName: row.LastName,
    itemName: row.ItemName,
  }));
}

export async function listReviewComments(connection, reviewId, sponsorCompanyId) {
  const [rows] = await connection.execute(
    `SELECT e.EventID, e.UserID, e.Timestamp, e.Properties, u.FirstName, u.LastName
     FROM EVENTS e
     JOIN USERS u ON u.UserID = e.UserID
     WHERE e.EventType = ?
       AND CAST(JSON_UNQUOTE(JSON_EXTRACT(COALESCE(e.Properties, JSON_OBJECT()), '$.reviewId')) AS UNSIGNED) = ?
       AND CAST(JSON_UNQUOTE(JSON_EXTRACT(COALESCE(e.Properties, JSON_OBJECT()), '$.sponsorCompanyId')) AS UNSIGNED) = ?
       AND (
         JSON_EXTRACT(COALESCE(e.Properties, JSON_OBJECT()), '$.hiddenAt') IS NULL
         OR JSON_TYPE(JSON_EXTRACT(COALESCE(e.Properties, JSON_OBJECT()), '$.hiddenAt')) = 'NULL'
       )
     ORDER BY e.Timestamp ASC, e.EventID ASC`,
    [REVIEW_COMMENT_EVENT_TYPE, reviewId, sponsorCompanyId]
  );

  return rows.map(toCommentDto);
}

export async function getReviewCommentById(connection, commentId, reviewId, sponsorCompanyId) {
  const [rows] = await connection.execute(
    `SELECT e.EventID, e.UserID, e.Timestamp, e.Properties, u.FirstName, u.LastName
     FROM EVENTS e
     JOIN USERS u ON u.UserID = e.UserID
     WHERE e.EventType = ?
       AND e.EventID = ?
       AND CAST(JSON_UNQUOTE(JSON_EXTRACT(COALESCE(e.Properties, JSON_OBJECT()), '$.reviewId')) AS UNSIGNED) = ?
       AND CAST(JSON_UNQUOTE(JSON_EXTRACT(COALESCE(e.Properties, JSON_OBJECT()), '$.sponsorCompanyId')) AS UNSIGNED) = ?
       AND (
         JSON_EXTRACT(COALESCE(e.Properties, JSON_OBJECT()), '$.hiddenAt') IS NULL
         OR JSON_TYPE(JSON_EXTRACT(COALESCE(e.Properties, JSON_OBJECT()), '$.hiddenAt')) = 'NULL'
       )
     LIMIT 1`,
    [REVIEW_COMMENT_EVENT_TYPE, commentId, reviewId, sponsorCompanyId]
  );

  if (rows.length === 0) {
    return null;
  }

  return toCommentDto(rows[0]);
}

export async function createReviewComment(connection, payload) {
  const properties = {
    reviewId: payload.reviewId,
    sponsorCompanyId: payload.sponsorCompanyId,
    authorUserId: payload.userId,
    parentCommentId: payload.parentCommentId,
    text: payload.text,
  };

  const [insertResult] = await connection.execute(
    `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
     VALUES (?, NOW(), ?, ?)`,
    [payload.userId, REVIEW_COMMENT_EVENT_TYPE, JSON.stringify(properties)]
  );

  return getReviewCommentById(connection, insertResult.insertId, payload.reviewId, payload.sponsorCompanyId);
}

async function getActiveDraftRow(connection, userId, sponsorCompanyId, itemId) {
  const [rows] = await connection.execute(
    `SELECT e.EventID, e.UserID, e.Timestamp, e.Properties
     FROM EVENTS e
     WHERE e.UserID = ?
       AND e.EventType = ?
       AND CAST(JSON_UNQUOTE(JSON_EXTRACT(COALESCE(e.Properties, JSON_OBJECT()), '$.itemId')) AS UNSIGNED) = ?
       AND CAST(JSON_UNQUOTE(JSON_EXTRACT(COALESCE(e.Properties, JSON_OBJECT()), '$.sponsorCompanyId')) AS UNSIGNED) = ?
       AND (
         JSON_EXTRACT(COALESCE(e.Properties, JSON_OBJECT()), '$.finalizedAt') IS NULL
         OR JSON_TYPE(JSON_EXTRACT(COALESCE(e.Properties, JSON_OBJECT()), '$.finalizedAt')) = 'NULL'
       )
       AND (
         JSON_EXTRACT(COALESCE(e.Properties, JSON_OBJECT()), '$.clearedAt') IS NULL
         OR JSON_TYPE(JSON_EXTRACT(COALESCE(e.Properties, JSON_OBJECT()), '$.clearedAt')) = 'NULL'
       )
     ORDER BY e.Timestamp DESC, e.EventID DESC
     LIMIT 1`,
    [userId, REVIEW_DRAFT_EVENT_TYPE, itemId, sponsorCompanyId]
  );

  return rows[0] ?? null;
}

async function persistDraftPropertiesByEventId(connection, eventId, properties, touchTimestamp = true) {
  if (touchTimestamp) {
    await connection.execute(
      'UPDATE EVENTS SET Timestamp = NOW(), Properties = ? WHERE EventID = ? LIMIT 1',
      [JSON.stringify(properties), eventId]
    );
  } else {
    await connection.execute(
      'UPDATE EVENTS SET Properties = ? WHERE EventID = ? LIMIT 1',
      [JSON.stringify(properties), eventId]
    );
  }
}

export async function loadActiveReviewDraft(connection, userId, sponsorCompanyId, itemId) {
  const row = await getActiveDraftRow(connection, userId, sponsorCompanyId, itemId);
  return toDraftDto(row);
}

export async function upsertReviewDraft(connection, payload) {
  const nowIso = new Date().toISOString();
  const existingRow = await getActiveDraftRow(
    connection,
    payload.userId,
    payload.sponsorCompanyId,
    payload.itemId
  );

  if (existingRow) {
    const existingProperties = parseProperties(existingRow.Properties);
    const nextProperties = {
      ...existingProperties,
      itemId: payload.itemId,
      sponsorCompanyId: payload.sponsorCompanyId,
      authorUserId: payload.userId,
      rating: payload.rating,
      body: payload.body,
      updatedAt: nowIso,
      finalizedAt: null,
      clearedAt: null,
    };

    await persistDraftPropertiesByEventId(connection, existingRow.EventID, nextProperties, true);
    return loadActiveReviewDraft(connection, payload.userId, payload.sponsorCompanyId, payload.itemId);
  }

  const properties = {
    itemId: payload.itemId,
    sponsorCompanyId: payload.sponsorCompanyId,
    authorUserId: payload.userId,
    rating: payload.rating,
    body: payload.body,
    updatedAt: nowIso,
    finalizedAt: null,
    clearedAt: null,
  };

  await connection.execute(
    `INSERT INTO EVENTS (UserID, Timestamp, EventType, Properties)
     VALUES (?, NOW(), ?, ?)`,
    [payload.userId, REVIEW_DRAFT_EVENT_TYPE, JSON.stringify(properties)]
  );

  return loadActiveReviewDraft(connection, payload.userId, payload.sponsorCompanyId, payload.itemId);
}

export async function clearReviewDraft(connection, userId, sponsorCompanyId, itemId) {
  const activeRow = await getActiveDraftRow(connection, userId, sponsorCompanyId, itemId);
  if (!activeRow) {
    return false;
  }

  const properties = parseProperties(activeRow.Properties);
  properties.clearedAt = new Date().toISOString();
  await persistDraftPropertiesByEventId(connection, activeRow.EventID, properties, true);
  return true;
}

export async function finalizeReviewDraft(connection, userId, sponsorCompanyId, itemId) {
  const activeRow = await getActiveDraftRow(connection, userId, sponsorCompanyId, itemId);
  if (!activeRow) {
    return false;
  }

  const properties = parseProperties(activeRow.Properties);
  properties.finalizedAt = new Date().toISOString();
  await persistDraftPropertiesByEventId(connection, activeRow.EventID, properties, false);
  return true;
}

export const reviewInteractionEventTypes = {
  REVIEW_COMMENT_EVENT_TYPE,
  REVIEW_DRAFT_EVENT_TYPE,
};
