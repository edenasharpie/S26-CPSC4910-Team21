import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production-fleetscore';
const COOKIE_NAME = 'sessionId';

function parseCookies(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return {};
  }

  return cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((accumulator, cookie) => {
      const separatorIndex = cookie.indexOf('=');
      if (separatorIndex <= 0) {
        return accumulator;
      }

      const key = cookie.slice(0, separatorIndex).trim();
      const value = cookie.slice(separatorIndex + 1).trim();
      if (!key) {
        return accumulator;
      }

      accumulator[key] = value;
      return accumulator;
    }, {});
}

function normalizeIdentity(rawIdentity) {
  if (!rawIdentity || typeof rawIdentity !== 'object') {
    return null;
  }

  const userId = Number(rawIdentity.UserID);
  const userType = typeof rawIdentity.UserType === 'string' ? rawIdentity.UserType.toLowerCase() : '';
  if (!Number.isInteger(userId) || !userType) {
    return null;
  }

  return {
    UserID: userId,
    UserType: userType,
    Username: rawIdentity.Username,
    FirstName: rawIdentity.FirstName,
    LastName: rawIdentity.LastName,
  };
}

function decodeSessionToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function attachSessionContext(req, _res, next) {
  req.sessionContext = null;

  const cookies = parseCookies(req.headers?.cookie);
  const token = cookies[COOKIE_NAME];

  if (!token) {
    return next();
  }

  const decoded = decodeSessionToken(token);
  if (!decoded) {
    return next();
  }

  const effectiveUser = normalizeIdentity(decoded);
  const originalUser = normalizeIdentity(decoded.OriginalUser);

  if (!effectiveUser) {
    return next();
  }

  req.sessionContext = {
    effectiveUser,
    originalUser,
    isAssumed: Boolean(originalUser),
  };

  return next();
}

export function getEffectiveSessionUser(req) {
  return req.sessionContext?.effectiveUser ?? null;
}

export function routeUserMatchesEffectiveSession(req, routeUserId) {
  const effectiveUser = getEffectiveSessionUser(req);
  if (!effectiveUser) {
    return true;
  }

  return Number(effectiveUser.UserID) === Number(routeUserId);
}
