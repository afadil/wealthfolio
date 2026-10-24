import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SyncButton } from "./sync-button";

const sync = vi.hoisted(() => ({ status: "idle", isPending: false }));

vi.mock("../providers/wealthfolio-connect-provider", () => ({
  useWealthfolioConnect: () => ({ isEnabled: true, isConnected: true, userInfo: {} }),
}));
vi.mock("../lib/plan-capabilities", () => ({ hasBrokerSync: () => true }));
vi.mock("../hooks", () => ({
  useAggregatedSyncStatus: () => ({ status: sync.status, lastSyncTime: null }),
  useSyncBrokerData: () => ({ mutate: vi.fn(), isPending: sync.isPending }),
}));

describe("SyncButton", () => {
  beforeEach(() => Object.assign(sync, { status: "idle", isPending: false }));

  it("names the icon-only button, since its tooltip is not announced", () => {
    render(<SyncButton />);
    expect(screen.getByRole("button", { name: "Sync" })).toBeInTheDocument();
  });

  it("names it for the running sync", () => {
    sync.status = "running";
    render(<SyncButton />);
    expect(screen.getByRole("button", { name: "Syncing..." })).toBeInTheDocument();
  });

  it("keeps the visible label as the name when it is shown", () => {
    render(<SyncButton showLabel />);
    expect(screen.getByRole("button", { name: "Sync" })).not.toHaveAttribute("aria-label");
  });
});
