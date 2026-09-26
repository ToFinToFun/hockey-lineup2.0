import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { LoginForm } from "./LoginForm";
import { DatabaseInfo } from "./DatabaseInfo";
import { toast } from "sonner";
import { Link2, LogOut, ShieldOff, Copy, KeyRound, Loader2 } from "lucide-react";

function formatTime(ms: number) {
  return new Date(ms).toLocaleString("sv-SE", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

/** Inloggning, utloggning och tillfälliga länkar – visas längst ner på startsidan. */
export function AccessPanel() {
  const auth = useAuth();
  const utils = trpc.useUtils();
  const [showLogin, setShowLogin] = useState(false);
  const [invite, setInvite] = useState<{ url: string; expiresAt: number } | null>(null);

  const logout = trpc.auth.logout.useMutation({ onSuccess: () => utils.invalidate() });
  const createInvite = trpc.auth.createInvite.useMutation({
    onSuccess: (data) => setInvite({ url: `${window.location.origin}/lank/${data.token}`, expiresAt: data.expiresAt }),
  });
  const revoke = trpc.auth.revokeInvites.useMutation({
    onSuccess: () => {
      setInvite(null);
      toast.success("Alla tillfälliga länkar är nu ogiltiga");
    },
  });

  const share = async (url: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Stålstadens – bygg laguppställning", url });
        return;
      } catch {
        /* avbruten – fall tillbaka till kopiering */
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Länken är kopierad");
  };

  if (auth.loading) return null;

  if (!auth.role) {
    return (
      <div className="w-full max-w-md mt-6">
        {showLogin ? (
          <LoginForm onSuccess={() => setShowLogin(false)} />
        ) : (
          <button
            onClick={() => setShowLogin(true)}
            className="mx-auto flex items-center gap-2 text-white/30 hover:text-white/70 text-xs"
          >
            <KeyRound size={12} /> Styrelsen – logga in
          </button>
        )}
      </div>
    );
  }

  if (auth.role === "lineup") {
    return (
      <div className="w-full max-w-md mt-6 flex items-center justify-between text-xs text-white/40">
        <span>Tillfällig åtkomst till {auth.expiresAt ? formatTime(auth.expiresAt) : "–"}</span>
        <button onClick={() => logout.mutate()} className="flex items-center gap-1 hover:text-white">
          <LogOut size={12} /> Avsluta
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mt-6 rounded-2xl bg-[#141414] border border-[#2a2a2a] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Styrelsen</span>
        <button onClick={() => logout.mutate()} className="flex items-center gap-1 text-xs text-white/40 hover:text-white">
          <LogOut size={12} /> Logga ut
        </button>
      </div>

      <p className="text-white/40 text-xs">
        Skapa en länk som ger vem som helst rätt att bygga laguppställningen i 24 timmar.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => createInvite.mutate()}
          disabled={createInvite.isPending}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-semibold disabled:opacity-40"
        >
          {createInvite.isPending ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
          Skapa länk
        </button>
        <button
          onClick={() => { if (confirm("Göra alla utskickade länkar ogiltiga direkt?")) revoke.mutate(); }}
          disabled={revoke.isPending}
          className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-sm disabled:opacity-40"
        >
          <ShieldOff size={14} /> Återkalla alla
        </button>
      </div>

      {invite && (
        <div className="rounded-lg bg-black/40 border border-white/10 p-3 space-y-2">
          <p className="text-[11px] text-white/40">Giltig till {formatTime(invite.expiresAt)}</p>
          <p className="text-[11px] text-white/70 break-all font-mono">{invite.url}</p>
          <button
            onClick={() => share(invite.url)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#0a7ea4] text-white text-sm font-semibold"
          >
            <Copy size={14} /> Dela / kopiera
          </button>
        </div>
      )}

      <DatabaseInfo />
    </div>
  );
}
