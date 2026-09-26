/**
 * PlayersApp – spelarregistret (styrelsen).
 *
 * En rad per person med fast ID. Ändringar här slår igenom live i Lineup och
 * Score Tracker, och statistiken följer spelaren vid namn- eller nummerbyte.
 * Bulkredigering: exportera till Excel/CSV, ändra, importera med förhandsgranskning.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Download, Upload, Plus, Search, Loader2, X, AlertTriangle, GitMerge } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Row = {
  id: string; name: string; number: string; position: string; teamColor: string | null; captainRole: string | null;
  isMember: boolean; active: boolean; lagetName: string | null; externalId: string | null; mergedInto: string | null;
  aliases: string[] | null; notes: string | null;
};
type Filter = "active" | "inactive" | "nonmember" | "all";

const POSITIONS = ["MV", "B", "C", "F", "IB"] as const;
const teamLabel = (t: string | null) => (t === "white" ? "Vit" : t === "green" ? "Grön" : "");

// ─── CSV ─────────────────────────────────────────────────────────────────────

const CSV_HEADERS = ["id", "namn", "nummer", "position", "lag", "roll", "medlem", "aktiv", "laget-namn", "externt-id"];

function toCsv(rows: Row[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [r.id, r.name, r.number, r.position, teamLabel(r.teamColor), r.captainRole ?? "", r.isMember ? "ja" : "nej",
      r.active ? "ja" : "nej", r.lagetName ?? "", r.externalId ?? ""].map(esc).join(";")
  );
  // BOM så att Excel öppnar filen som UTF-8 (å, ä, ö).
  return "\uFEFF" + [CSV_HEADERS.join(";"), ...lines].join("\r\n");
}

function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/)[0] ?? "";
  const delim = [";", "\t", ","].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) out.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) out.push(row);
  return out;
}

type ImportRow = {
  id?: string; name: string; number?: string; position?: (typeof POSITIONS)[number];
  teamColor?: "white" | "green" | null; captainRole?: "C" | "A" | null; isMember?: boolean; active?: boolean;
  lagetName?: string | null; externalId?: string | null;
};

/** Tolkar filen. Tomma celler = ändra inte. */
function rowsFromCsv(text: string): { rows: ImportRow[]; errors: string[] } {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (table.length < 2) return { rows: [], errors: ["Filen är tom eller saknar rubrikrad."] };
  const head = table[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const c = {
    id: col("id"), name: col("namn", "name"), number: col("nummer", "nr", "number"), position: col("position", "pos"),
    team: col("lag", "team", "lagfärg"), role: col("roll", "kapten", "role"), member: col("medlem", "member"),
    active: col("aktiv", "active"), laget: col("laget-namn", "lagetnamn", "laget"), ext: col("externt-id", "extern", "externalid"),
  };
  if (c.name < 0) return { rows: [], errors: ['Kolumnen "namn" saknas.'] };
  const yesNo = (v: string) => {
    const s = v.trim().toLowerCase();
    if (!s) return undefined;
    if (["ja", "j", "yes", "1", "true", "x"].includes(s)) return true;
    if (["nej", "n", "no", "0", "false"].includes(s)) return false;
    return undefined;
  };
  const rows: ImportRow[] = [];
  table.slice(1).forEach((r, i) => {
    const get = (idx: number) => (idx >= 0 ? (r[idx] ?? "").trim() : "");
    const name = get(c.name);
    if (!name) return;
    const row: ImportRow = { name };
    if (get(c.id)) row.id = get(c.id);
    if (c.number >= 0 && get(c.number) !== "") row.number = get(c.number);
    const pos = get(c.position).toUpperCase();
    if (pos) {
      if ((POSITIONS as readonly string[]).includes(pos)) row.position = pos as ImportRow["position"];
      else errors.push(`Rad ${i + 2}: okänd position "${pos}" (använd MV, B, C, F eller IB).`);
    }
    if (c.team >= 0) {
      const t = get(c.team).toLowerCase();
      if (t) row.teamColor = t.startsWith("v") || t === "white" ? "white" : t.startsWith("g") ? "green" : undefined;
      else row.teamColor = null;
    }
    if (c.role >= 0) {
      const ro = get(c.role).toUpperCase();
      row.captainRole = ro === "C" || ro === "A" ? ro : null;
    }
    const m = yesNo(get(c.member));
    if (m !== undefined) row.isMember = m;
    const a = yesNo(get(c.active));
    if (a !== undefined) row.active = a;
    if (c.laget >= 0) row.lagetName = get(c.laget) || null;
    if (c.ext >= 0) row.externalId = get(c.ext) || null;
    rows.push(row);
  });
  return { rows, errors };
}

const FIELD_LABELS: Record<string, string> = {
  name: "Namn", number: "Nummer", position: "Position", teamColor: "Lag", captainRole: "Roll",
  isMember: "Medlem", active: "Aktiv", lagetName: "Laget-namn", externalId: "Externt ID",
};
const show = (field: string, v: unknown) =>
  field === "teamColor" ? teamLabel(v as string | null) || "–" : typeof v === "boolean" ? (v ? "ja" : "nej") : v == null || v === "" ? "–" : String(v);

// ─── Sida ────────────────────────────────────────────────────────────────────

export default function PlayersApp() {
  const utils = trpc.useUtils();
  const list = trpc.players.list.useQuery();
  const issues = trpc.players.issues.useQuery();
  const [filter, setFilter] = useState<Filter>("active");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [importState, setImportState] = useState<{ rows: ImportRow[]; errors: string[]; markMissing: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    utils.players.invalidate();
  };
  const merge = trpc.players.merge.useMutation({ onSuccess: () => { toast.success("Spelarna är ihopslagna"); refresh(); } });

  const rows = (list.data ?? []) as Row[];
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter((r) => !r.mergedInto)
      .filter((r) => filter === "all" || (filter === "active" ? r.active : filter === "inactive" ? !r.active : !r.isMember))
      .filter((r) => !s || r.name.toLowerCase().includes(s) || r.number === s || (r.aliases ?? []).some((a) => a.toLowerCase().includes(s)))
      .sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }, [rows, filter, q]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(rows.filter((r) => !r.mergedInto))], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `spelare-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    setImportState({ ...rowsFromCsv(text), markMissing: false });
  };

  const counts = {
    active: rows.filter((r) => !r.mergedInto && r.active).length,
    inactive: rows.filter((r) => !r.mergedInto && !r.active).length,
    nonmember: rows.filter((r) => !r.mergedInto && !r.isMember).length,
    all: rows.filter((r) => !r.mergedInto).length,
  };

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-white/60 hover:text-white"><ArrowLeft size={20} /></Link>
        <h1 className="text-lg font-bold flex-1" style={{ fontFamily: "'Oswald', sans-serif" }}>Spelare</h1>
        <button onClick={exportCsv} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10"><Download size={14} /> Exportera</button>
        <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10"><Upload size={14} /> Importera</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <p className="text-white/40 text-xs">
          Varje spelare har ett fast ID. Ändringar här syns direkt i Lineup och Score Tracker, och statistiken följer med vid namn- eller nummerbyte.
          Spelare som inte finns i medlemsregistret flaggas som <b>ej medlem</b> men finns kvar.
        </p>

        {issues.data && (issues.data.duplicates.length > 0 || issues.data.membersWithoutNumber.length > 0) && (
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-300"><AlertTriangle size={14} /> Att se över</h2>
            {issues.data.duplicates.map((group) => (
              <div key={group.map((p) => p.id).join()} className="text-xs text-white/70 flex flex-wrap items-center gap-2">
                <span>Möjlig dubblett:</span>
                {group.map((p) => <span key={p.id} className="px-2 py-0.5 rounded bg-white/5">{p.name}{p.number ? ` #${p.number}` : ""}{p.active ? "" : " (inaktiv)"}</span>)}
                {group.length === 2 && (
                  <button
                    onClick={() => {
                      const [a, b] = group[0].active || !group[1].active ? [group[1], group[0]] : [group[0], group[1]];
                      if (confirm(`Slå ihop "${a.name}${a.number ? " #" + a.number : ""}" med "${b.name}${b.number ? " #" + b.number : ""}"? Historiken samlas på den senare.`)) merge.mutate({ fromId: a.id, intoId: b.id });
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-200"
                  ><GitMerge size={12} /> Slå ihop</button>
                )}
              </div>
            ))}
            {issues.data.membersWithoutNumber.length > 0 && (
              <p className="text-xs text-white/60">Medlemmar utan nummer: {issues.data.membersWithoutNumber.map((p) => p.name).join(", ")}</p>
            )}
          </section>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {(["active", "inactive", "nonmember", "all"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full border ${filter === f ? "bg-[#0a7ea4] border-[#0a7ea4] text-white" : "border-white/10 text-white/60"}`}>
              {{ active: "I truppen", inactive: "Inaktiva", nonmember: "Ej medlemmar", all: "Alla" }[f]} ({counts[f]})
            </button>
          ))}
          <div className="flex-1 min-w-[140px] flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-2">
            <Search size={14} className="text-white/40" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök namn eller nummer" className="bg-transparent py-1.5 text-sm flex-1 outline-none" />
          </div>
          <button onClick={() => setEditing("new")} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"><Plus size={14} /> Ny spelare</button>
        </div>

        {list.isLoading ? <Loader2 className="animate-spin text-white/40" /> : (
          <div className="divide-y divide-white/5 rounded-2xl border border-white/5 overflow-hidden">
            {visible.map((r) => (
              <button key={r.id} onClick={() => setEditing(r)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5">
                <span className="w-9 text-right font-mono text-white/50 text-sm">{r.number ? `#${r.number}` : ""}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm truncate">{r.name}{r.captainRole ? <span className="ml-1 text-amber-300 font-bold">{r.captainRole}</span> : null}</span>
                  {(r.aliases?.length ?? 0) > 0 && <span className="block text-[10px] text-white/30 truncate">tidigare: {r.aliases!.join(", ")}</span>}
                </span>
                <span className="text-[11px] w-8 text-white/60">{r.position}</span>
                <span className={`text-[11px] w-10 ${r.teamColor === "green" ? "text-emerald-400" : r.teamColor === "white" ? "text-white" : "text-white/20"}`}>{teamLabel(r.teamColor) || "–"}</span>
                {!r.isMember && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">ej medlem</span>}
                {!r.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">inaktiv</span>}
              </button>
            ))}
            {visible.length === 0 && <p className="p-4 text-sm text-white/40">Inga spelare.</p>}
          </div>
        )}
      </main>

      {editing && <EditModal row={editing === "new" ? null : editing} all={rows} byId={byId} onClose={() => setEditing(null)} onSaved={refresh} />}
      {importState && <ImportModal state={importState} setState={setImportState} onDone={() => { setImportState(null); refresh(); }} />}
    </div>
  );
}

