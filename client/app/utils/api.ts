// i think this file can be useful if used by the other files ofc, but many of the files are using their own variables
// along the lines of API_URL / BASE_URL to send api calls by themselves. I think we need it standardized the qay we're
// supposed to access the url and call the api.

// =============================================================================
// api.ts – Standardised API client for FleetScore
//
// Usage:
//   import { createApiClient } from '~/utils/api';
//
//   // Role-scoped calls (path is relative to /api/<role>/[<id>/])
//   const api = createApiClient({ id: 1, role: 'driver' });
//   const res = await api.get('/catalogs');
//
//   // Unscoped calls (path is relative to /api/)
//   const res = await api.fetchApi('/sponsors');
//
// Adding authentication later:
//   1. Add the appropriate fields (e.g. `token`) to the AuthUser interface.
//   2. Return them from getAuthHeaders() below.
//   3. Populate them when building the AuthUser passed to createApiClient().
// =============================================================================

// ─── User types ──────────────────────────────────────────────────────────────

import { getApiBaseUrl } from "~/utils/api-url";

export type UserRole = 'admin' | 'sponsor' | 'driver';

/**
 * Represents the currently-authenticated user context.
 *
 * TODO (auth): Extend this interface when real authentication is added, e.g.:
 *   token: string;
 *   expiresAt: number;
 */
export interface AuthUser {
  id: number;
  role: UserRole;
}

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Base URL for all API calls.
 * Override at build time with the VITE_API_URL environment variable.
 */
const API_BASE_URL: string =
  getApiBaseUrl();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the URL segment that prefixes all role-scoped API calls.
 *
 *   admin   → /api/admin
 *   sponsor → /api/sponsor/<id>
 *   driver  → /api/driver/<id>
 */
function getRolePrefix(user: AuthUser): string {
  switch (user.role) {
    case 'admin':
      return '/api/admin';
    case 'sponsor':
      return `/api/sponsor/${user.id}`;
    case 'driver':
      return `/api/driver/${user.id}`;
  }
}

/**
 * Returns HTTP headers to attach to every outgoing request.
 *
 * TODO (auth): Once authentication is wired up, return the bearer token here:
 *   return { Authorization: `Bearer ${user.token}` };
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getAuthHeaders(_user: AuthUser): HeadersInit {
  return {};
}

// ─── ApiClient ───────────────────────────────────────────────────────────────

export class ApiClient {
  readonly user: AuthUser;
  private readonly rolePrefix: string;

  constructor(user: AuthUser) {
    this.user = user;
    this.rolePrefix = getRolePrefix(user);
  }

  // ── Role-scoped methods ───────────────────────────────────────────────────
  //
  // The `path` argument is relative to the role prefix, e.g.:
  //   api.get('/catalogs')  →  GET /api/admin/catalogs   (for an admin user)
  //   api.get('/catalogs')  →  GET /api/driver/1/catalogs (for driver with id=1)

  /** Low-level role-scoped fetch. Prefer get/post/patch/delete for common verbs. */
  fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${API_BASE_URL}${this.rolePrefix}${path}`;
    return fetch(url, {
      ...init,
      credentials: init.credentials ?? 'include',
      headers: {
        ...getAuthHeaders(this.user),
        ...init.headers,
      },
    });
  }

  get(path: string, init?: RequestInit): Promise<Response> {
    return this.fetch(path, { ...init, method: 'GET' });
  }

  post(path: string, body: unknown, init?: RequestInit): Promise<Response> {
    return this.fetch(path, {
      ...init,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      body: JSON.stringify(body),
    });
  }

  patch(path: string, body: unknown, init?: RequestInit): Promise<Response> {
    return this.fetch(path, {
      ...init,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      body: JSON.stringify(body),
    });
  }

  delete(path: string, init?: RequestInit): Promise<Response> {
    return this.fetch(path, { ...init, method: 'DELETE' });
  }

  // ── Unscoped methods ──────────────────────────────────────────────────────
  //
  // Use these for endpoints that are not prefixed by a user role, e.g.:
  //   api.fetchApi('/sponsors')  →  GET /api/sponsors
  // Auth headers are still applied.

  /** Low-level unscoped fetch. `path` is relative to /api/. */
  fetchApi(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${API_BASE_URL}/api${path}`;
    return fetch(url, {
      ...init,
      credentials: init.credentials ?? 'include',
      headers: {
        ...getAuthHeaders(this.user),
        ...init.headers,
      },
    });
  }

  getApi(path: string, init?: RequestInit): Promise<Response> {
    return this.fetchApi(path, { ...init, method: 'GET' });
  }

  postApi(path: string, body: unknown, init?: RequestInit): Promise<Response> {
    return this.fetchApi(path, {
      ...init,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      body: JSON.stringify(body),
    });
  }

  patchApi(path: string, body: unknown, init?: RequestInit): Promise<Response> {
    return this.fetchApi(path, {
      ...init,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      body: JSON.stringify(body),
    });
  }

  deleteApi(path: string, init?: RequestInit): Promise<Response> {
    return this.fetchApi(path, { ...init, method: 'DELETE' });
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/** Create a new ApiClient for the given user. */
export function createApiClient(user: AuthUser): ApiClient {
  return new ApiClient(user);
}
