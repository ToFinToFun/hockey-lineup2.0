import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { KeyRound, Loader2, Lock, LogIn } from "lucide-react";

/**
 * Inloggning: som medlem (e-postkod) – behörigheten följer med. Styrelsens lösenord
 * visas bara som reserv så länge det finns.
 */
export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const opts = trpc.auth.loginOptions.useQuery(undefined, { staleTime: 5 * 60_000 });
  const [showPassword, setShowPassword] = useState(false);
  const next = typeof window !== "undefined" ? window.location.pathname : "/";
  return (
    <div className="space-y-3">
      <Link
        href={`/logga-in?next=${encodeURIComponent(next)}`}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
      >
        <LogIn size={16} /> Logga in
      </Link>
      {opts.data?.password &&
        (showPassword ? (
          <PasswordForm onSuccess={onSuccess} />
        ) : (
          <button onClick={() => setShowPassword(true)} className="mx-auto flex items-center gap-1.5 text-white/35 hover:text-white/70 text-xs">
            <KeyRound size={12} /> Styrelsens lösenord
          </button>
        ))}
    </div>
  );
}

export function PasswordForm({ onSuccess }: { onSuccess?: () => void }) {
  const [password, setPassword] = useState("");
  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      setPassword("");
      await utils.invalidate();
      onSuccess?.();
    },
  });
  const submit = () => {
    if (password.trim()) login.mutate({ password: password.trim() });
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Styrelsens lösenord"
          autoComplete="current-password"
          autoFocus
          className="flex-1 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#0a7ea4]/60"
        />
        <button
          onClick={submit}
          disabled={login.isPending || !password.trim()}
          className="px-4 py-2.5 rounded-lg bg-[#0a7ea4] text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-2"
        >
          {login.isPending ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
        </button>
      </div>
      {login.error && <p className="text-red-400 text-xs">{login.error.message}</p>}
    </div>
  );
}
