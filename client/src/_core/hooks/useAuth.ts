// Auth disabled - always returns guest mode
export function useAuth(_options?: { redirectOnUnauthenticated?: boolean; redirectPath?: string }) {
  return {
    user: null,
    loading: false,
    error: null,
    isAuthenticated: false,
    refresh: () => Promise.resolve(),
    logout: () => Promise.resolve(),
  };
}
