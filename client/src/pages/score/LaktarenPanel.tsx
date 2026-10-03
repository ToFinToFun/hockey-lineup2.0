/** Score Tracker → Läktaren: kommentarerna från /live med Dölj/Visa (inloggade). */
import { trpc } from "@/lib/trpc";

export interface LaktarenComment { id: string; name: string; text: string; at: string; hidden: boolean }

export default function LaktarenPanel({ comments, hearts, watching, uniqueViewers }: { comments: LaktarenComment[]; hearts: { white: number; green: number }; watching: number; uniqueViewers: number }) {
  const utils = trpc.useUtils();
  const hide = trpc.live.hide.useMutation({ onSuccess: () => void utils.live.status.invalidate() });
  return (
    <div className="h-full overflow-y-auto bg-[#1a1a1a] p-3 space-y-3">
      <div className="flex items-center justify-between text-[11px] text-[#9BA1A6]">
        <span className="font-bold tracking-wider text-[#ECEDEE]">LÄKTAREN</span>
        <span>{watching} tittar nu · {uniqueViewers} unika · ♥ {hearts.white} / {hearts.green}</span>
      </div>
      {comments.length === 0 && <p className="text-center text-xs text-[#9BA1A6] py-8">Inga kommentarer än.</p>}
      {comments.map((c) => (
        <div key={c.id} className={`rounded-xl border px-3 py-2 flex items-start gap-2 ${c.hidden ? "border-[#333] opacity-50" : "border-[#3a3a3a] bg-[#242424]"}`}>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-bold text-[#ECEDEE]">{c.name}</span>
              <span className="text-[10px] text-[#687076]">{new Date(c.at).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}</span>
              {c.hidden && <span className="text-[10px] text-amber-300/80">dold</span>}
            </div>
            <p className="text-sm text-[#d6dbde] break-words">{c.text}</p>
          </div>
          <button onClick={() => hide.mutate({ id: c.id, hidden: !c.hidden })} disabled={hide.isPending}
            className="shrink-0 h-8 px-2.5 rounded-lg border border-[#444] text-[11px] text-[#9BA1A6]">{c.hidden ? "Visa" : "Dölj"}</button>
        </div>
      ))}
    </div>
  );
}
