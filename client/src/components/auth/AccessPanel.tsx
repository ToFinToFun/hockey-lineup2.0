import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { LoginForm, PasswordForm } from "./LoginForm";
import { LogOut, KeyRound } from "lucide-react";
import { ACCESS_MODULES } from "@shared/accessModules";

function formatTime(ms: number) {
  return new Date(ms).toLocaleString("sv-SE", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

/** Inloggning, utloggning och tillfälliga länkar – visas längst ner på startsidan. */
export function AccessPanel() {
  const auth = useAuth();
  const utils = trpc.useUtils();
  const [showLogin, setShowLogin] = useState(false);
  const member = trpc.member.me.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const opts = trpc.auth.loginOptions.useQuery(undefined, { staleTime: 5 * 60_000 });

  const logout = trpc.auth.logout.useMutation({ onSuccess: () => utils.invalidate() });
  const memberLogout = trpc.member.logout.useMutation({ onSuccess: () => utils.invalidate() });
  if (auth.loading) return null;

  // Inloggad som medlem med behörighet: namnet och vad man får göra
  if (auth.via === "member" && member.data) {
    const what = auth.isAdmin ? "Admin" : ACCESS_MODULES.filter((m) => auth.modules.includes(m.id)).map((m) => m.name).join(", ");
    return (
      <div className="w-full max-w-md mt-6 rounded-2xl bg-[#141414] border border-[#2a2a2a] p-4 flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white/80 truncate">{member.data.name ?? "Medlem"}</span>
          <span className="block text-[11px] text-white/40 truncate">{what}</span>
        </span>
        <button onClick={() => memberLogout.mutate()} className="flex items-center gap-1 text-xs text-white/40 hover:text-white shrink-0">
          <LogOut size={12} /> Logga ut
        </button>
      </div>
    );
  }

  // Ingen behörighet: medlemmen loggar in överst på sidan; lösenordet finns här som reserv
  if (!auth.role) {
    // Inloggad medlem utan behörighet: visa vem man är och gå att logga ut (t.ex. inloggad som fel person)
    if (member.data) {
      return (
        <div className="w-full max-w-md mt-6 space-y-3">
          <div className="rounded-2xl bg-[#141414] border border-[#2a2a2a] p-4 flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white/80 truncate">{member.data.name ?? "Medlem"}</span>
              <span className="block text-[11px] text-white/40 truncate">Medlem</span>
            </span>
            <button onClick={() => memberLogout.mutate()} className="flex items-center gap-1 text-xs text-white/40 hover:text-white shrink-0">
              <LogOut size={12} /> Logga ut
            </button>
          </div>
          {opts.data?.password && (showLogin ? (
            <PasswordForm onSuccess={() => setShowLogin(false)} />
          ) : (
            <button onClick={() => setShowLogin(true)} className="mx-auto flex items-center gap-2 text-white/30 hover:text-white/70 text-xs">
              <KeyRound size={12} /> Styrelsens lösenord
            </button>
          ))}
        </div>
      );
    }
    if (!opts.data?.password) return null;
    return (
      <div className="w-full max-w-md mt-6">
        {showLogin ? (
          <LoginForm onSuccess={() => setShowLogin(false)} />
        ) : (
          <button
            onClick={() => setShowLogin(true)}
            className="mx-auto flex items-center gap-2 text-white/30 hover:text-white/70 text-xs"
          >
            <KeyRound size={12} /> Styrelsens lösenord
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

  // Delad länk med moduler: länkens namn i stället för "Styrelsen"
  if (auth.role === "access") {
    return (
      <div className="w-full max-w-md mt-6 rounded-2xl bg-[#141414] border border-[#2a2a2a] p-4 flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-white/60 uppercase tracking-wider truncate">{auth.linkName ?? "Delad länk"}</span>
          <span className="block text-[10px] text-white/35">Via länk · {auth.linkExpiresAt ? `gäller till och med ${new Date(new Date(auth.linkExpiresAt).getTime() - 60_000).toLocaleDateString("sv-SE", { day: "numeric", month: "numeric" })}` : "tills vidare"}</span>
        </span>
        <button onClick={() => logout.mutate()} className="flex items-center gap-1 text-xs text-white/40 hover:text-white shrink-0">
          <LogOut size={12} /> Logga ut
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mt-6 rounded-2xl bg-[#141414] border border-[#2a2a2a] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Styrelsen (lösenord)</span>
        <button onClick={() => logout.mutate()} className="flex items-center gap-1 text-xs text-white/40 hover:text-white">
          <LogOut size={12} /> Logga ut
        </button>
      </div>

    </div>
  );
}
