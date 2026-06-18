import { createContext, useContext, type ReactNode } from "react";
import type { StealthScreen } from "../lib/stealth-screen";
import type { StealthTheme } from "../theme";

export type StealthShellContextValue = {
  view: StealthScreen;
  setView: (view: StealthScreen) => void;
  theme: StealthTheme;
  setTheme: (theme: StealthTheme) => void;
  engineStatus: "checking" | "ready" | "offline";
  refreshProfiles: () => Promise<void>;
  syncBusy: boolean;
};

const StealthShellContext = createContext<StealthShellContextValue | null>(null);

export function StealthShellProvider({
  value,
  children
}: {
  value: StealthShellContextValue;
  children: ReactNode;
}) {
  return <StealthShellContext.Provider value={value}>{children}</StealthShellContext.Provider>;
}

export function useStealthShell() {
  const ctx = useContext(StealthShellContext);
  if (!ctx) throw new Error("useStealthShell must be used within StealthShellProvider");
  return ctx;
}
