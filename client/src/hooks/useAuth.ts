import { trpc } from "@/lib/trpc";

/** Aktuell roll: "admin" (styrelsen), "lineup" (tillfällig länk) eller null. */
export function useAuth() {
  const me = trpc.auth.me.useQuery(undefined, { staleTime: 60_000, retry: false });
  const role = me.data?.role ?? null;
  return {
    loading: me.isLoading,
    role,
    isAdmin: role === "admin",
    canEditLineup: role === "admin" || role === "lineup",
    expiresAt: me.data?.expiresAt ?? null,
    refetch: me.refetch,
  };
}
