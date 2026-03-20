import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useExportData } from "./use-export-data";

const mocks = vi.hoisted(() => ({
  backupDatabase: vi.fn(),
  backupDatabaseToPath: vi.fn(),
  getAccounts: vi.fn(),
  getActivities: vi.fn(),
  getGoals: vi.fn(),
  getHistoricalValuations: vi.fn(),
  openFileSaveDialog: vi.fn(),
  openFolderDialog: vi.fn(),
  getPlatform: vi.fn(),
  toast: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/adapters", () => ({
  backupDatabase: mocks.backupDatabase,
  backupDatabaseToPath: mocks.backupDatabaseToPath,
  getAccounts: mocks.getAccounts,
  getActivities: mocks.getActivities,
  getGoals: mocks.getGoals,
  getHistoricalValuations: mocks.getHistoricalValuations,
  isWeb: true,
  logger: { error: mocks.loggerError },
  openFileSaveDialog: mocks.openFileSaveDialog,
  openFolderDialog: mocks.openFolderDialog,
}));

vi.mock("@/hooks/use-platform", () => ({
  getPlatform: mocks.getPlatform,
}));

vi.mock("@wealthfolio/ui/components/ui/use-toast", () => ({
  toast: mocks.toast,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useExportData (web SQLite)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backupDatabase.mockResolvedValue({
      filename: "wealthfolio_backup_20260309_120000.db",
      data: new Uint8Array([1, 2, 3]),
    });
    mocks.openFileSaveDialog.mockResolvedValue(true);
  });

  it("downloads SQLite backup bytes in web mode", async () => {
    const { result } = renderHook(() => useExportData(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.exportData({
        format: "SQLite",
        data: "accounts",
      });
    });

    expect(mocks.backupDatabase).toHaveBeenCalledTimes(1);
    expect(mocks.openFileSaveDialog).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      "wealthfolio_backup_20260309_120000.db",
    );

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith({
        title: "Database backup completed successfully.",
        description: "Backup saved as wealthfolio_backup_20260309_120000.db",
        variant: "success",
      });
    });
  });
});
