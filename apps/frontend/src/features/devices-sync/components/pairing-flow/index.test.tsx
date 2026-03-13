import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PairingFlow } from "./index";

const hookMocks = vi.hoisted(() => ({
  useSyncStatus: vi.fn(),
  usePairingIssuer: vi.fn(),
  usePairingClaimer: vi.fn(),
}));

vi.mock("../../hooks", () => ({
  useSyncStatus: hookMocks.useSyncStatus,
  usePairingIssuer: hookMocks.usePairingIssuer,
  usePairingClaimer: hookMocks.usePairingClaimer,
}));

vi.mock("@/adapters", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}));

describe("PairingFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows overwrite_confirm step with row count and action buttons", () => {
    hookMocks.useSyncStatus.mockReturnValue({
      device: { trustState: "untrusted" },
    });
    hookMocks.usePairingClaimer.mockReturnValue({
      step: "overwrite_confirm",
      error: null,
      sas: null,
      overwriteInfo: {
        localRows: 42,
        nonEmptyTables: [{ table: "accounts", rows: 10 }],
      },
      submitCode: vi.fn(),
      approveOverwrite: vi.fn(),
      cancel: vi.fn(),
      retry: vi.fn(),
    });
    hookMocks.usePairingIssuer.mockReturnValue({});

    render(<PairingFlow />);

    expect(screen.getByText("Replace local data?")).toBeInTheDocument();
    expect(screen.getByText(/42 rows/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Replace & Sync/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("shows restore-required issuer errors as a normal PairingResult error", () => {
    hookMocks.useSyncStatus.mockReturnValue({
      device: { trustState: "trusted" },
    });
    hookMocks.usePairingIssuer.mockReturnValue({
      step: "error",
      error:
        "SYNC_SOURCE_RESTORE_REQUIRED: Local sync state is ahead of the last confirmed sync state on the server.",
      needsRestore: true,
      sas: null,
      pairingCode: null,
      expiresAt: null,
      startPairing: vi.fn(),
      confirmSAS: vi.fn(),
      rejectSAS: vi.fn(),
      cancel: vi.fn(),
      reset: vi.fn(),
    });
    hookMocks.usePairingClaimer.mockReturnValue({});

    render(<PairingFlow />);

    // Falls through to PairingResult which formats the error nicely
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sync needs to be restored from this device before you can connect another device.",
      ),
    ).toBeInTheDocument();
  });
});
