import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link2, Loader2 } from "lucide-react";

const DOMAIN_LABELS: Record<string, string> = {
  sponsors: "Sponsorer",
  terms: "Lag och positioner",
  players: "Spelare",
  stats: "Närvaro och statistik",
};
const MODE_TEXT: Record<string, string> = { off: "Av", shadow: "Skuggläge", live: "På" };

/** Styrelsen: kopplingen till sajten. Bara visning och test – allt är avstängt tills vidare. */
export function SyncStatus() {
  const [open, setOpen] = useState(false);
  const status = trpc.system.integration.useQuery(undefined, { enabled: open, staleTime: 0 });
  const ping = trpc.system.integrationPing.useMutation();
  const s = status.data;

  return (
    <div className="border-t border-white/5 pt-3">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 text-xs text-white/50 hover:text-white">
        <Link2 size={12} /> {open ? "Dölj synkstatus" : "Visa synkstatus (sajten)"}
      </button>
      {open && (
        <div className="mt-2 text-[11px] text-white/70 space-y-2">
          {status.isLoading && <Loader2 size={14} className="animate-spin text-white/40" />}
          {s && (
            <>
              <p>
                Nyckel:{" "}
                {s.keyConfigured ? "inställd" : s.keyTooShort ? <span className="text-amber-300">för kort (minst 32 tecken)</span> : "saknas"} · intern
                port {s.port}
                {!s.keyConfigured && " (startas inte)"} · sajten: <span className="font-mono">{s.siteUrl || "adress saknas"}</span>
              </p>
              <p>
                {Object.entries(s.modes)
                  .map(([d, m]) => `${DOMAIN_LABELS[d] ?? d}: ${MODE_TEXT[m] ?? m}`)
                  .join(" · ")}
              </p>
              <button
                onClick={() => ping.mutate()}
                disabled={ping.isPending || !s.keyConfigured || !s.siteUrl}
                className="rounded border border-white/10 px-2 py-1 text-white/70 hover:text-white disabled:opacity-40"
              >
                {ping.isPending ? "Testar…" : "Testa anslutning"}
              </button>
              {ping.data && (
                <p className={ping.data.ok ? "text-emerald-300" : "text-amber-300"}>
                  {ping.data.ok
                    ? `Anslutningen fungerar (${ping.data.ms} ms). Sajten ${ping.data.remote?.version ?? ""}, API v${ping.data.remote?.apiVersion ?? "?"}.`
                    : ping.data.error}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