// ─── Redigera ────────────────────────────────────────────────────────────────

function EditModal({ row, all, onClose, onSaved }: { row: Row | null; all: Row[]; byId: Map<string, Row>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: row?.name ?? "", number: row?.number ?? "", position: row?.position ?? "F", teamColor: row?.teamColor ?? null,
    captainRole: row?.captainRole ?? null, isMember: row?.isMember ?? true, active: row?.active ?? true,
    lagetName: row?.lagetName ?? "", notes: row?.notes ?? "",
  });
  const [mergeInto, setMergeInto] = useState("");
  const update = trpc.players.update.useMutation({ onSuccess: () => { toast.success("Sparat"); onSaved(); onClose(); } });
  const create = trpc.players.create.useMutation({ onSuccess: () => { toast.success("Spelaren är tillagd"); onSaved(); onClose(); } });
  const merge = trpc.players.merge.useMutation({ onSuccess: () => { toast.success("Ihopslagna"); onSaved(); onClose(); } });

  const payload = {
    name: f.name.trim(), number: f.number.trim(), position: f.position as (typeof POSITIONS)[number],
    teamColor: f.teamColor as "white" | "green" | null, captainRole: f.captainRole as "C" | "A" | null,
    isMember: f.isMember, active: f.active, lagetName: f.lagetName.trim() || null, notes: f.notes.trim() || null,
  };
  const save = () => (row ? update.mutate({ id: row.id, fields: payload }) : create.mutate(payload));
  const input = "w-full bg-[#111] border border-white/10 rounded-lg px-2.5 py-2 text-sm text-white";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-[#161616] rounded-t-2xl sm:rounded-2xl border border-white/10 p-4 space-y-3 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">{row ? "Redigera spelare" : "Ny spelare"}</h2>
          <button onClick={onClose} className="text-white/50"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <label className="col-span-3 text-xs text-white/50">Namn<input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="text-xs text-white/50">Nr<input className={input} inputMode="numeric" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></label>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs text-white/50">
          <label>Position<select className={input} value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })}>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</select></label>
          <label>Lag<select className={input} value={f.teamColor ?? ""} onChange={(e) => setF({ ...f, teamColor: e.target.value || null })}><option value="">–</option><option value="white">Vit</option><option value="green">Grön</option></select></label>
          <label>Roll<select className={input} value={f.captainRole ?? ""} onChange={(e) => setF({ ...f, captainRole: e.target.value || null })}><option value="">–</option><option value="C">C</option><option value="A">A</option></select></label>
        </div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.isMember} onChange={(e) => setF({ ...f, isMember: e.target.checked })} /> Medlem</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Aktiv (i truppen)</label>
        </div>
        <label className="block text-xs text-white/50">Namn i laget.se (om det skiljer sig)<input className={input} value={f.lagetName} onChange={(e) => setF({ ...f, lagetName: e.target.value })} /></label>
        <label className="block text-xs text-white/50">Anteckning<textarea className={input} rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        {row?.aliases && row.aliases.length > 0 && <p className="text-[11px] text-white/40">Tidigare namn/nummer: {row.aliases.join(", ")}</p>}
        <button onClick={save} disabled={!payload.name || update.isPending || create.isPending}
          className="w-full py-2.5 rounded-xl bg-[#0a7ea4] font-semibold disabled:opacity-40">Spara</button>

        {row && (
          <div className="border-t border-white/5 pt-3 space-y-2">
            <p className="text-xs text-white/50">Samma person registrerad två gånger? Slå ihop – historiken samlas på den valda spelaren och den här tas bort ur truppen.</p>
            <div className="flex gap-2">
              <select className={input} value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
                <option value="">Välj spelare …</option>
                {all.filter((p) => p.id !== row.id && !p.mergedInto).sort((a, b) => a.name.localeCompare(b.name, "sv")).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.number ? ` #${p.number}` : ""}{p.active ? "" : " (inaktiv)"}</option>
                ))}
              </select>
              <button disabled={!mergeInto || merge.isPending}
                onClick={() => { if (confirm("Slå ihop? Det går inte att ångra i appen.")) merge.mutate({ fromId: row.id, intoId: mergeInto }); }}
                className="px-3 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs disabled:opacity-40">Slå ihop</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Import ──────────────────────────────────────────────────────────────────

