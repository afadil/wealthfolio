import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { ScrollArea } from "@wealthfolio/ui/components/ui/scroll-area";
import { cn } from "@wealthfolio/ui/lib/utils";
import { Building2, ChevronRight, Loader2, LogIn, X } from "lucide-react";

import {
  closeBankWindow,
  getBankConnectSettings,
  listBankDownloadRuns,
  listenBankDownloadComplete,
  listenBankLoginDetected,
  listenBankProgress,
  listenBankWindowClosed,
  openBankWindow,
  startBankDownload,
} from "@/adapters";

import type {
  BankConnectSettings,
  BankDownloadCompletePayload,
  BankDownloadRun,
  BankLoginDetectedPayload,
  BankProgressPayload,
  BankWindowClosedPayload,
} from "@/adapters";

// ============================================================================
// Types
// ============================================================================

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  bankKey: string;
}

type BankStatus = "idle" | "window-open" | "logged-in" | "downloading" | "complete" | "error";

interface BankInfo {
  key: string;
  displayName: string;
}

// ============================================================================
// Constants
// ============================================================================

const BANKS: BankInfo[] = [
  { key: "ING", displayName: "ING" },
  { key: "CBA", displayName: "CommBank" },
  { key: "ANZ", displayName: "ANZ" },
  { key: "BOM", displayName: "Bank of Melbourne" },
  { key: "BEYOND", displayName: "Beyond Bank" },
];

// ============================================================================
// Helpers
// ============================================================================

function statusLabel(status: BankStatus): string {
  switch (status) {
    case "idle":
      return "Idle";
    case "window-open":
      return "Awaiting Login";
    case "logged-in":
      return "Logged In";
    case "downloading":
      return "Downloading...";
    case "complete":
      return "Complete";
    case "error":
      return "Error";
  }
}

function statusVariant(status: BankStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "idle":
      return "outline";
    case "window-open":
      return "secondary";
    case "logged-in":
      return "default";
    case "downloading":
      return "default";
    case "complete":
      return "default";
    case "error":
      return "destructive";
  }
}

function levelColor(level: string): string {
  switch (level) {
    case "error":
      return "text-destructive";
    case "warn":
      return "text-yellow-500";
    case "success":
      return "text-green-500";
    default:
      return "text-muted-foreground";
  }
}

function latestRunsByBank(runs: BankDownloadRun[]): Record<string, BankDownloadRun> {
  const byBank: Record<string, BankDownloadRun> = {};
  for (const run of runs) {
    if (!byBank[run.bankKey] || run.startedAt > byBank[run.bankKey].startedAt) {
      byBank[run.bankKey] = run;
    }
  }
  return byBank;
}

// ============================================================================
// BankCard Component
// ============================================================================

interface BankCardProps {
  bank: BankInfo;
  status: BankStatus;
  lastRun: BankDownloadRun | null;
  onOpenLogin: () => void;
  onStartDownload: () => void;
  onClose: () => void;
}

