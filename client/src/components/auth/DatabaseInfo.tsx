import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Database, Loader2 } from "lucide-react";

/** Styrelsen: vilken databas appen använder och vad den innehåller. */
export function DatabaseInfo() {
  const [open, setOpen] = useState(false);
  const info = trpc.system.database.useQuery(undefined, { enabled: open, staleTime: 0 });

  return (
    <div className="border-t border-white/5 pt-3">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 text-xs text-white/50 hover:text-white">
        <Database size={12} /> {open ? "Dölj databasinfo" : "Visa databasinfo"}
      </button>
      {open && (
        <div className="mt-2 text-[11px] text-white/70 space-y-2">
          {info.isLoading && <Loader2 size={14} className="animate-spin text-white/40" />}
          {info.data && (
            <>
              <p>
                Databas <span className="font-mono text-white">{info.data.database}</span> på{" "}
                <span className="font-mono">{info.data.host}</span> (MySQL {info.data.mysqlVersion})
              </p>
              <p>
                Uppställning: {info.data.lineup.total} spelare ({info.data.lineup.placed} placerade,{" "}
                {info.data.lineup.inRoster} i truppen, {info.data.lineup.registered} anmälda) · version {info.data.lineup.version}
              </p>
              <p>
                Matcher: {info.data.matches.total} ({info.data.matches.approved} godkända, {info.data.matches.pending} väntar,{" "}
                {info.data.matches.rejected} avvisade)
              </p>
              <table className="w-full">
                <tbody>
                  {info.data.tables.map(t => (
                    <tr key={t.name} className={`border-t border-white/5 ${t.usedByApp ? "" : "text-amber-300/80"}`}>
                      <td className="py-1 font-mono pr-2">{t.name}</td>
                      <td className="text-right pr-2">{t.rows}</td>
                      <td className="text-white/40">{t.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
