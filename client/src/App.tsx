import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Hub from "./pages/Hub";
import Home from "./pages/Home";
import ShareView from "./pages/ShareView";
import ScoreApp from "./pages/score/ScoreApp";
import IceTimeApp from "./pages/icetime/IceTimeApp";

function Router() {
  return (
    <Switch>
      {/* Hub landing page */}
      <Route path="/" component={Hub} />

      {/* Lineup app */}
      <Route path="/lineup" component={Home} />
      <Route path="/lineup/:id" component={ShareView} />

      {/* Score Tracker app */}
      <Route path="/score" component={ScoreApp} />

      {/* IceTime app */}
      <Route path="/icetime" component={IceTimeApp} />
      <Route path="/icetime/oversikt" component={IceTimeApp} />

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
