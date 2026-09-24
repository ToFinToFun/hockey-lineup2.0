import type { ReactNode } from "react";
import { Link } from "wouter";
import { Loader2, Lock, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { LoginForm } from "./LoginForm";

type Need = "admin" | "lineup";

/**
 * Visar innehållet bara för rätt roll. Servern kontrollerar alltid behörigheten
 * själv – det här är bara för att visa en inloggningsruta i stället för fel.
 */
export function RequireRole({ need, children }: { need: Need; children: ReactNode }) {
  const auth = useAuth();
  const allowed = need === "admin" ? auth.isAdmin : auth.canEditLineup;

  if (auth.loading) {
    return (
      <div className="min-h-[100dvh] bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="animate-spin text-white/40" />
      </div>
    );
  }
  if (allowed) return <>{children}</>;

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-[#141414] border border-[#2a2a2a] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-[#0a7ea4]" />
          <h1 className="text-lg font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>
            Inloggning krävs
          </h1>
        </div>
        <p className="text-white/50 text-sm">
          {need === "lineup"
            ? "Den här delen är för styrelsen, eller för dig som fått en tillfällig länk."
            : "Den här delen är bara för styrelsen."}
        </p>
        <LoginForm />
        <Link href="/" className="inline-flex items-center gap-1 text-white/40 text-xs hover:text-white">
          <ArrowLeft size={12} /> Till startsidan
        </Link>
      </div>
    </div>
  );
}
