import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBackupRestore } from "./use-backup-restore";

const mocks = vi.hoisted(() => ({
  backupDatabase: vi.fn(),
  backupDatabaseToPath: vi.fn(),
  openDatabaseFileDialog: vi.fn(),
  openFileSaveDialog: vi.fn(),
  openFolderDialog: vi.fn(),
  restoreDatabase: vi.fn(),
  getPlatform: vi.fn(),
  usePlatform: vi.fn(),
  toast: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/adapters", () => ({
  backupDatabase: mocks.backupDatabase,
  backupDatabaseToPath: mocks.backupDatabaseToPath,
  isWeb: true,
  logger: { error: mocks.loggerError },
  openDatabaseFileDialog: mocks.openDatabaseFileDialog,
  openFileSaveDialog: mocks.openFileSaveDialog,
  openFolderDialog: mocks.openFolderDialog,
  restoreDatabase: mocks.restoreDatabase,
}));

vi.mock("@/hooks/use-platform", () => ({
  getPlatform: mocks.getPlatform,
  usePlatform: mocks.usePlatform,
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

describe("useBackupRestore (web)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePlatform.mockReturnValue({ platform: null });
    mocks.backupDatabase.mockResolvedValue({
      filename: "wealthfolio_backup_20260309_120000.db",
      data: new Uint8Array([4, 5, 6]),
    });
    mocks.openFileSaveDialog.mockResolvedValue(true);
  });

  it("downloads backup file locally in web mode", async () => {
    const { result } = renderHook(() => useBackupRestore(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.performBackup();
    });

    expect(mocks.backupDatabase).toHaveBeenCalledTimes(1);
    expect(mocks.openFileSaveDialog).toHaveBeenCalledWith(
      new Uint8Array([4, 5, 6]),
      "wealthfolio_backup_20260309_120000.db",
    );

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith({
        title: "Backup completed successfully",
        description: "Backup saved as wealthfolio_backup_20260309_120000.db",
        variant: "success",
      });
    });
  });
});
