/**
 * session.server.ts
 * Server-only auth utilities: JWT session management (sign, verify, cookie helpers).
 * All functions in this file run only in SSR (Node) context — never in the browser.
 *
 * NOTE: Run `npm install` in /client after adding jsonwebtoken to package.json.
 * Add JWT_SECRET=<random-32+-char-string> to ../../.fs-env before deploying.
 */
import jwt from "jsonwebtoken";
import { redirect } from "react-router";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserRole = "driver" | "sponsor" | "admin";

export interface SessionUser {
  UserID: number;
  UserType: UserRole;
  Username: string;
  FirstName?: string;
  LastName?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET =
  process.env.JWT_SECRET || "dev-secret-change-in-production-fleetscore";

/** Cookie name matching the OpenAPI securityScheme definition. */
const COOKIE_NAME = "sessionId";

/** 24-hour lifetime (seconds). */
const MAX_AGE_SECONDS = 60 * 60 * 24;

// ---------------------------------------------------------------------------
// Role-based redirect paths
// Single object so future route renames (e.g. /catalogs) are one-line changes.
// ---------------------------------------------------------------------------
export const ROLE_HOME: Record<UserRole, string> = {
  driver: "/driver/dashboard",
  sponsor: "/sponsor/catalogs",
  admin: "/admin/dashboard",
};

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

/** Sign a JWT for the given user and return it as a string. */
export function signToken(user: SessionUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: MAX_AGE_SECONDS });
}

/** Verify a JWT string. Returns the decoded payload or null if invalid/expired. */
export function verifyToken(token: string): SessionUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionUser;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie header helpers
// ---------------------------------------------------------------------------

/** Build the Set-Cookie header value that sets the HttpOnly session cookie. */
export function buildSetCookieHeader(token: string): string {
  return [
    `${COOKIE_NAME}=${token}`,
    `Max-Age=${MAX_AGE_SECONDS}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ].join("; ");
}

/** Build the Set-Cookie header value that clears (expires) the session cookie. */
export function buildClearCookieHeader(): string {
  return [`${COOKIE_NAME}=`, "Max-Age=0", "Path=/", "HttpOnly", "SameSite=Lax"].join(
    "; "
  );
}

// ---------------------------------------------------------------------------
// Session accessors (called from SSR loaders and actions)
// ---------------------------------------------------------------------------

/**
 * Parse the request's Cookie header and return the decoded SessionUser,
 * or null if the cookie is absent or the JWT is invalid/expired.
 */
export function getSession(request: Request): SessionUser | null {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));

  if (!match) return null;

  const token = match.slice(COOKIE_NAME.length + 1);
  return verifyToken(token);
}

/**
 * Require a valid session.
 * Throws a redirect to /login if unauthenticated, or to the user's own home
 * if authenticated but the wrong role.
 *
 * @param request       The incoming Request (from loader/action args)
 * @param allowedRoles  Optional role whitelist; omit to allow any authenticated user
 * @returns             The decoded SessionUser
 */
export function requireAuth(
  request: Request,
  allowedRoles?: UserRole[]
): SessionUser {
  const user = getSession(request);

  if (!user) {
    throw redirect("/login");
  }

  if (allowedRoles && !allowedRoles.includes(user.UserType)) {
    // Authenticated but wrong role — redirect to their own dashboard
    throw redirect(ROLE_HOME[user.UserType] ?? "/login");
  }

  return user;
}
