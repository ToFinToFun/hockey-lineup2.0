/**
 * Matchrapport för den senast sparade matchen (route /rapport) – för delade
 * länkar med "Matchrapport (senaste matchen)". Samma rapport som i Matchhistorik.
 */
import { Link } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { MatchReportModal, type ReportMatch } from "@/components/score/MatchReportModal";
import type { GoalEvent } from "@/lib/scoreConstants";

export default function ReportApp() {
  const q = trpc.score.match.latest.useQuery(undefined, { staleTime: 30_000 });
  if (q.isLoading) return <div className="min-h-[100dvh] bg-[#0a0a0a] flex items-center justify-center"><Loader2 className="animate-spin text-white/40" /></div>;
  const m = q.data;
  if (!m) {
    return (
      <div className="min-h-[100dvh] bg-[#0a0a0a] text-white flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-lg font-semibold">Ingen sparad match än</p>
        <Link href="/" className="text-[#0a7ea4] text-sm inline-flex items-center gap-1"><ArrowLeft size={14} /> Till startsidan</Link>
      </div>
    );
  }
  const x = m as typeof m & { location?: string | null; opponentId?: number | null; report?: ReportMatch["report"] };
  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a]">
      {m.reviewStatus === "pending" && (
        <p className="text-center text-[11px] text-amber-300/80 py-2">Matchen är inte granskad av styrelsen än – siffrorna kan ändras.</p>
      )}
      <MatchReportModal
        match={{
          id: m.id, name: m.name, teamWhiteScore: m.teamWhiteScore, teamGreenScore: m.teamGreenScore,
          goalHistory: (m.goalHistory as GoalEvent[]) ?? [],
          matchEndTime: m.matchEndTime ? String(m.matchEndTime) : null,
          matchStartTime: m.matchStartTime ? String(m.matchStartTime) : null,
          createdAt: String(m.createdAt),
          lineup: m.lineup as ReportMatch["lineup"],
          location: x.location ?? null, opponentId: x.opponentId ?? null, report: x.report ?? null,
        }}
        onClose={() => { window.location.href = "/"; }}
      />
    </div>
  );
}
