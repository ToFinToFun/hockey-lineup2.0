/**
 * Meddelanden från styrelsen till medlemmarna (inkorg i appen + mejl), och chatten
 * per aktivitet sedd från styrelsen.
 */
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Bell, Loader2, Mail, MessageCircle, Send, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { shortDate, stockholmParts } from "@shared/activities";
import { ChatBox } from "./ChatBox";

const HEAD_FONT = { fontFamily: "'Oswald', sans-serif" };
const btn = "inline-flex items-center justify-center gap-1.5 text-sm px-3.5 py-2 rounded-lg border transition-colors disabled:opacity-50";
const btnGhost = `${btn} bg-white/5 border-white/10 text-white/80 hover:bg-white/10`;
const btnPrimary = `${btn} bg-emerald-600 border-emerald-600 text-white font-semibold hover:bg-emerald-500`;
const inputCls = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#0a7ea4]";
const labelCls = "block text-xs text-white/60 mb-1";
const fmt = (d: Date | string) => {
  const p = stockholmParts(new Date(d));
  return `${shortDate(p.date)} kl ${p.time}`;
};

type Kind = "all" | "board" | "yes" | "unanswered" | "selected";

export function MessageComposer({ onClose, activityId }: { onClose: () => void; activityId?: number }) {
  const utils = trpc.useUtils();
  const acts = trpc.activities.list.useQuery({});
  const roster = trpc.players.list.useQuery(undefined, { staleTime: 60_000 });
  const [kind, setKind] = useState<Kind>(activityId ? "yes" : "all");
  const [act, setAct] = useState<number | null>(activityId ?? null);
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const send = trpc.activities.sendMessage.useMutation({
    onSuccess: (r) => {
      utils.activities.messages.invalidate();
      const n = r.notify;
      toast.success(
        `Skickat till ${r.label} · ${n.pushed} notis, ${n.sent} mejl${n.missingEmail.length ? `, ${n.missingEmail.length} saknar e-post` : ""}${n.failed.length ? `, ${n.failed.length} misslyckades` : ""}`,
      );
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const members = (roster.data ?? []).filter((p) => p.isMember && p.externalId);
  const needle = search.trim().toLowerCase();
  const hits = needle ? members.filter((p) => !picked.includes(p.id) && p.name.toLowerCase().includes(needle)).slice(0, 8) : [];
  const actId = act ?? acts.data?.[0]?.id ?? null;

  const submit = () => {
    const audience =
      kind === "all" || kind === "board"
        ? { kind }
        : kind === "selected"
          ? { kind, playerIds: picked }
          : { kind: "activity" as const, activityId: actId ?? 0, who: kind };
    send.mutate({ title, body, audience: audience as never });
  };
  const opts: [Kind, string][] = [
    ["all", "Alla medlemmar"],
    ["board", "Styrelsen"],
    ["yes", "Anmälda till…"],
    ["unanswered", "Ej svarat på…"],
    ["selected", "Valda"],
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Nytt meddelande">
      <div className="bg-[#141414] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[94dvh] overflow-y-auto text-white">
        <div className="sticky top-0 bg-[#141414] border-b border-white/10 px-4 py-3 flex items-center gap-3">
          <h2 className="font-bold flex-1 text-lg" style={HEAD_FONT}>
            Nytt meddelande
          </h2>
          <button onClick={onClose} aria-label="Stäng" className="text-white/50 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <span className={labelCls}>Till</span>
            <div className="flex flex-wrap gap-2">
              {opts.map(([k, l]) => (
                <button key={k} onClick={() => setKind(k)} className={`text-xs px-3 py-1.5 rounded-full border ${kind === k ? "bg-emerald-600 border-emerald-600 text-white" : "border-white/15 text-white/60"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {(kind === "yes" || kind === "unanswered") && (
            <select className={inputCls} value={actId ?? ""} onChange={(e) => setAct(Number(e.target.value))}>
              {acts.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} – {fmt(a.startsAt)}
                </option>
              ))}
            </select>
          )}
          {kind === "selected" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {picked.map((id) => (
                  <button key={id} onClick={() => setPicked((x) => x.filter((y) => y !== id))} className="text-xs px-2 py-1 rounded-full bg-white/10 inline-flex items-center gap-1">
                    {members.find((p) => p.id === id)?.name} <X size={11} />
                  </button>
                ))}
              </div>
              <input className={inputCls} placeholder="Sök medlem" value={search} onChange={(e) => setSearch(e.target.value)} />
              {hits.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPicked((x) => [...x, p.id]);
                    setSearch("");
                  }}
                  className="block w-full text-left text-sm px-3 py-1.5 rounded-lg hover:bg-white/5"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <div>
            <label className={labelCls}>Rubrik</label>
            <input className={inputCls} maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="OBS – ta med…" />
          </div>
          <div>
            <label className={labelCls}>Meddelande</label>
            <textarea className={`${inputCls} min-h-32`} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <p className="text-xs text-white/40">Hamnar under Meddelanden i appen. Notis till den som har det påslaget, annars mejl.</p>
        </div>
        <div className="sticky bottom-0 bg-[#141414] border-t border-white/10 px-4 py-3 flex gap-2 justify-end">
          <button onClick={onClose} className={btnGhost}>
            Avbryt
          </button>
          <button onClick={submit} disabled={send.isPending || !title.trim() || !body.trim() || (kind === "selected" && !picked.length)} className={btnPrimary}>
            {send.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Skicka
          </button>
        </div>
      </div>
    </div>
  );
}

export function MessagesPage() {
  const utils = trpc.useUtils();
  const list = trpc.activities.messages.useQuery();
  const del = trpc.activities.deleteMessage.useMutation({ onSuccess: () => utils.activities.messages.invalidate() });
  const [composing, setComposing] = useState(false);
  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white">
      <header className="sticky top-0 z-20 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center gap-3">
        <Link href="/aktiviteter" className="text-white/60 hover:text-white" aria-label="Tillbaka">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-lg font-bold flex-1" style={HEAD_FONT}>
          Meddelanden
        </h1>
        <button onClick={() => setComposing(true)} className={btnPrimary}>
          <Send size={14} /> Nytt
        </button>
      </header>
      <main className="max-w-3xl mx-auto p-4 space-y-2">
        {list.data?.length === 0 && <p className="text-white/40 text-sm py-8 text-center">Inga meddelanden skickade.</p>}
        {list.data?.map((m) => (
          <div key={m.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold flex-1 truncate">{m.title}</span>
              <button onClick={() => confirm("Ta bort meddelandet för alla?") && del.mutate({ id: m.id })} aria-label="Ta bort" className="text-white/40 hover:text-red-300">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="text-xs text-white/50 flex items-center gap-2 flex-wrap">
              <span>{fmt(m.createdAt)}</span>
              <span>· {m.audienceLabel}</span>
              {(m.pushed > 0 || m.emailed > 0) && (
                <span className="inline-flex items-center gap-1">
                  · <Bell size={11} /> {m.pushed} <Mail size={11} /> {m.emailed}
                </span>
              )}
            </div>
            <p className="text-sm text-white/70 whitespace-pre-line line-clamp-4">{m.body}</p>
          </div>
        ))}
      </main>
      {composing && <MessageComposer onClose={() => setComposing(false)} />}
    </div>
  );
}

export function AdminChat({ activityId }: { activityId: number }) {
  const utils = trpc.useUtils();
  const chat = trpc.activities.chat.useQuery({ activityId }, { refetchInterval: 15_000 });
  const post = trpc.activities.chatPost.useMutation({ onSuccess: () => utils.activities.chat.invalidate({ activityId }), onError: (e) => toast.error(e.message) });
  const del = trpc.activities.chatDelete.useMutation({ onSuccess: () => utils.activities.chat.invalidate({ activityId }) });
  if (!chat.data) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold inline-flex items-center gap-1.5">
        <MessageCircle size={15} /> Chatt för de anmälda <span className="text-white/40 font-normal">(du skriver som Styrelsen)</span>
      </h2>
      <ChatBox
        {...chat.data}
        me={null}
        canDeleteAll
        onSend={(text) => post.mutateAsync({ activityId, text })}
        onDelete={(id) => del.mutate({ id })}
        sending={post.isPending}
      />
    </section>
  );
}