function ImportModal({ state, setState, onDone }: {
  state: { rows: ImportRow[]; errors: string[]; markMissing: boolean };
  setState: (s: { rows: ImportRow[]; errors: string[]; markMissing: boolean } | null) => void;
  onDone: () => void;
}) {
  const preview = trpc.players.importPreview.useMutation();
  const apply = trpc.players.importApply.useMutation({
    onSuccess: (r) => { toast.success(`Import klar: ${r.created} nya, ${r.updated} uppdaterade`); onDone(); },
    onError: (e) => toast.error(e.message),
  });
  const run = (markMissing: boolean) => preview.mutate({ rows: state.rows, markMissingAsNonMember: markMissing });
  useEffect(() => {
    if (state.errors.length === 0 && state.rows.length) run(state.markMissing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plan = preview.data?.plan ?? [];
  const groups = { new: plan.filter((c) => c.kind === "new"), update: plan.filter((c) => c.kind === "update"), missing: plan.filter((c) => c.kind === "missing") };
  const blocking = state.errors.length > 0 || (preview.data?.problems.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-[#161616] rounded-t-2xl sm:rounded-2xl border border-white/10 p-4 space-y-3 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Förhandsgranska import</h2>
          <button onClick={() => setState(null)} className="text-white/50"><X size={18} /></button>
        </div>
        <p className="text-xs text-white/50">{state.rows.length} rader i filen. Ingenting ändras förrän du trycker Genomför. Tomma celler lämnar värdet oförändrat.</p>

        {[...state.errors, ...(preview.data?.problems ?? [])].map((e) => <p key={e} className="text-xs text-red-400">{e}</p>)}

        <label className="flex items-start gap-2 text-xs text-white/70">
          <input type="checkbox" checked={state.markMissing} onChange={(e) => { setState({ ...state, markMissing: e.target.checked }); run(e.target.checked); }} />
          <span>Filen är hela medlemsregistret – markera medlemmar som saknas i filen som <b>ej medlem</b> (de finns kvar i appen).</span>
        </label>

        {preview.isPending && <Loader2 className="animate-spin text-white/40" />}
        {preview.data && (
          <div className="space-y-3 text-xs">
            <p className="text-white/40">{preview.data.unchanged} oförändrade.</p>
            {groups.new.length > 0 && <Section title={`Nya spelare (${groups.new.length})`}>{groups.new.map((c) => <li key={c.name}>{c.name}</li>)}</Section>}
            {groups.update.length > 0 && (
              <Section title={`Ändringar (${groups.update.length})`}>
                {groups.update.map((c) => (
                  <li key={c.id}><b>{c.name}</b>: {c.changes.map((ch) => `${FIELD_LABELS[ch.field] ?? ch.field} ${show(ch.field, ch.from)} → ${show(ch.field, ch.to)}`).join(", ")}</li>
                ))}
              </Section>
            )}
            {groups.missing.length > 0 && <Section title={`Blir "ej medlem" (${groups.missing.length})`}>{groups.missing.map((c) => <li key={c.id}>{c.name}</li>)}</Section>}
            {plan.length === 0 && <p className="text-white/60">Inga ändringar.</p>}
          </div>
        )}

        <button
          disabled={blocking || plan.length === 0 || apply.isPending}
          onClick={() => apply.mutate({ rows: state.rows, markMissingAsNonMember: state.markMissing })}
          className="w-full py-2.5 rounded-xl bg-[#0a7ea4] font-semibold disabled:opacity-40"
        >
          {apply.isPending ? "Genomför …" : "Genomför"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-white/70 font-semibold mb-1">{title}</p>
      <ul className="space-y-0.5 text-white/60 list-disc pl-4">{children}</ul>
    </div>
  );
}
