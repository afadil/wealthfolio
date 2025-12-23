import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type SyncStatus = "idle" | "syncing-market" | "calculating-portfolio";

interface PortfolioSyncContextType {
  status: SyncStatus;
  message: string;
  setMarketSyncing: () => void;
  setPortfolioCalculating: () => void;
  setIdle: () => void;
}

const PortfolioSyncContext = createContext<PortfolioSyncContextType | undefined>(undefined);

const STATUS_MESSAGES: Record<SyncStatus, string> = {
  idle: "",
  "syncing-market": "Syncing market data...",
  "calculating-portfolio": "Calculating portfolio...",
};

export function PortfolioSyncProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>("idle");

  const setMarketSyncing = useCallback(() => {
    setStatus("syncing-market");
  }, []);

  const setPortfolioCalculating = useCallback(() => {
    setStatus("calculating-portfolio");
  }, []);

  const setIdle = useCallback(() => {
    setStatus("idle");
  }, []);

  const value: PortfolioSyncContextType = {
    status,
    message: STATUS_MESSAGES[status],
    setMarketSyncing,
    setPortfolioCalculating,
    setIdle,
  };

  return <PortfolioSyncContext.Provider value={value}>{children}</PortfolioSyncContext.Provider>;
}

export function usePortfolioSync() {
  const context = useContext(PortfolioSyncContext);
  if (!context) {
    throw new Error("usePortfolioSync must be used within a PortfolioSyncProvider");
  }
  return context;
}

// Optional hook that returns null if used outside provider (for places where provider might not exist)
export function usePortfolioSyncOptional() {
  return useContext(PortfolioSyncContext);
}
