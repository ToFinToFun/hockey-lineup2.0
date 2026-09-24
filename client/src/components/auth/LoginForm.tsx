import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, Lock } from "lucide-react";

/** Styrelseinloggning med ett gemensamt lösenord. */
export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
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
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Styrelsens lösenord"
          autoComplete="current-password"
          className="flex-1 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-white/25 focus:outline-none focus:border-[#0a7ea4]/60"
        />
        <button
          onClick={submit}
          disabled={login.isPending || !password.trim()}
          className="px-4 py-2.5 rounded-lg bg-[#0a7ea4] text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-2"
        >
          {login.isPending ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
          Logga in
        </button>
      </div>
      {login.error && <p className="text-red-400 text-xs">{login.error.message}</p>}
    </div>
  );
}
