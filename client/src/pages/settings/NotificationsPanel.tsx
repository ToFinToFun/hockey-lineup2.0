/**
 * Notiser via e-post: vem som får vilka notiser. Utgående konto ställs in med
 * miljövariabler på servern (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
 * SMTP_FROM, SMTP_SECURE).
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Send, CheckCircle2, AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Recipient = { email: string; types: string[] };

export function NotificationsPanel() {
  const utils = trpc.useUtils();
  const q = trpc.notifications.get.useQuery();
  const save = trpc.notifications.set.useMutation({
    onSuccess: () => { toast.success("Notiserna sparade"); void utils.notifications.get.invalidate(); },
    onError: (e) => toast.error("Kunde inte spara", { description: e.message }),
  });
  const test = trpc.notifications.test.useMutation();
  const [list, setList] = useState<Recipient[] | null>(null);
  const [newEmail, setNewEmail] = useState("");
  useEffect(() => { if (q.data && !list) setList(q.data.recipients); }, [q.data, list]);

  if (q.isLoading || !list || !q.data) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-white/40" /></div>;
  const types = q.data.types;
  const dirty = JSON.stringify(list) !== JSON.stringify(q.data.recipients);

  const toggle = (i: number, t: string) =>
    setList(list.map((r, k) => (k !== i ? r : { ...r, types: r.types.includes(t) ? r.types.filter((x) => x !== t) : [...r.types, t] })));
  const add = () => {
    const email = newEmail.trim();
    if (!email) return;
    if (list.some((r) => r.email.toLowerCase() === email.toLowerCase())) return toast.error("Adressen finns redan");
    setList([...list, { email, types: types.map((t) => t.id) }]);
    setNewEmail("");
  };

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-3 text-xs flex items-start gap-2 ${q.data.smtpConfigured ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-amber-400/30 bg-amber-500/10 text-amber-200"}`}>
        {q.data.smtpConfigured ? <CheckCircle2 size={14} className="shrink-0 mt-px" /> : <AlertTriangle size={14} className="shrink-0 mt-px" />}
        <p>
          {q.data.smtpConfigured
            ? <>Utgående e-post är inställd (avsändare {q.data.from}).</>
            : <>Utgående e-post är inte inställd. Lägg till SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS och SMTP_FROM (och SMTP_SECURE=true för port 465) i Coolify. Mottagarna nedan sparas ändå.</>}
        </p>
      </div>

      {list.length === 0 && <p className="text-xs text-white/40">Inga mottagare än.</p>}
      {list.map((r, i) => (
        <div key={r.email} className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <p className="flex-1 min-w-0 truncate text-sm font-semibold">{r.email}</p>
            <button onClick={async () => {
              const res = await test.mutateAsync({ email: r.email });
              if (res.ok) toast.success(`Testmejl skickat till ${r.email}`); else toast.error("Kunde inte skicka", { description: res.error });
            }} disabled={test.isPending || !q.data.smtpConfigured} title="Skicka testmejl"
              className="p-1.5 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-300 disabled:opacity-40"><Send size={13} /></button>
            <button onClick={() => setList(list.filter((_, k) => k !== i))} title="Ta bort" className="p-1.5 rounded-lg bg-red-500/10 border border-red-400/25 text-red-300"><Trash2 size={13} /></button>
          </div>
          <div className="grid gap-1">
            {types.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-xs text-white/70">
                <input type="checkbox" checked={r.types.includes(t.id)} onChange={() => toggle(i, t.id)} /> {t.label}
              </label>
            ))}
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="namn@exempel.se" type="email" className="flex-1 min-w-0 rounded-lg bg-white/5 border border-white/10 text-white text-sm px-3 py-2" />
        <button onClick={add} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white/10 border border-white/15 text-sm"><Plus size={14} /> Lägg till</button>
      </div>
      <button onClick={() => save.mutate(list as never)} disabled={!dirty || save.isPending}
        className="w-full py-2.5 rounded-xl bg-[#0a7ea4] text-white text-sm font-semibold disabled:opacity-40">
        {save.isPending ? "Sparar…" : dirty ? "Spara notiser" : "Sparat"}
      </button>
    </div>
  );
}
