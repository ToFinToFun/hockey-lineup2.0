import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import { LoginForm } from "./LoginForm";

/**
 * Live och Score Tracker: öppna för alla, eller bara för inloggade (Inställningar → Åtkomst).
 * Servern kontrollerar alltid själv. Utan nät (Score Tracker i hallen) visas sidan som vanligt.
 */
export function PublicGate({ area, children }: { area: "live" | "score"; children: ReactNode }) {
  const pub = trpc.auth.publicAccess.useQuery(undefined, { staleTime: 60_000, retry: false });
  const member = trpc.member.me.useQuery(undefined, { staleTime: 60_000, retry: false });
  const auth = useAuth();
  if (pub.isLoading || auth.loading || member.isLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="animate-spin text-white/40" />
      </div>
    );
  }
  const open = pub.error || pub.data?.[area];
  const isScoreOk = auth.isAdmin || auth.canEditLineup || auth.modules.includes("score");
  const allowed = open || !!member.data || (area === "live" ? !!auth.role : isScoreOk);
  if (allowed) return <>{children}</>;
  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-[#141414] border border-[#2a2a2a] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-[#0a7ea4]" />
          <h1 className="text-lg font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>
            {area === "live" ? "Live" : "Score Tracker"}
          </h1>
        </div>
        <p className="text-white/50 text-sm">Logga in som medlem för att fortsätta.</p>
        <LoginForm />
        <Link href="/" className="inline-flex items-center gap-1 text-white/40 text-xs hover:text-white">
          <ArrowLeft size={12} /> Till startsidan
        </Link>
      </div>
    </div>
  );
}
