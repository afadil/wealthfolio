import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceSyncSection } from "./device-sync-section";

const hookMocks = vi.hoisted(() => ({
  useSyncStatus: vi.fn(),
  useDevices: vi.fn(),
  useSyncActions: vi.fn(),
  useRenameDevice: vi.fn(),
  useRevokeDevice: vi.fn(),
  getPairingSourceStatus: vi.fn(),
}));

interface MutationMock {
  mutateAsync: ReturnType<typeof vi.fn>;
  isPending: boolean;
  error?: unknown;
}

interface SyncActionsMock {
  stopBgSync: MutationMock;
  startBgSync: MutationMock;
  bootstrapSync: MutationMock;
  generateSnapshot: MutationMock;
  reinitializeSync: MutationMock;
  resetSync: MutationMock;
}

vi.mock("../hooks", () => ({
  useSyncStatus: hookMocks.useSyncStatus,
  useDevices: hookMocks.useDevices,
  useSyncActions: hookMocks.useSyncActions,
  useRenameDevice: hookMocks.useRenameDevice,
  useRevokeDevice: hookMocks.useRevokeDevice,
}));

vi.mock("../services/sync-service", () => ({
  syncService: {
    getPairingSourceStatus: hookMocks.getPairingSourceStatus,
  },
}));

vi.mock("@/adapters", () => ({
  backupDatabase: vi.fn(),
  openFileSaveDialog: vi.fn(),
}));

vi.mock("./pairing-flow", () => ({
  PairingFlow: ({ title }: { title?: string }) => <div>{title ?? "Pairing Flow"}</div>,
  WaitingState: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("./recovery-dialog", () => ({
  RecoveryDialog: () => null,
}));

describe("DeviceSyncSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hookMocks.useRenameDevice.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    hookMocks.useRevokeDevice.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it("opens the claimer flow directly for an untrusted READY device", async () => {
    hookMocks.useSyncStatus.mockReturnValue({
      isLoading: false,
      error: null,
      syncState: "READY",
      trustedDevices: [{ id: "trusted-1", name: "Laptop", platform: "mac", lastSeenAt: null }],
      device: { trustState: "untrusted" },
      engineStatus: null,
      refetch: vi.fn(),
    });
    hookMocks.useDevices.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
    hookMocks.useSyncActions.mockReturnValue(createActions());

    renderWithQueryClient(<DeviceSyncSection />);

    fireEvent.click(screen.getByRole("button", { name: "Connect This Device" }));

    expect(hookMocks.getPairingSourceStatus).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getAllByText("Connect This Device").length).toBeGreaterThan(1);
    });
  });

  it("requires confirmation when any other non-revoked device exists", async () => {
    const reinitializeSync = {
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
      error: null,
    };

    hookMocks.useSyncStatus.mockReturnValue({
      isLoading: false,
      error: null,
      syncState: "READY",
      trustedDevices: [{ id: "trusted-1", name: "Laptop", platform: "mac", lastSeenAt: null }],
      device: { trustState: "trusted" },
      engineStatus: null,
      refetch: vi.fn(),
    });
    hookMocks.useDevices.mockReturnValue({
      data: [
        { id: "current", displayName: "This device", trustState: "trusted", isCurrent: true },
        { id: "other", displayName: "Other device", trustState: "untrusted", isCurrent: false },
      ],
      isLoading: false,
      error: null,
    });
    hookMocks.useSyncActions.mockReturnValue(createActions({ reinitializeSync }));
    hookMocks.getPairingSourceStatus.mockResolvedValue({
      status: "restore_required",
      message: "Restore required",
      localCursor: 11,
      serverCursor: 8,
    });

    renderWithQueryClient(<DeviceSyncSection />);

    fireEvent.click(screen.getByRole("button", { name: "Connect Another Device" }));

    await waitFor(() => {
      expect(hookMocks.getPairingSourceStatus).toHaveBeenCalledTimes(1);
    });
    expect(reinitializeSync.mutateAsync).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
  });
});

function createActions(overrides?: Partial<SyncActionsMock>): SyncActionsMock {
  return {
    stopBgSync: {
      mutateAsync: vi.fn(),
      isPending: false,
    },
    startBgSync: {
      mutateAsync: vi.fn(),
      isPending: false,
    },
    bootstrapSync: {
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
    },
    generateSnapshot: {
      mutateAsync: vi.fn(),
      isPending: false,
    },
    reinitializeSync: {
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
      error: null,
    },
    resetSync: {
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    },
    ...overrides,
  };
}

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
