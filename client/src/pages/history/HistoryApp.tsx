/**
 * HistoryApp - Standalone Match History app
 * Wraps the existing MatchHistoryPage as a root-level Hub app at /history
 */

import { useLocation } from "wouter";
import MatchHistoryPage from "../score/MatchHistoryPage";

export default function HistoryApp() {
  const [, setLocation] = useLocation();

  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-[#111111]">
      <div
        className="relative w-full flex flex-col overflow-hidden bg-[#1a1a1a]"
        style={{
          maxWidth: "640px",
          height: "100dvh",
        }}
      >
        <MatchHistoryPage onBack={() => setLocation("/")} />
      </div>
    </div>
  );
}
