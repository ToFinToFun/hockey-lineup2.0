/*
 * IceTimeApp – Wrapper component with tab navigation
 * Routes between Kalkylator and Översikt within /icetime
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Calculator, LayoutGrid, Home } from "lucide-react";
import IceTimeCalc from "./IceTimeCalc";
import IceTimeOverview from "./IceTimeOverview";

const tabs = [
  { path: "/icetime", label: "Kalkylator", icon: Calculator },
  { path: "/icetime/oversikt", label: "Översikt", icon: LayoutGrid },
];

export default function IceTimeApp() {
  const [location] = useLocation();

  // Determine which sub-page to show
  const isOverview = location === "/icetime/oversikt";

  return (
    <div className="icetime">
      {/* Sticky Navigation */}
      <nav className="sticky top-0 z-40 border-b border-border/50 bg-white/85 backdrop-blur-md">
        <div className="container flex items-center gap-1 py-2">
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all mr-2"
          >
            <Home className="w-4 h-4" />
          </Link>
          <span className="font-serif text-lg text-ice-deep mr-4 hidden sm:block">
            IceTime
          </span>
          {tabs.map((tab) => {
            const isActive = location === tab.path;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.path}
                href={tab.path}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all
                  ${
                    isActive
                      ? "bg-ice-deep/10 text-ice-deep"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Page Content */}
      {isOverview ? <IceTimeOverview /> : <IceTimeCalc />}
    </div>
  );
}
