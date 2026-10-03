import { trpc } from "@/lib/trpc";
import type { AccessModule } from "@shared/accessModules";

/**
 * Aktuell roll: "admin" (styrelsen), "lineup" (tillfällig Lineup-länk),
 * "access" (delad länk med moduler) eller null.
 */
export function useAuth() {
  const me = trpc.auth.me.useQuery(undefined, { staleTime: 60_000, retry: false });
  const role = me.data?.role ?? null;
  const modules = (me.data?.modules ?? []) as AccessModule[];
  const isAdmin = role === "admin";
  return {
    loading: me.isLoading,
    role,
    isAdmin,
    canEditLineup: role === "admin" || role === "lineup",
    /** Styrelsen, eller delad länk med någon av modulerna */
    hasModule: (...m: AccessModule[]) => isAdmin || (role === "access" && m.some((x) => modules.includes(x))),
    modules,
    linkName: me.data?.linkName ?? null,
    /** Delad länk: sista giltighet (null = tills vidare) */
    linkExpiresAt: me.data?.linkExpiresAt ?? null,
    expiresAt: me.data?.expiresAt ?? null,
    refetch: me.refetch,
  };
}