function BankCard({ bank, status, lastRun, onOpenLogin, onStartDownload, onClose }: BankCardProps) {
  const canDownload = status === "logged-in";
  const isActive = status === "window-open" || status === "logged-in" || status === "downloading";

  return (
    <Card className={cn("transition-all", isActive && "ring-primary ring-2")}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="text-muted-foreground h-5 w-5" />
            <CardTitle className="text-base">{bank.displayName}</CardTitle>
          </div>
          <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {lastRun && (
          <p className="text-muted-foreground mb-3 text-xs">
            Last run: {lastRun.filesDownloaded} downloaded, {lastRun.filesSkipped} skipped
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {(status === "idle" || status === "complete" || status === "error") && (
            <Button size="sm" variant="outline" onClick={onOpenLogin}>
              <LogIn className="mr-1 h-4 w-4" />
              Open Login
            </Button>
          )}
          {(status === "window-open" || status === "logged-in") && (
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="mr-1 h-4 w-4" />
              Close
            </Button>
          )}
          <Button
            size="sm"
            disabled={!canDownload}
            onClick={onStartDownload}
            variant={canDownload ? "default" : "secondary"}
          >
            {status === "downloading" ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ChevronRight className="mr-1 h-4 w-4" />
            )}
            Start Download
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// BankConnectPage
// ============================================================================

export default function BankConnectPage() {
  const [bankStatuses, setBankStatuses] = useState<Record<string, BankStatus>>({});
  const [lastRuns, setLastRuns] = useState<Record<string, BankDownloadRun | null>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [settings, setSettings] = useState<BankConnectSettings | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logIdCounter = useRef(0);

  const addLog = useCallback((bankKey: string, level: LogEntry["level"], message: string) => {
    const entry: LogEntry = {
      id: String(logIdCounter.current++),
      timestamp: new Date().toISOString(),
      level,
      message,
      bankKey,
    };
    setLogs((prev) => [...prev.slice(-499), entry]);
  }, []);

  // Load initial data
  useEffect(() => {
    getBankConnectSettings().then(setSettings).catch(console.error);

    listBankDownloadRuns()
      .then((runs) => setLastRuns(latestRunsByBank(runs)))
      .catch(console.error);
  }, []);

  // Subscribe to Tauri events
  useEffect(() => {
    const unlisteners: (() => Promise<void>)[] = [];

    listenBankLoginDetected((event: { payload: BankLoginDetectedPayload }) => {
      setBankStatuses((prev) => ({ ...prev, [event.payload.bankKey]: "logged-in" }));
      addLog(event.payload.bankKey, "success", `Login detected for ${event.payload.bankKey}`);
    }).then((ul) => unlisteners.push(ul));

    listenBankProgress((event: { payload: BankProgressPayload }) => {
      addLog(
        event.payload.bankKey,
        event.payload.level as LogEntry["level"],
        event.payload.message,
      );
    }).then((ul) => unlisteners.push(ul));

    listenBankDownloadComplete((event: { payload: BankDownloadCompletePayload }) => {
      setBankStatuses((prev) => ({ ...prev, [event.payload.bankKey]: "complete" }));
      addLog(
        event.payload.bankKey,
        "success",
        `Download complete: ${event.payload.downloaded} files`,
      );
      // Refresh runs
      listBankDownloadRuns()
        .then((runs) => setLastRuns(latestRunsByBank(runs)))
        .catch(console.error);
    }).then((ul) => unlisteners.push(ul));

    listenBankWindowClosed((event: { payload: BankWindowClosedPayload }) => {
      setBankStatuses((prev) => {
        const current = prev[event.payload.bankKey];
        if (current === "window-open" || current === "logged-in") {
          return { ...prev, [event.payload.bankKey]: "idle" };
        }
        return prev;
      });
      addLog(event.payload.bankKey, "info", `${event.payload.bankKey} window closed`);
    }).then((ul) => unlisteners.push(ul));

    return () => {
      unlisteners.forEach((ul) => ul());
    };
  }, [addLog]);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleOpenLogin = async (bankKey: string) => {
    try {
      await openBankWindow(bankKey);
      setBankStatuses((prev) => ({ ...prev, [bankKey]: "window-open" }));
      addLog(bankKey, "info", `Opening ${bankKey} login window...`);
    } catch (err) {
      addLog(bankKey, "error", `Failed to open ${bankKey} window: ${String(err)}`);
    }
  };

  const handleClose = async (bankKey: string) => {
    try {
      await closeBankWindow(bankKey);
    } catch (err) {
      addLog(bankKey, "error", `Failed to close ${bankKey} window: ${String(err)}`);
    }
  };

  const handleStartDownload = async (bankKey: string) => {
    try {
      setBankStatuses((prev) => ({ ...prev, [bankKey]: "downloading" }));
      await startBankDownload(bankKey);
    } catch (err) {
      setBankStatuses((prev) => ({ ...prev, [bankKey]: "error" }));
      addLog(bankKey, "error", `Download failed for ${bankKey}: ${String(err)}`);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Bank Connect</h1>
        <p className="text-muted-foreground text-sm">
          Download Australian bank statements directly into Wealthfolio
        </p>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Bank Cards */}
        <div className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto">
          {BANKS.map((bank) => (
            <BankCard
              key={bank.key}
              bank={bank}
              status={bankStatuses[bank.key] ?? "idle"}
              lastRun={lastRuns[bank.key] ?? null}
              onOpenLogin={() => handleOpenLogin(bank.key)}
              onStartDownload={() => handleStartDownload(bank.key)}
              onClose={() => handleClose(bank.key)}
            />
          ))}
        </div>

        {/* Log Panel */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-lg border">
          <div className="bg-muted/30 flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">Activity Log</span>
            <Button variant="ghost" size="sm" onClick={() => setLogs([])} className="h-7 text-xs">
              Clear
            </Button>
          </div>
          <ScrollArea className="flex-1 p-3">
            {logs.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-xs">
                Log messages will appear here...
              </p>
            ) : (
              <div className="space-y-1 font-mono text-xs">
                {logs.map((entry) => (
                  <div key={entry.id} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="text-muted-foreground w-12 shrink-0">[{entry.bankKey}]</span>
                    <span className={cn("w-12 shrink-0", levelColor(entry.level))}>
                      [{entry.level}]
                    </span>
                    <span>{entry.message}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Bottom bar */}
      {settings && (
        <div className="text-muted-foreground border-t pt-3 text-xs">
          Download folder: <span className="font-mono">{settings.downloadFolder}</span>
          {" · "}
          {settings.yearsBack} years back
        </div>
      )}
    </div>
  );
}
