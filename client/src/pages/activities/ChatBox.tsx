/**
 * Chatten per aktivitet – samma ruta för medlemmen och styrelsen.
 * Inlägg från styrelsen (playerId null) visas som "Styrelsen".
 */
import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, Loader2, Send, Trash2 } from "lucide-react";
import { shortDate, stockholmParts } from "@shared/activities";
import { PosBadge } from "./ActivitiesApp";

export interface ChatMsg {
  id: number;
  playerId: string | null;
  name: string;
  position: string;
  text: string;
  createdAt: Date | string;
}

const stamp = (d: Date | string) => {
  const p = stockholmParts(new Date(d));
  const today = stockholmParts(new Date()).date;
  return p.date === today ? p.time : `${shortDate(p.date)} ${p.time}`;
};

export function ChatBox(props: {
  open: boolean;
  opensAt: Date | string;
  closesAt: Date | string;
  messages: ChatMsg[];
  /** Den egna spelaren (medlem) eller null = styrelsen */
  me: string | null;
  canDeleteAll?: boolean;
  muted?: boolean;
  onMute?: (muted: boolean) => void;
  onSend: (text: string) => Promise<unknown>;
  onDelete: (id: number) => void;
  sending: boolean;
}) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const last = props.messages[props.messages.length - 1]?.id;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [last]);

  const closes = stockholmParts(new Date(props.closesAt));
  const opens = stockholmParts(new Date(props.opensAt));
  if (!props.open && new Date(props.opensAt) > new Date())
    return <p className="text-sm text-white/40">Chatten öppnar {shortDate(opens.date)} kl {opens.time}.</p>;
  if (!props.open) return <p className="text-sm text-white/40">Chatten är stängd.</p>;

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    await props.onSend(t);
    setText("");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-white/40">
        <span>
          Raderas {shortDate(closes.date)} kl {closes.time}
        </span>
        {props.onMute && (
          <button onClick={() => props.onMute!(!props.muted)} className="inline-flex items-center gap-1 text-white/60 px-2 py-1 rounded-lg border border-white/10">
            {props.muted ? <BellOff size={13} /> : <Bell size={13} />} {props.muted ? "Tystad" : "Tysta"}
          </button>
        )}
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] max-h-80 overflow-y-auto p-2 space-y-1.5">
        {props.messages.length === 0 && <p className="text-sm text-white/40 p-2">Inga meddelanden än.</p>}
        {props.messages.map((m) => {
          const mine = m.playerId === props.me;
          const board = m.playerId === null;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-1.5 ${mine ? "bg-emerald-700/60" : board ? "bg-[#0a7ea4]/30 border border-[#0a7ea4]/40" : "bg-white/[0.06]"}`}>
                {!mine && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
                    {!board && m.position && <PosBadge position={m.position} />}
                    {m.name}
                  </div>
                )}
                <div className="text-sm whitespace-pre-line break-words">{m.text}</div>
                <div className="flex items-center justify-end gap-2 text-[10px] text-white/40">
                  {stamp(m.createdAt)}
                  {(mine || props.canDeleteAll) && (
                    <button onClick={() => confirm("Ta bort meddelandet?") && props.onDelete(m.id)} aria-label="Ta bort" className="hover:text-red-300">
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          rows={1}
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Skriv…"
          className="flex-1 resize-none bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-base text-white placeholder:text-white/30 focus:outline-none focus:border-[#0a7ea4]"
        />
        <button type="submit" disabled={props.sending || !text.trim()} aria-label="Skicka" className="rounded-xl bg-emerald-600 px-4 text-white disabled:opacity-40">
          {props.sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </form>
    </div>
  );
}
