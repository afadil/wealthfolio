import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HoldingType } from "@/lib/constants";
import type { AllocationTarget, DriftReport, Holding } from "@/lib/types";
import { RebalanceTab } from "./rebalance-tab";

const { useRebalancePlanMock, refetchMock } = vi.hoisted(() => ({
  useRebalancePlanMock: vi.fn(),
  refetchMock: vi.fn(),
}));

vi.mock("../hooks/use-rebalance", () => ({
  useRebalancePlan: useRebalancePlanMock,
}));

if (typeof ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {
      return undefined;
    }
    unobserve() {
      return undefined;
    }
    disconnect() {
      return undefined;
    }
  } as typeof ResizeObserver;
}
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => undefined;
}

function holding(assetId: string, symbol: string, name: string): Holding {
  return {
    id: `${assetId}-holding`,
    accountId: "account-1",
    holdingType: HoldingType.SECURITY,
    instrument: {
      id: assetId,
      symbol,
      name,
      currency: "USD",
      quoteMode: "MARKET",
      instrumentType: "EQUITY",
    },
  } as Holding;
}

const profile: AllocationTarget = {
  id: "target-1",
  name: "Balanced",
  scopeType: "all",
  taxonomyId: "asset_classes",
  triggerType: "manual",
  driftBandBps: 500,
  bandType: "absolute",
  relativeFactorBps: 10000,
  rebalanceGoal: "exact_target",
  minTradeAmount: "1",
  wholeSharesOnly: false,
  allowSells: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const driftReport: DriftReport = {
  targetId: profile.id,
  scopeType: "all",
  totalValue: 1000,
  baseCurrency: "USD",
  maxDriftBps: 1000,
  outOfBandCount: 1,
  rows: [
    {
      categoryId: "equity",
      categoryName: "Equity",
      color: "#355c4c",
      currentBps: 9000,
      targetBps: 10000,
      driftBps: -1000,
      currentValue: 900,
      targetValue: 1000,
      valueDelta: 100,
      effectiveBandBps: 500,
      status: "underweight",
      isRequired: true,
      isZeroCurrent: false,
      isCash: false,
    },
  ],
  deployableCash: 100,
};

const holdings = [
  holding("asset-z", "AAA", "Alpha fund"),
  holding("asset-m", "MMM", "Middle fund"),
  holding("asset-a", "ZZZ", "Zed fund"),
];

function renderRebalance() {
  return render(
    <RebalanceTab
      profile={profile}
      driftReport={driftReport}
      accountScope={{ type: "all" }}
      holdings={holdings}
      availableCash={100}
      sourceVersion="source-1"
      isSourceLoading={false}
    />,
  );
}

describe("RebalanceTab eligible holdings production flow", () => {
  beforeEach(() => {
    refetchMock.mockReset().mockResolvedValue({ error: null });
    useRebalancePlanMock.mockReturnValue({
      data: undefined,
      isFetching: false,
      refetch: refetchMock,
    });
  });

  it("hides the selector outside Cash Flow Only and restores its selection", async () => {
    const user = userEvent.setup();
    renderRebalance();

    const trigger = () => screen.getByRole("button", { name: /Eligible holdings/ });
    await user.click(trigger());
    await user.click(await screen.findByRole("option", { name: /AAA.*selected/i }));
    expect(trigger()).toHaveTextContent("2 of 3 selected");

    await user.click(screen.getByRole("button", { name: /Sell.*rebalance/i }));
    expect(screen.queryByRole("button", { name: /Eligible holdings/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Cash-flow.*only/i }));
    expect(trigger()).toHaveTextContent("2 of 3 selected");
  });

  it("omits a full allowlist and passes a sorted partial allowlist when calculating", async () => {
    const user = userEvent.setup();
    renderRebalance();

    const initialParams = useRebalancePlanMock.mock.lastCall?.[0] as {
      eligibleAssetIds?: string[];
    };
    expect(initialParams.eligibleAssetIds).toBeUndefined();

    await user.click(screen.getByRole("button", { name: /Calculate plan/ }));
    await waitFor(() => expect(refetchMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /Eligible holdings/ }));
    await user.click(await screen.findByRole("option", { name: /AAA.*selected/i }));
    const partialParams = useRebalancePlanMock.mock.lastCall?.[0] as {
      eligibleAssetIds?: string[];
    };
    expect(partialParams.eligibleAssetIds).toEqual(["asset-a", "asset-m"]);

    await user.click(screen.getByRole("button", { name: /Calculate plan/ }));
    await waitFor(() => expect(refetchMock).toHaveBeenCalledTimes(2));
  });

  it("does not calculate from Enter with an empty selection", async () => {
    const user = userEvent.setup();
    renderRebalance();

    await user.click(screen.getByRole("button", { name: /Eligible holdings/ }));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(screen.getByRole("button", { name: /Calculate plan/ })).toBeDisabled();
    expect(refetchMock).not.toHaveBeenCalled();
  });
});

describe("RebalanceTab exports", () => {
  const FSI = "\u2068";
  const PDI = "\u2069";
  // In a right-to-left language, translated and formatted text carries bidi
  // isolation marks; a trade name stands in for them here.
  const plan = {
    targetId: profile.id,
    availableCash: 100,
    cashUsed: 100,
    cashRemaining: 0,
    maxDriftBpsBefore: 1000,
    maxDriftBpsAfter: 0,
    trades: [
      {
        action: "BUY",
        categoryId: "equity",
        categoryName: "Equity",
        assetId: "asset-z",
        symbol: `${FSI}AAA${PDI}`,
        name: `${FSI}Alpha fund!${PDI}`,
        quantity: 1,
        estimatedPrice: 100,
        estimatedAmount: 100,
        reason: "underweight",
      },
    ],
    warnings: [],
    afterBpsByCategory: { equity: 10000 },
  };

  beforeEach(() => {
    // A plan calculated for the current inputs.
    useRebalancePlanMock.mockImplementation((params: { sourceKey: string }) => ({
      data: { plan, sourceKey: params.sourceKey },
      isFetching: false,
      refetch: refetchMock,
    }));
  });

  it("copies text without bidi isolation marks", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderRebalance();
    fireEvent.click(await screen.findByRole("button", { name: "Copy as text" }));
    const text = writeText.mock.lastCall?.[0] as string;
    expect(text).toContain("BUY  AAA  ");
    expect(text).not.toMatch(/[\u2066-\u2069]/);
    vi.unstubAllGlobals();
  });

  it("exports a CSV without bidi isolation marks", async () => {
    let csv: Blob | undefined;
    const createObjectURL = vi.fn((blob: Blob) => {
      csv = blob;
      return "blob:csv";
    });
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    renderRebalance();
    fireEvent.click(await screen.findByRole("button", { name: "Export CSV" }));
    const text = await csv!.text();
    expect(text).toContain('"Alpha fund!"');
    expect(text).not.toMatch(/[\u2066-\u2069]/);
    click.mockRestore();
    vi.unstubAllGlobals();
  });
});
