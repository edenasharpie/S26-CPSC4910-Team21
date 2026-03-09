// =============================================================================
// api.context.tsx – React context for the ApiClient
//
// Wrap any subtree that needs API access with <ApiClientProvider user={...}>.
// Consume the client with the useApiClient() hook.
//
// TODO (auth): When real authentication is implemented, source `user` from
//   your session / auth store instead of passing it as a prop, for example:
//     const { session } = useAuth();
//     <ApiClientProvider user={session.user}>…</ApiClientProvider>
// =============================================================================

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { ApiClient, createApiClient, type AuthUser } from './api';

// ─── Context ─────────────────────────────────────────────────────────────────

const ApiClientContext = createContext<ApiClient | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

interface ApiClientProviderProps {
  /** The current user. Replace the stub value with real auth data when ready. */
  user: AuthUser;
  children: ReactNode;
}

/**
 * Makes an ApiClient available to all descendant components via useApiClient().
 *
 * Example:
 *   <ApiClientProvider user={{ id: 1, role: 'driver' }}>
 *     <App />
 *   </ApiClientProvider>
 */
export function ApiClientProvider({ user, children }: ApiClientProviderProps) {
  // Memoise so the client identity is stable as long as id+role don't change.
  const client = useMemo(() => createApiClient(user), [user.id, user.role]);

  return (
    <ApiClientContext.Provider value={client}>
      {children}
    </ApiClientContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the nearest ApiClient from context.
 * Must be called inside an <ApiClientProvider>.
 *
 * Example:
 *   const api = useApiClient();
 *   const res = await api.get('/catalogs');
 */
export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (!client) {
    throw new Error('useApiClient must be used within an <ApiClientProvider>');
  }
  return client;
}
