/*
 * IceTimeApp – Wrapper component with tab navigation
 * Routes between Kalkylator and Översikt within /icetime
 * DESIGN: Dark theme matching Hub landing page
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
    <div className="icetime-dark">
      {/* Sticky Navigation */}
      <nav className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur-md">
        <div className="container flex items-center gap-1 py-2">
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white/40 hover:text-white hover:bg-white/5 transition-all mr-2"
          >
            <Home className="w-4 h-4" />
          </Link>
          <span
            className="text-lg text-sky-400 mr-4 hidden sm:block font-bold tracking-tight"
            style={{ fontFamily: "'Oswald', sans-serif" }}
          >
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
                      ? "bg-sky-400/15 text-sky-400"
                      : "text-white/40 hover:text-white hover:bg-white/5"
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
