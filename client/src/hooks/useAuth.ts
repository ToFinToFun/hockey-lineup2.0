import { trpc } from "@/lib/trpc";
import type { AccessModule } from "@shared/accessModules";

/**
 * Vad den inloggade får göra. Rollen kommer från styrelsens lösenord, en delad länk
 * eller den inloggade medlemmens behörighet (Admin eller valda delar).
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
    canEditLineup: isAdmin || role === "lineup" || modules.includes("lineup"),
    /** Admin, eller någon av modulerna (länk eller medlem) */
    hasModule: (...m: AccessModule[]) => isAdmin || m.some((x) => modules.includes(x)),
    modules,
    /** "password" | "invite" | "link" | "member" */
    via: me.data?.via ?? null,
    linkName: me.data?.linkName ?? null,
    /** Delad länk: sista giltighet (null = tills vidare) */
    linkExpiresAt: me.data?.linkExpiresAt ?? null,
    expiresAt: me.data?.expiresAt ?? null,
    refetch: me.refetch,
  };
}
