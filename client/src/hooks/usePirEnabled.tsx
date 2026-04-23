/**
 * PIR (Player Impact Rating) visibility context.
 * Allows any component to check if PIR display is enabled
 * without prop-drilling through the component tree.
 */
import React, { createContext, useContext } from "react";

const PirEnabledContext = createContext<boolean>(false);

export function PirEnabledProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return (
    <PirEnabledContext.Provider value={enabled}>
      {children}
    </PirEnabledContext.Provider>
  );
}

export function usePirEnabled(): boolean {
  return useContext(PirEnabledContext);
}
