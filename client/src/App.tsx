import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Hub from "./pages/Hub";
const Home = lazy(() => import("./pages/Home"));
const ShareView = lazy(() => import("./pages/ShareView"));
import ScoreApp from "./pages/score/ScoreApp";
const IceTimeApp = lazy(() => import("./pages/icetime/IceTimeApp"));
const StatsApp = lazy(() => import("./pages/stats/StatsApp"));
const CardsApp = lazy(() => import("./pages/cards/CardsApp"));
const HistoryApp = lazy(() => import("./pages/history/HistoryApp"));
import InviteRedeem from "./pages/InviteRedeem";
import { RequireRole } from "./components/auth/RequireRole";
import { lazy, Suspense, type ComponentType } from "react";

/** Skyddar en sida i gränssnittet. Servern kontrollerar alltid behörigheten själv. */
const guard = (need: "admin" | "lineup", Page: ComponentType<any>) => (props: any) => (
  <RequireRole need={need}>
    <Suspense fallback={<div className="min-h-[100dvh] bg-[#0a0a0a]" />}>
      <Page {...props} />
    </Suspense>
  </RequireRole>
);

const LineupPage = guard("lineup", Home);
// Delade länkar är öppna och skrivskyddade (servern avgör om länken gått ut).
const SharedLineupPage = (props: any) => (
  <Suspense fallback={<div className="min-h-[100dvh] bg-[#0a0a0a]" />}>
    <ShareView {...props} />
  </Suspense>
);
const IceTimePage = guard("admin", IceTimeApp);
const StatsPage = guard("admin", StatsApp);
const CardsPage = guard("admin", CardsApp);
const HistoryPage = guard("admin", HistoryApp);

function Router() {
  return (
    <Switch>
      {/* Hub landing page */}
      <Route path="/" component={Hub} />

      {/* Lineup app */}
      <Route path="/lineup" component={LineupPage} />
      <Route path="/lineup/:id" component={SharedLineupPage} />

      {/* Tillfällig länk från styrelsen */}
      <Route path="/lank/:token" component={InviteRedeem} />

      {/* Score Tracker app – öppen för alla */}
      <Route path="/score" component={ScoreApp} />

      {/* IceTime app */}
      <Route path="/icetime" component={IceTimePage} />
      <Route path="/icetime/oversikt" component={IceTimePage} />

      {/* Stats app */}
      <Route path="/stats" component={StatsPage} />

      {/* Hockey Cards app */}
      <Route path="/cards" component={CardsPage} />

      {/* Match History app */}
      <Route path="/history" component={HistoryPage} />

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
