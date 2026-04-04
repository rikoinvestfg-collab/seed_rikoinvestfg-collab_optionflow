import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Dashboard from "@/pages/dashboard";
import ChartPage from "@/pages/chart";
import EarningsPage from "@/pages/earnings";
import MacroPage from "@/pages/macro";
import FlowIntelligencePage from "@/pages/flow-intelligence";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Always dark for trading terminal
    document.documentElement.classList.add("dark");
  }, []);

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Router hook={useHashLocation}>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/chart" component={ChartPage} />
            <Route path="/earnings" component={EarningsPage} />
            <Route path="/macro" component={MacroPage} />
            <Route path="/flow-intelligence" component={FlowIntelligencePage} />
            <Route component={NotFound} />
          </Switch>
        </Router>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
