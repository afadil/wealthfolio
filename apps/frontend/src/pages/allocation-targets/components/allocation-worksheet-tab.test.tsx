import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HoldingType } from "@/lib/constants";
import type {
  Account,
  AllocationTarget,
  AllocationTargetConstraint,
  AllocationWorksheetResult,
  CalculatedAdjustments,
  DriftReport,
  Holding,
} from "@/lib/types";
import { cleanup, render, screen, waitFor, within } from "@/test/render";

import { AllocationWorksheetTab } from "./allocation-worksheet-tab";

const {
  generateMock,
  previewMock,
  saveFileMock,
  useAccountsMock,
  accountsRef,
  heldAccountIds,
  holdingsRef,
  constraintsRef,
} = vi.hoisted(() => ({
  generateMock: vi.fn(),
  previewMock: vi.fn(),
  saveFileMock: vi.fn(() => Promise.resolve(true)),
  // Called once per render of the worksheet, which is how the tests count them.
  useAccountsMock: vi.fn(),
  accountsRef: { current: [] as Account[] },
  /** Holdings by account, when a test needs more than one security. */
  holdingsRef: { current: null as Record<string, Holding[]> | null },
  /** Which accounts record VTI, which decides whether an increase is placed for the user (§6). */
  heldAccountIds: { current: ["acc-1"] as string[] },
  /** The target's standing rules (#1177). */
  constraintsRef: { current: [] as AllocationTargetConstraint[] },
}));

vi.mock("../hooks/use-calculated-adjustments", () => ({
  useCalculatedAdjustments: () => ({ mutateAsync: generateMock, isPending: false }),
}));
vi.mock("../hooks/use-allocation-worksheet", () => ({
  useAllocationWorksheet: () => ({ mutateAsync: previewMock, isPending: false, reset: vi.fn() }),
}));
vi.mock("@/adapters", () => ({
  getHoldingsList: vi.fn((filter: { accountId: string }) =>
    Promise.resolve(holdingsFor(filter.accountId)),
  ),
  getAssetTaxonomyAssignments: vi.fn(() => Promise.resolve([])),
  listTargetConstraints: vi.fn(() => Promise.resolve(constraintsRef.current)),
  openFileSaveDialog: saveFileMock,
  canonicalizeEligibleAssetIds: (ids?: readonly string[]) =>
    ids === undefined ? undefined : [...new Set(ids)].sort(),
}));
vi.mock("@/hooks/use-accounts", () => ({
  useAccounts: () => {
    useAccountsMock();
    return { accounts: accountsRef.current, isLoading: false };
  },
}));
vi.mock("@/hooks/use-portfolios", () => ({ usePortfolios: () => ({ data: [] }) }));
vi.mock("@/hooks/use-sync-market-data", () => ({
  useSyncMarketDataMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-taxonomies", () => ({
  useTaxonomy: () => ({ data: undefined, dataUpdatedAt: 0 }),
}));
vi.mock("@/pages/asset/hooks/use-assets", () => ({
  useAssets: () => ({
    assets: [
      { id: "vti", kind: "INVESTMENT", isActive: true, displayCode: "VTI", name: "VTI" },
      // Held in no account: only reachable through Add position.
      {
        id: "vxus",
        kind: "INVESTMENT",
        isActive: true,
        displayCode: "VXUS",
        name: "Total International",
      },
    ],
    isLoading: false,
  }),
}));
vi.mock("@/pages/asset/hooks/use-latest-quotes", () => ({
  useLatestQuotes: () => ({ data: {}, dataUpdatedAt: 0, isFetched: true }),
}));
vi.mock("@/pages/settings/general/exchange-rates/use-exchange-rate", () => ({
  useExchangeRates: () => ({ dataUpdatedAt: 0 }),
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

function account(id: string, name: string): Account {
  return { id, name, isActive: true } as Account;
}

function holdingsFor(accountId: string): Holding[] {
  if (holdingsRef.current) return holdingsRef.current[accountId] ?? [];
  if (!heldAccountIds.current.includes(accountId)) return [];
  return [
    {
      id: `${accountId}-vti`,
      accountId,
      holdingType: HoldingType.SECURITY,
      instrument: { id: "vti", symbol: "VTI", name: "Total market", currency: "USD" },
      quantity: 10,
      marketValue: { local: 1000, base: 1000 },
    } as Holding,
  ];
}

/** An in-memory stand-in: the test environment's storage has no `clear`. */
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, String(value)),
  };
}

function acknowledgeDisclosure() {
  vi.stubGlobal("localStorage", memoryStorage());
  localStorage.setItem(
    "wealthfolio:rebalancing-worksheet-disclosure:v2",
    JSON.stringify({ version: 2 }),
  );
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
  minTradeAmount: "0",
  wholeSharesOnly: false,
  allowSells: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const driftReport: DriftReport = {
  targetId: profile.id,
  scopeType: "all",
  totalValue: 3000,
  baseCurrency: "USD",
  maxDriftBps: 0,
  outOfBandCount: 0,
  rows: [],
  deployableCash: 2000,
};

const calculated: CalculatedAdjustments = {
  mode: "invest_cash",
  rule: "current_holding_proportions",
  adjustments: [
    {
      lineId: "calc:vti:unassigned",
      direction: "increase",
      assetId: "vti",
      symbol: "VTI",
      accountId: null,
      amount: 1200,
      quantity: 12,
      unitPrice: 100,
      isBelowMinimum: false,
    },
  ],
  unresolved: [],
  scaling: {},
  remainingCash: 0,
  fundingShortfalls: [],
};

const previewResult: AllocationWorksheetResult = {
  targetId: profile.id,
  targetName: profile.name,
  baseCurrency: "USD",
  calculatedAt: "2026-01-01T00:00:00Z",
  sourceFingerprint: "fingerprint",
  resolvedAccountIds: ["acc-1"],
  observedTrackedCash: 2000,
  // The core reports what every selected account records.
  recordedCashByAccount: { "acc-1": 2000, "acc-2": 0 },
  trackedCashToUse: 0,
  externalContribution: 0,
  increaseTotal: 0,
  reductionTotal: 0,
  cashRemaining: 0,
  maxDifferenceBpsBefore: 0,
  maxDifferenceBpsAfter: 0,
  lines: [],
  categories: [],
  accountFunding: [],
  warnings: [],
  sourceRecords: [],
};

/** A resolved line of VTI, as the preview returns it. */
function previewLine(
  overrides: Partial<AllocationWorksheetResult["lines"][number]>,
): AllocationWorksheetResult["lines"][number] {
  return {
    lineId: "line",
    direction: "increase",
    assetId: "vti",
    accountId: "acc-1",
    symbol: "VTI",
    name: "Total market",
    inputMode: "amount",
    inputValue: 0,
    quantity: 2,
    unitPrice: 100,
    estimatedAmount: 200,
    contractMultiplier: 1,
    quoteSource: {
      id: "q",
      sourceType: "quote",
      value: 100,
      fromCurrency: "USD",
      toCurrency: "USD",
      timestamp: "2026-09-20T00:00:00Z",
      isStale: false,
    },
    categoryExposures: [],
    ...overrides,
  };
}

async function renderWorksheet(report: DriftReport = driftReport) {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Providers = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  render(
    <AllocationWorksheetTab
      profile={profile}
      driftReport={report}
      accountScope={{ type: "all" }}
      sourceVersion="source-1"
      isSourceLoading={false}
    />,
    { wrapper: Providers },
  );
  await screen.findByRole("navigation");
  return user;
}

async function goTo(
  user: ReturnType<typeof userEvent.setup>,
  step: "Setup" | "Adjust positions" | "Review",
) {
  await user.click(
    within(screen.getByRole("navigation")).getByRole("button", { name: new RegExp(step) }),
  );
}

async function calculateFromTarget(user: ReturnType<typeof userEvent.setup>) {
  // Calculating waits until the core has read what the selected accounts record.
  await waitFor(
    () => expect(screen.getByRole("button", { name: "Next: Adjust positions" })).toBeEnabled(),
    { timeout: 2000 },
  );
  await user.click(screen.getByRole("button", { name: "Next: Adjust positions" }));
  await waitFor(() => expect(screen.getByLabelText("Adjustment for VTI")).toHaveValue("1200.00"));
}

describe("AllocationWorksheetTab regeneration (§5)", () => {
  beforeEach(() => {
    acknowledgeDisclosure();
    accountsRef.current = [account("acc-1", "Brokerage")];
    heldAccountIds.current = ["acc-1"];
    generateMock.mockReset().mockResolvedValue(calculated);
    previewMock.mockReset().mockResolvedValue(previewResult);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("states how amounts are split with the eligible securities rather than asking for it", async () => {
    const user = await renderWorksheet();
    expect(screen.queryByText(/Choose an allocation rule/)).not.toBeInTheDocument();

    // Said once, a hover away from the securities it applies to.
    expect(
      screen.getByRole("button", {
        name: /Increases go to securities in categories below target, split by what you hold of each/,
      }),
    ).toBeInTheDocument();

    await calculateFromTarget(user);
    expect(generateMock.mock.lastCall?.[0]).toMatchObject({ rule: "current_holding_proportions" });
  });

  it("prefills the worksheet when the user recalculates from target", async () => {
    const user = await renderWorksheet();
    // The cash to deploy follows what the chosen accounts record, which the
    // core reports rather than the drift report.
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Cash to deploy" })).toHaveValue("2,000.00"),
    );

    await calculateFromTarget(user);

    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(generateMock.mock.lastCall?.[0]).toMatchObject({
      targetId: "target-1",
      mode: "invest_cash",
      rule: "current_holding_proportions",
      cash: {
        trackedCashToUse: 2000,
        trackedCashByAccount: { "acc-1": 2000 },
        externalContribution: {},
      },
      selectedAccountIds: ["acc-1"],
      eligibleAssetIds: undefined,
    });
  });

  it("previews an edited line without calculating adjustments again", async () => {
    const user = await renderWorksheet();
    await calculateFromTarget(user);
    previewMock.mockClear();

    const input = screen.getByLabelText("Adjustment for VTI");
    await user.clear(input);
    await user.type(input, "500");

    await waitFor(() => expect(previewMock).toHaveBeenCalled(), { timeout: 2000 });
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it("restores the calculated adjustments on reset without calculating again", async () => {
    const user = await renderWorksheet();
    await calculateFromTarget(user);

    const input = screen.getByLabelText("Adjustment for VTI");
    await user.clear(input);
    await user.type(input, "5");
    await user.click(screen.getByRole("button", { name: /Reset to calculated adjustments/ }));

    expect(screen.getByLabelText("Adjustment for VTI")).toHaveValue("1200.00");
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it("states how much of the gaps the cash covered, on screen and in the export", async () => {
    generateMock.mockResolvedValue({
      ...calculated,
      adjustments: [{ ...calculated.adjustments[0], accountId: "acc-1" }],
      scaling: { cashFactor: 0.132 },
      belowOneUnit: [{ assetId: "vxus", symbol: "VXUS", amount: 60 }],
    });
    previewMock.mockResolvedValue({
      ...previewResult,
      lines: [previewLine({ lineId: "l1", estimatedAmount: 1200, quantity: 12 })],
    });
    const coverage =
      "The selected cash covers 13.2% of the gaps to the target, so each increase it funds is scaled to 13.2%.";
    const user = await renderWorksheet();

    await calculateFromTarget(user);
    // The notes read as one paragraph.
    expect(screen.getByText(coverage, { exact: false })).toBeInTheDocument();
    expect(
      screen.getByText("Less than one whole unit, so nothing was placed on: VXUS.", {
        exact: false,
      }),
    ).toBeInTheDocument();
    // No step-4 scaling happened, so none is claimed.
    expect(screen.queryByText(/Increases were scaled/)).not.toBeInTheDocument();

    await goTo(user, "Review");
    await waitFor(
      () => expect(screen.getByRole("button", { name: "Copy for spreadsheet" })).toBeEnabled(),
      {
        timeout: 2000,
      },
    );
    await user.click(screen.getByRole("button", { name: "Copy for spreadsheet" }));
    expect(await navigator.clipboard.readText()).toContain(coverage);
  });

  it("rounds the units in Review as Adjust positions does", async () => {
    generateMock.mockResolvedValue({
      ...calculated,
      adjustments: [{ ...calculated.adjustments[0], accountId: "acc-1" }],
    });
    previewMock.mockResolvedValue({
      ...previewResult,
      lines: [previewLine({ lineId: "l1", estimatedAmount: 1200, quantity: 12.34518953 })],
    });
    const user = await renderWorksheet();
    await calculateFromTarget(user);

    await goTo(user, "Review");

    expect(await screen.findByText("≈ 12.35 units")).toBeInTheDocument();
    expect(screen.queryByText(/12\.34518953/)).not.toBeInTheDocument();
  });

  it("marks the worksheet out of date when a price moved more than 1% since the calculation", async () => {
    generateMock.mockResolvedValue({
      ...calculated,
      adjustments: [{ ...calculated.adjustments[0], accountId: "acc-1" }],
    });
    // Calculated at 100 a unit; the preview now prices VTI at 110.
    previewMock.mockResolvedValue({
      ...previewResult,
      lines: [previewLine({ lineId: "l1", unitPrice: 110, estimatedAmount: 1100, quantity: 10 })],
    });
    const user = await renderWorksheet();
    // Calculate once the cash the accounts record is known, so only prices move.
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Cash to deploy" })).toHaveValue("2,000.00"),
    );

    await calculateFromTarget(user);

    expect(
      await screen.findByText(
        /Prices moved more than 1% since these adjustments were calculated/,
        undefined,
        {
          timeout: 2000,
        },
      ),
    ).toBeInTheDocument();
    // Reported, never recalculated on its own (§5).
    expect(screen.getByLabelText("Adjustment for VTI")).toHaveValue("1200.00");
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it("leaves the worksheet current when prices only drift within 1%", async () => {
    generateMock.mockResolvedValue({
      ...calculated,
      adjustments: [{ ...calculated.adjustments[0], accountId: "acc-1" }],
    });
    // Calculated at 100 a unit; prices synced since put VTI at 100.5.
    previewMock.mockResolvedValue({
      ...previewResult,
      lines: [previewLine({ lineId: "l1", unitPrice: 100.5, estimatedAmount: 1206, quantity: 12 })],
    });
    const user = await renderWorksheet();
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Cash to deploy" })).toHaveValue("2,000.00"),
    );

    await calculateFromTarget(user);
    previewMock.mockClear();
    // The preview of the calculated worksheet has answered.
    await waitFor(() => expect(previewMock).toHaveBeenCalled(), { timeout: 2000 });
    await waitFor(() => expect(screen.queryByText("Updating…")).not.toBeInTheDocument());

    expect(screen.queryByText(/Prices moved more than/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Recalculate from target" }),
    ).not.toBeInTheDocument();
  });

  it("opens on Setup and calculates only from its button, then moves on without calculating", async () => {
    const user = await renderWorksheet();
    expect(screen.getByRole("textbox", { name: "Cash to deploy" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Adjustment for VTI")).not.toBeInTheDocument();

    await calculateFromTarget(user);

    // Once calculated and unchanged, Next only moves on.
    await goTo(user, "Setup");
    await user.click(screen.getByRole("button", { name: "Next: Adjust positions" }));
    expect(screen.getByLabelText("Adjustment for VTI")).toHaveValue("1200.00");
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it("opens on Setup on every visit, even once the worksheet is calculated", async () => {
    const user = await renderWorksheet();
    await calculateFromTarget(user);
    // The draft is saved shortly after the change; leave once it holds the
    // calculation, not on an earlier save.
    await waitFor(() => {
      const saved = Array.from({ length: localStorage.length }, (_, index) =>
        localStorage.getItem(localStorage.key(index) ?? ""),
      );
      expect(saved.some((value) => value?.includes('"inputsKey"'))).toBe(true);
    });
    cleanup();

    const again = await renderWorksheet();
    expect(screen.getByRole("textbox", { name: "Cash to deploy" })).toBeInTheDocument();
    await goTo(again, "Adjust positions");
    expect(screen.getByLabelText("Adjustment for VTI")).toHaveValue("1200.00");
  });

  it("does not call the worksheet out of date while the recorded cash is still being read", async () => {
    const user = await renderWorksheet();
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Cash to deploy" })).toHaveValue("2,000.00"),
    );
    await calculateFromTarget(user);
    // Leave only once the saved draft holds the calculation.
    await waitFor(() => {
      const saved = Array.from({ length: localStorage.length }, (_, index) =>
        localStorage.getItem(localStorage.key(index) ?? ""),
      );
      expect(saved.some((value) => value?.includes('"inputsKey"'))).toBe(true);
    });
    cleanup();

    // Coming back: the cash the accounts record arrives with the first preview.
    let answerPreview: (result: AllocationWorksheetResult) => void = () => undefined;
    previewMock.mockImplementation(
      () => new Promise<AllocationWorksheetResult>((resolve) => (answerPreview = resolve)),
    );
    await renderWorksheet();
    await waitFor(() => expect(previewMock).toHaveBeenCalled(), { timeout: 2000 });

    expect(screen.queryByText(/Inputs changed since these adjustments/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Recalculate from target" }),
    ).not.toBeInTheDocument();

    previewMock.mockResolvedValue(previewResult);
    answerPreview(previewResult);
    await waitFor(
      () => expect(screen.getByRole("textbox", { name: "Cash to deploy" })).toHaveValue("2,000.00"),
      { timeout: 2000 },
    );
    expect(screen.queryByText(/Inputs changed since these adjustments/)).not.toBeInTheDocument();
  });

  it("opens any panel from the stepper before a calculation, and calculates nothing", async () => {
    const user = await renderWorksheet();

    await goTo(user, "Review");
    await goTo(user, "Adjust positions");
    expect(screen.getByLabelText("Adjustment for VTI")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Previous: Setup" }));

    expect(screen.getByRole("textbox", { name: "Cash to deploy" })).toBeInTheDocument();
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("marks the worksheet out of date when an input changes, and leaves it alone", async () => {
    const user = await renderWorksheet();
    await calculateFromTarget(user);

    await goTo(user, "Setup");
    const cashInput = screen.getByRole("textbox", { name: "Cash to deploy" });
    await user.clear(cashInput);
    await user.type(cashInput, "100");

    // Setup says it on its step and in one line above its one action, which
    // stays Next.
    const changed = "Changed since the last calculation. Next recalculates.";
    expect(
      await within(screen.getByRole("navigation")).findByRole("button", {
        name: new RegExp(changed),
      }),
    ).toHaveAccessibleName(/Setup/);
    expect(screen.getByRole("status")).toHaveTextContent(changed);
    expect(screen.getByRole("button", { name: "Next: Adjust positions" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Recalculate from target" }),
    ).not.toBeInTheDocument();

    // The steps lead on without recalculating. Where the amounts are read, the
    // banner says so first; they are left alone.
    await goTo(user, "Adjust positions");
    expect(screen.getByText(/Inputs changed since these adjustments/)).toBeInTheDocument();
    expect(screen.getByLabelText("Adjustment for VTI")).toHaveValue("1200.00");
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it("recalculates on Next when the inputs changed and nothing was edited", async () => {
    const user = await renderWorksheet();
    await calculateFromTarget(user);

    await goTo(user, "Setup");
    const cashInput = screen.getByRole("textbox", { name: "Cash to deploy" });
    await user.clear(cashInput);
    await user.type(cashInput, "100");
    await user.click(screen.getByRole("button", { name: "Next: Adjust positions" }));

    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(2));
    expect(generateMock.mock.lastCall?.[0]).toMatchObject({ cash: { trackedCashToUse: 100 } });
    expect(await screen.findByLabelText("Adjustment for VTI")).toHaveValue("1200.00");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("asks before Next replaces edits, and keeps them unless told otherwise", async () => {
    const user = await renderWorksheet();
    await calculateFromTarget(user);
    await user.clear(screen.getByLabelText("Adjustment for VTI"));
    await user.type(screen.getByLabelText("Adjustment for VTI"), "500");
    await user.tab();

    await goTo(user, "Setup");
    const cashInput = screen.getByRole("textbox", { name: "Cash to deploy" });
    await user.clear(cashInput);
    await user.type(cashInput, "100");
    await user.click(screen.getByRole("button", { name: "Next: Adjust positions" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Replace your edits?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Keep my edits" }));
    expect(await screen.findByLabelText("Adjustment for VTI")).toHaveValue("500.00");
    expect(generateMock).toHaveBeenCalledTimes(1);

    await goTo(user, "Setup");
    await user.click(screen.getByRole("button", { name: "Next: Adjust positions" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Recalculate" }),
    );
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText("Adjustment for VTI")).toHaveValue("1200.00");
  });
});

describe("AllocationWorksheetTab account allocation (§6)", () => {
  beforeEach(() => {
    acknowledgeDisclosure();
    heldAccountIds.current = ["acc-1"];
    generateMock.mockReset().mockResolvedValue(calculated);
    previewMock.mockReset().mockResolvedValue(previewResult);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves an increase unallocated when several accounts could receive it", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    // Both record the security, so placing it would be a choice between them.
    heldAccountIds.current = ["acc-1", "acc-2"];
    const user = await renderWorksheet();

    await calculateFromTarget(user);
    // The empty worksheet may be previewed on mount, before the calculation.
    previewMock.mockClear();

    // The row states the fact, and opens the account allocation from there.
    expect(screen.queryByText("Account allocation")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Choose accounts" }));
    const allocation = screen
      .getByText("Account allocation")
      .closest<HTMLElement>("[data-account-allocation]")!;
    expect(within(allocation).getByText("$1,200.00 remaining")).toBeInTheDocument();
    expect(within(allocation).getByLabelText("Amount for Brokerage")).toHaveValue("");
    expect(within(allocation).getByLabelText("Amount for Retirement")).toHaveValue("");
    // Wait past the preview debounce, or the check below cannot fail.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(previewMock).not.toHaveBeenCalled();
  });

  it("states what each account can fund while the change waits to be placed", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1", "acc-2"];
    const user = await renderWorksheet();
    await calculateFromTarget(user);

    // The change blocks the preview, yet each account's cash is known from Setup.
    await user.click(screen.getByRole("button", { name: "Choose accounts" }));
    const allocation = screen
      .getByText("Account allocation")
      .closest<HTMLElement>("[data-account-allocation]")!;
    expect(within(allocation).getByText(/Can fund about \$2,000\.00/)).toBeInTheDocument();
    expect(within(allocation).getByText(/Can fund about \$0\.00/)).toBeInTheDocument();
    expect(within(allocation).queryByText(/cash recorded/)).not.toBeInTheDocument();
    // Brokerage can take all of it; Retirement can fund none of it.
    expect(
      within(allocation).getByRole("button", { name: "Use $1,200.00 in Brokerage" }),
    ).toBeInTheDocument();
    expect(
      within(allocation).queryByRole("button", { name: /^Use .* in Retirement$/ }),
    ).not.toBeInTheDocument();
    // Together they can fund it, so there is nothing to say about a shortfall.
    expect(within(allocation).queryByText(/These accounts can fund/)).not.toBeInTheDocument();
  });

  it("offers no amount to use while the accounts' cash is still being read", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1", "acc-2"];
    // The core has not answered yet, so what each account can fund is unknown.
    previewMock.mockReturnValue(new Promise(() => undefined));
    const user = await renderWorksheet();
    await goTo(user, "Adjust positions");
    await user.type(screen.getByLabelText("Adjustment for VTI"), "500");
    await user.click(screen.getByRole("button", { name: "Choose accounts" }));

    const allocation = screen
      .getByText("Account allocation")
      .closest<HTMLElement>("[data-account-allocation]")!;
    expect(within(allocation).getAllByText(/Reading cash…/)).toHaveLength(2);
    // Offering the whole change would put it in an account that may not fund it.
    expect(within(allocation).queryByRole("button", { name: /^Use / })).not.toBeInTheDocument();
  });

  it("says how far the account amounts are from the adjustment", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1", "acc-2"];
    const user = await renderWorksheet();
    await calculateFromTarget(user);
    await user.click(screen.getByRole("button", { name: "Choose accounts" }));
    const allocation = screen
      .getByText("Account allocation")
      .closest<HTMLElement>("[data-account-allocation]")!;

    await user.type(within(allocation).getByLabelText("Amount for Brokerage"), "1000");
    expect(screen.getByRole("button", { name: "$200.00 left to allocate" })).toBeInTheDocument();

    await user.type(within(allocation).getByLabelText("Amount for Retirement"), "300");
    expect(
      screen.getByRole("button", { name: "$100.00 more than the adjustment" }),
    ).toBeInTheDocument();
    expect(within(allocation).getByText("$100.00 more than the adjustment")).toBeInTheDocument();
  });

  it("accepts a split that is off by under 1% rather than blocking the review", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1", "acc-2"];
    const user = await renderWorksheet();
    await calculateFromTarget(user);
    await user.click(screen.getByRole("button", { name: "Choose accounts" }));
    const allocation = () =>
      screen.getByText("Account allocation").closest<HTMLElement>("[data-account-allocation]")!;

    // Under 1% of the $1,200.00 change is stated, not demanded.
    await user.type(within(allocation()).getByLabelText("Amount for Brokerage"), "1189");
    expect(within(allocation()).getByText("$11.00 unplaced, accepted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /left to allocate/ })).not.toBeInTheDocument();

    // More than that still has to be placed, so a half-placed change is not missed.
    await user.clear(within(allocation()).getByLabelText("Amount for Brokerage"));
    await user.type(within(allocation()).getByLabelText("Amount for Brokerage"), "1187");
    expect(screen.getByRole("button", { name: "$13.00 left to allocate" })).toBeInTheDocument();
  });

  it("lets the adjustment follow what the accounts hold, in one click", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1", "acc-2"];
    const user = await renderWorksheet();
    await calculateFromTarget(user);
    await user.click(screen.getByRole("button", { name: "Choose accounts" }));
    const allocation = () =>
      screen.getByText("Account allocation").closest<HTMLElement>("[data-account-allocation]")!;
    await user.type(within(allocation()).getByLabelText("Amount for Brokerage"), "1000");
    await user.type(within(allocation()).getByLabelText("Amount for Retirement"), "300");
    expect(
      screen.getByRole("button", { name: "$100.00 more than the adjustment" }),
    ).toBeInTheDocument();

    await user.click(
      within(allocation()).getByRole("button", { name: "Use $1,300.00 as the adjustment" }),
    );

    expect(screen.getByLabelText("Adjustment for VTI")).toHaveValue("1300.00");
    expect(
      screen.queryByRole("button", { name: /more than the adjustment/ }),
    ).not.toBeInTheDocument();
    // Placed for less than the adjustment, it can follow the other way too.
    await user.clear(within(allocation()).getByLabelText("Amount for Retirement"));
    await user.click(
      within(allocation()).getByRole("button", { name: "Use $1,000.00 as the adjustment" }),
    );
    expect(screen.getByLabelText("Adjustment for VTI")).toHaveValue("1000.00");
    expect(screen.queryByRole("button", { name: /left to allocate/ })).not.toBeInTheDocument();
  });

  it("keeps the account amounts when the adjustment changes, unless it turns around", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1", "acc-2"];
    const user = await renderWorksheet();
    await calculateFromTarget(user);
    await user.click(screen.getByRole("button", { name: "Choose accounts" }));
    const allocation = screen
      .getByText("Account allocation")
      .closest<HTMLElement>("[data-account-allocation]")!;
    await user.type(within(allocation).getByLabelText("Amount for Brokerage"), "1000");
    await user.type(within(allocation).getByLabelText("Amount for Retirement"), "200");

    // Trimming the total leaves the placed amounts for the user to adjust.
    const total = screen.getByLabelText("Adjustment for VTI");
    await user.clear(total);
    await user.type(total, "1100");
    expect(within(allocation).getByLabelText("Amount for Brokerage")).toHaveValue("1000.00");
    expect(within(allocation).getByLabelText("Amount for Retirement")).toHaveValue("200.00");
    expect(
      screen.getByRole("button", { name: "$100.00 more than the adjustment" }),
    ).toBeInTheDocument();

    // A reduction draws on what each account holds, so the increase's split
    // does not carry over to it...
    await user.clear(total);
    await user.type(total, "-500");
    expect(screen.getByLabelText("Amount for Brokerage")).toHaveValue("");
    expect(screen.getByLabelText("Amount for Retirement")).toHaveValue("");

    // ...and comes back when the change turns back.
    await user.clear(total);
    await user.type(total, "1200");
    expect(screen.getByLabelText("Amount for Brokerage")).toHaveValue("1000.00");
    expect(screen.getByLabelText("Amount for Retirement")).toHaveValue("200.00");
    expect(screen.getByRole("button", { name: "2 accounts" })).toBeInTheDocument();
  });

  it("states when the listed accounts cannot fund the change between them", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1", "acc-2"];
    previewMock.mockResolvedValue({
      ...previewResult,
      recordedCashByAccount: { "acc-1": 500, "acc-2": 0 },
    });
    const user = await renderWorksheet();
    await calculateFromTarget(user);
    await user.click(screen.getByRole("button", { name: "Choose accounts" }));

    const allocation = screen
      .getByText("Account allocation")
      .closest<HTMLElement>("[data-account-allocation]")!;
    expect(
      within(allocation).getByText("These accounts can fund about $500.00 of the $1,200.00."),
    ).toBeInTheDocument();

    // Each account offers what it can take of the change, by its own figures; an
    // account that can fund nothing offers nothing, and nothing picks for the user.
    expect(
      within(allocation).queryByRole("button", { name: /^Use .* in Retirement$/ }),
    ).not.toBeInTheDocument();
    await user.click(within(allocation).getByRole("button", { name: "Use $500.00 in Brokerage" }));
    expect(within(allocation).getByLabelText("Amount for Brokerage")).toHaveValue("500.00");
    expect(screen.getByRole("button", { name: "$700.00 left to allocate" })).toBeInTheDocument();
  });

  it("says where the rest of the cash is when the listed accounts cannot fund it", async () => {
    accountsRef.current = [
      account("acc-1", "Brokerage"),
      account("acc-2", "Retirement"),
      account("acc-3", "Joint"),
    ];
    // Brokerage and Joint hold VTI, so they are listed; Retirement has the cash.
    heldAccountIds.current = ["acc-1", "acc-3"];
    previewMock.mockResolvedValue({
      ...previewResult,
      recordedCashByAccount: { "acc-1": 500, "acc-2": 1000, "acc-3": 0 },
    });
    const user = await renderWorksheet();
    await calculateFromTarget(user);
    await user.click(screen.getByRole("button", { name: "Choose accounts" }));
    const allocation = screen
      .getByText("Account allocation")
      .closest<HTMLElement>("[data-account-allocation]")!;

    // What an account holds of the security is named as such, never as its cash.
    expect(within(allocation).getAllByText(/10 VTI held \(\$1,000\.00\)/)).toHaveLength(2);
    expect(
      within(allocation).getByRole("button", { name: /What it deploys in this run, \$500\.00/ }),
    ).toBeInTheDocument();
    expect(within(allocation).queryByLabelText("Amount for Retirement")).not.toBeInTheDocument();

    await user.click(
      within(allocation).getByRole("button", {
        name: "Other accounts can fund about $1,000.00 more.",
      }),
    );

    expect(within(allocation).getByLabelText("Amount for Retirement")).toBeInTheDocument();
  });

  it("estimates each account's funding while changes are still being placed", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1", "acc-2"];
    const user = await renderWorksheet();
    await calculateFromTarget(user);

    // VTI is not placed yet, so no preview reports funding; the page estimates it.
    const funding = () =>
      screen.getByText(/left by the estimate so far/).closest<HTMLElement>("div")!;
    await waitFor(() => expect(funding()).toHaveTextContent("Brokerage≈ $2,000.00"));
    expect(funding()).toHaveTextContent("Retirement≈ $0.00");

    await user.click(screen.getByRole("button", { name: "Choose accounts" }));
    const allocation = screen
      .getByText("Account allocation")
      .closest<HTMLElement>("[data-account-allocation]")!;
    await user.type(within(allocation).getByLabelText("Amount for Brokerage"), "500");

    expect(funding()).toHaveTextContent("Brokerage≈ $1,500.00");
  });

  it("covers an account's shortfall with a deposit when the user asks", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1", "acc-2"];
    previewMock.mockResolvedValue({
      ...previewResult,
      recordedCashByAccount: { "acc-1": 500, "acc-2": 0 },
    });
    const user = await renderWorksheet();
    await calculateFromTarget(user);
    await user.click(screen.getByRole("button", { name: "Choose accounts" }));
    const allocation = () =>
      screen.getByText("Account allocation").closest<HTMLElement>("[data-account-allocation]")!;

    // All of VTI in Brokerage, which records $500.00: $700.00 short.
    await user.type(within(allocation()).getByLabelText("Amount for Brokerage"), "1200");
    await user.click(
      within(allocation()).getByRole("button", {
        name: "Add $700.00 as a deposit to Brokerage",
      }),
    );

    await waitFor(
      () =>
        expect(previewMock.mock.lastCall?.[0]).toMatchObject({
          cash: { externalContribution: { "acc-1": 700 } },
        }),
      { timeout: 2000 },
    );
    expect(
      within(allocation()).queryByRole("button", { name: /as a deposit to Brokerage/ }),
    ).not.toBeInTheDocument();
  });

  it("steps an account's amount one unit at a time inside the allocation", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1", "acc-2"];
    const user = await renderWorksheet();
    await calculateFromTarget(user);
    await user.click(screen.getByRole("button", { name: "Choose accounts" }));
    const allocation = screen
      .getByText("Account allocation")
      .closest<HTMLElement>("[data-account-allocation]")!;

    // VTI is recorded at 100 a unit.
    await user.click(within(allocation).getByRole("button", { name: "Add one unit in Brokerage" }));
    await user.click(within(allocation).getByRole("button", { name: "Add one unit in Brokerage" }));
    expect(within(allocation).getByLabelText("Amount for Brokerage")).toHaveValue("200.00");

    await user.click(
      within(allocation).getByRole("button", { name: "Remove one unit in Brokerage" }),
    );
    expect(within(allocation).getByLabelText("Amount for Brokerage")).toHaveValue("100.00");
    // An account never goes below zero.
    expect(
      within(allocation).getByRole("button", { name: "Remove one unit in Retirement" }),
    ).toBeDisabled();
  });

  it("places an increase in the only account recording the security", async () => {
    // A fact about where the security sits, not a choice between accounts (§6).
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1"];
    const user = await renderWorksheet();

    await calculateFromTarget(user);

    // Placed without a choice being made: the row names where it went.
    await user.click(screen.getByRole("button", { name: "Brokerage", expanded: false }));
    const allocation = screen
      .getByText("Account allocation")
      .closest<HTMLElement>("[data-account-allocation]")!;
    expect(within(allocation).getByText("Fully allocated")).toBeInTheDocument();
    // Nothing is left to place, so nothing offers to place the rest.
    expect(within(allocation).queryByRole("button", { name: /^Use / })).not.toBeInTheDocument();
    expect(within(allocation).getByLabelText("Amount for Brokerage")).toHaveValue("1200.00");
    // An account without the security waits behind a link, and can still take it.
    expect(within(allocation).queryByLabelText("Amount for Retirement")).not.toBeInTheDocument();
    await user.click(within(allocation).getByRole("button", { name: "Place in another account" }));
    await user.type(within(allocation).getByLabelText("Amount for Retirement"), "200");
    // Still being typed in, so read as typed.
    expect(within(allocation).getByLabelText("Amount for Retirement")).toHaveValue("200");
    expect(
      within(allocation).queryByRole("button", { name: "Place in another account" }),
    ).not.toBeInTheDocument();
  });

  it("names the one account a change can only come from, with nothing to place", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1"];
    generateMock.mockResolvedValue({
      ...calculated,
      adjustments: [
        {
          ...calculated.adjustments[0],
          lineId: "calc:vti:acc-1",
          direction: "reduce",
          accountId: "acc-1",
          amount: -500,
          quantity: -5,
        },
      ],
    });
    const user = await renderWorksheet();
    // A reduction is a Rebalance calculation's.
    await user.click(screen.getByRole("checkbox", { name: "Rebalance" }));
    await waitFor(
      () => expect(screen.getByRole("button", { name: "Next: Adjust positions" })).toBeEnabled(),
      { timeout: 2000 },
    );
    await user.click(screen.getByRole("button", { name: "Next: Adjust positions" }));
    await waitFor(() => expect(screen.getByLabelText("Adjustment for VTI")).toHaveValue("-500.00"));

    // Only Brokerage records VTI, so the reduction comes from there: a fact the
    // row states, with no allocation to open.
    const vti = document.querySelector<HTMLElement>('[data-amounts-row="vti"]')!;
    expect(within(vti).getByText("Brokerage")).toBeInTheDocument();
    expect(
      within(vti).queryByRole("button", { name: "Edit account allocation" }),
    ).not.toBeInTheDocument();
  });

  it("opens the account allocation from anywhere on the row, and closes it the same way", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1"];
    const user = await renderWorksheet();
    await calculateFromTarget(user);
    const vti = document.querySelector<HTMLElement>('[data-amounts-row="vti"]')!;

    await user.click(within(vti).getByText("Total market"));
    expect(within(vti).getByText("Account allocation")).toBeInTheDocument();
    // The open row is the selected one, so its classes stay lit.
    expect(vti).toHaveAttribute("aria-current", "true");

    // Working inside the open allocation does not close it.
    await user.click(within(vti).getByText("Account allocation"));
    expect(within(vti).getByText("Account allocation")).toBeInTheDocument();

    await user.click(within(vti).getByText("Total market"));
    expect(within(vti).queryByText("Account allocation")).not.toBeInTheDocument();
    expect(vti).not.toHaveAttribute("aria-current");
  });

  it("opens the account allocation from its chevron whatever the status says", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1"];
    previewMock.mockResolvedValue({
      ...previewResult,
      lines: [{ lineId: "position:vti:acc-1:increase", assetId: "vti" }],
      warnings: [
        {
          id: "w1",
          kind: "stale_quote",
          lineId: "position:vti:acc-1:increase",
          message: "VTI is priced from a dated quote.",
          acknowledgementRequired: false,
        },
      ],
    } as unknown as AllocationWorksheetResult);
    const user = await renderWorksheet();
    await calculateFromTarget(user);

    // The status reports the warning, so it no longer names the account.
    expect(await screen.findByText("1 warning", {}, { timeout: 2000 })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit account allocation" }));

    const allocation = screen
      .getByText("Account allocation")
      .closest<HTMLElement>("[data-account-allocation]")!;
    expect(within(allocation).getByLabelText("Amount for Brokerage")).toHaveValue("1200.00");
  });

  it("groups the review by account, with the cash each one has left or lacks", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    previewMock.mockResolvedValue({
      ...previewResult,
      lines: [
        previewLine({ lineId: "l1", accountId: "acc-1", estimatedAmount: 1000 }),
        previewLine({
          lineId: "l2",
          direction: "reduce",
          accountId: "acc-2",
          estimatedAmount: 200,
        }),
      ],
      accountFunding: [
        {
          accountId: "acc-1",
          availableCash: 700,
          externalCash: 0,
          reductionProceeds: 0,
          increases: 1000,
          remaining: -300,
        },
        {
          accountId: "acc-2",
          availableCash: 0,
          externalCash: 0,
          reductionProceeds: 200,
          increases: 0,
          remaining: 200,
        },
      ],
    } as unknown as AllocationWorksheetResult);
    const user = await renderWorksheet();
    await waitFor(() => expect(previewMock).toHaveBeenCalled(), { timeout: 2000 });

    await goTo(user, "Review");

    const brokerage = await waitFor(
      () => document.querySelector<HTMLElement>('[data-review-account="acc-1"]')!,
    );
    expect(brokerage).toHaveTextContent("Brokerage · 1 entry");
    // The account's figures close its group, like a sum under its lines.
    const totalOf = (group: HTMLElement) =>
      group.querySelector<HTMLElement>("[data-review-total]")!;
    expect(totalOf(brokerage)).toHaveTextContent("Total+$1,000.00Funding needed: $300.00");
    expect(
      within(brokerage).getByText("VTI").compareDocumentPosition(totalOf(brokerage)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const retirement = document.querySelector<HTMLElement>('[data-review-account="acc-2"]')!;
    expect(retirement).toHaveTextContent("Retirement · 1 entry");
    expect(totalOf(retirement)).toHaveTextContent("Total−$200.00$200.00 left");
  });

  it("tells apart accounts that share a name wherever the name stands alone", async () => {
    accountsRef.current = [
      { ...account("acc-1", "Individual"), accountNumber: "U1234001" },
      { ...account("acc-2", "Individual"), accountNumber: "U5678002" },
    ];
    previewMock.mockResolvedValue({
      ...previewResult,
      lines: [
        previewLine({ lineId: "l1", accountId: "acc-1", estimatedAmount: 1000, quantity: 10 }),
        previewLine({ lineId: "l2", accountId: "acc-2", estimatedAmount: 200, quantity: 2 }),
      ],
    });
    const user = await renderWorksheet();
    await goTo(user, "Review");
    await waitFor(
      () => expect(screen.getByRole("button", { name: "Copy for spreadsheet" })).toBeEnabled(),
      {
        timeout: 2000,
      },
    );

    expect(document.querySelector('[data-review-account="acc-1"]')).toHaveTextContent(
      "Individual ··4001 · 1 entry",
    );
    expect(document.querySelector('[data-review-account="acc-2"]')).toHaveTextContent(
      "Individual ··8002 · 1 entry",
    );
    // The table is what orders are placed from, so it carries the same names.
    await user.click(screen.getByRole("button", { name: "Copy for spreadsheet" }));
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain("Individual ··4001\tVTI");
    expect(copied).toContain("Individual ··8002\tVTI");
  });

  it("adds up only what accounts have left, and states each shortfall on its own", async () => {
    accountsRef.current = [
      account("acc-1", "Brokerage"),
      account("acc-2", "Retirement"),
      account("acc-3", "Savings"),
    ];
    previewMock.mockResolvedValue({
      ...previewResult,
      // Netted across accounts, which no account can spend (§6).
      cashRemaining: -100,
      accountFunding: [
        {
          accountId: "acc-1",
          availableCash: 700,
          externalCash: 0,
          reductionProceeds: 0,
          increases: 1000,
          remaining: -300,
        },
        {
          accountId: "acc-2",
          availableCash: 200,
          externalCash: 0,
          reductionProceeds: 0,
          increases: 0,
          remaining: 200,
        },
        // What dividing leaves behind, far below a cent: not a shortfall.
        {
          accountId: "acc-3",
          availableCash: 500,
          externalCash: 0,
          reductionProceeds: 0,
          increases: 500,
          remaining: -3e-12,
        },
      ],
    } as unknown as AllocationWorksheetResult);
    const user = await renderWorksheet();
    await waitFor(() => expect(previewMock).toHaveBeenCalled(), { timeout: 2000 });
    await goTo(user, "Adjust positions");

    const funding = (await screen.findByText("Funding left")).parentElement!;
    expect(funding).toHaveTextContent(
      "$200.00left after the worksheet, across the accounts you chose.",
    );
    expect(within(funding).getAllByText(/Funding needed/)).toHaveLength(1);
    expect(within(funding).getByText("Funding needed: $300.00")).toBeInTheDocument();
  });

  it("lists a change that cannot be placed yet, and leads back to its row", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1", "acc-2"];
    const user = await renderWorksheet();
    await calculateFromTarget(user);

    await goTo(user, "Review");
    const held = document.querySelector<HTMLElement>('[data-held-line="vti"]')!;
    expect(held).toHaveTextContent("VTI +$1,200.00");
    expect(held).toHaveTextContent("Place the full $1,200.00 adjustment for VTI");

    await user.click(within(held).getByRole("button", { name: "Show the position" }));
    expect(await screen.findByText("Account allocation")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount for Brokerage")).toHaveValue("");
  });

  it("copies and exports the same table once every change is in the review", async () => {
    accountsRef.current = [account("acc-1", "Brokerage")];
    previewMock.mockResolvedValue({
      ...previewResult,
      lines: [previewLine({ lineId: "l1", estimatedAmount: 1000, quantity: 10 })],
    });
    saveFileMock.mockClear();
    const user = await renderWorksheet();
    await goTo(user, "Review");

    // The actions move from the empty review to the result once the preview lands.
    await waitFor(
      () => expect(screen.getByRole("button", { name: "Copy for spreadsheet" })).toBeEnabled(),
      {
        timeout: 2000,
      },
    );
    expect(screen.getByText("Warnings and unresolved amounts are included.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy for spreadsheet" }));
    const copied = await navigator.clipboard.readText();
    // Nothing was calculated, so no line is called calculated or edited.
    expect(copied).toContain("Brokerage\tVTI\tTotal market\t\tIncrease\t1000.00\t10");

    // Saved through the runtime: a native save dialog in the app, a download on the web.
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(saveFileMock).toHaveBeenCalledTimes(1));
    const [file, fileName] = saveFileMock.mock.calls[0] as unknown as [Blob, string];
    expect(fileName).toBe("rebalancing-worksheet-2026-01-01.csv");
    const csv = await file.text();
    expect(csv).toContain(`"Brokerage","VTI","Total market","","Increase","1000.00","10"`);
  });

  it("holds export back while a change is not in the review, and says why", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1", "acc-2"];
    const user = await renderWorksheet();
    await calculateFromTarget(user);

    await goTo(user, "Review");

    expect(screen.getByRole("button", { name: "Copy for spreadsheet" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
    expect(
      screen.getByText("Export is available once every adjustment is in the review."),
    ).toBeInTheDocument();
  });

  it("keeps a security added by hand in view, and lets any account take it", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1"];
    const user = await renderWorksheet();
    await calculateFromTarget(user);

    await user.click(screen.getByRole("button", { name: "Add position" }));
    await user.click(await screen.findByRole("option", { name: /VXUS/ }));

    // Held nowhere and not sized yet: it still stays in view to be sized.
    await user.type(await screen.findByLabelText("Adjustment for VXUS"), "500");
    const added = document.querySelector<HTMLElement>('[data-amounts-row="vxus"]')!;
    await user.click(within(added).getByRole("button", { name: "Edit account allocation" }));

    // No account holds it, so every account is offered at once.
    const allocation = within(added)
      .getByText("Account allocation")
      .closest<HTMLElement>("[data-account-allocation]")!;
    expect(within(allocation).getByLabelText("Amount for Brokerage")).toBeInTheDocument();
    expect(within(allocation).getByLabelText("Amount for Retirement")).toBeInTheDocument();
    expect(
      within(allocation).queryByRole("button", { name: "Place in another account" }),
    ).not.toBeInTheDocument();
  });

  it("previews a worksheet with no adjustments instead of refusing it", async () => {
    accountsRef.current = [account("acc-1", "Brokerage")];
    await renderWorksheet();

    await waitFor(() => expect(previewMock).toHaveBeenCalled(), { timeout: 2000 });
    expect(previewMock.mock.lastCall?.[0]).toMatchObject({
      lines: [],
      selectedAccountIds: ["acc-1"],
    });
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("leaves an account the user removed out of the calculation", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    const user = await renderWorksheet();

    await user.click(screen.getByRole("checkbox", { name: "Include Retirement" }));
    await waitFor(
      () => expect(screen.getByRole("button", { name: "Next: Adjust positions" })).toBeEnabled(),
      { timeout: 2000 },
    );
    await user.click(screen.getByRole("button", { name: "Next: Adjust positions" }));

    await waitFor(() => expect(generateMock).toHaveBeenCalled());
    expect(generateMock.mock.lastCall?.[0]).toMatchObject({ selectedAccountIds: ["acc-1"] });
  });

  it("caps the cash to deploy at what the chosen accounts record", async () => {
    accountsRef.current = [account("acc-1", "Brokerage")];
    const user = await renderWorksheet();
    const cashInput = screen.getByRole("textbox", { name: "Cash to deploy" });
    await waitFor(() => expect(cashInput).toHaveValue("2,000.00"));

    await user.clear(cashInput);
    await user.type(cashInput, "5000");
    await user.tab();

    expect(cashInput).toHaveValue("2,000.00");
    await waitFor(() =>
      expect(previewMock.mock.lastCall?.[0]).toMatchObject({
        cash: { trackedCashToUse: 2000 },
      }),
    );
  });

  it("takes cash not yet recorded in the account it would arrive in", async () => {
    accountsRef.current = [account("acc-1", "Brokerage")];
    const user = await renderWorksheet();

    await user.click(
      screen.getByRole("button", { name: "Add cash not yet recorded to Brokerage" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Cash not yet recorded in Brokerage" }),
      "500",
    );

    await waitFor(
      () =>
        expect(previewMock.mock.lastCall?.[0]).toMatchObject({
          cash: { externalContribution: { "acc-1": 500 } },
        }),
      { timeout: 2000 },
    );
  });
});

describe("AllocationWorksheetTab Setup cash (§6)", () => {
  const twoAccounts = {
    ...previewResult,
    observedTrackedCash: 3000,
    recordedCashByAccount: { "acc-1": 2000, "acc-2": 1000 },
  };

  beforeEach(() => {
    acknowledgeDisclosure();
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    heldAccountIds.current = ["acc-1", "acc-2"];
    generateMock.mockReset().mockResolvedValue(calculated);
    previewMock.mockReset().mockResolvedValue(twoAccounts);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const total = () => screen.getByRole("textbox", { name: "Cash to deploy" });
  const fromAccount = (name: string) =>
    screen.getByRole("textbox", { name: `Cash to deploy from ${name}` });

  it("spends a total as the same share of every account's own cash", async () => {
    const user = await renderWorksheet();
    await waitFor(() => expect(total()).toHaveValue("3,000.00"), { timeout: 2000 });

    await user.clear(total());
    await user.type(total(), "1500");

    expect(fromAccount("Brokerage")).toHaveValue("1,000.00");
    expect(fromAccount("Retirement")).toHaveValue("500.00");
    // The matching preset says which share applies.
    expect(screen.getByRole("button", { name: "50%" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(
      () =>
        expect(previewMock.mock.lastCall?.[0]).toMatchObject({
          cash: {
            trackedCashToUse: 1500,
            trackedCashByAccount: { "acc-1": 1000, "acc-2": 500 },
          },
        }),
      { timeout: 2000 },
    );
  });

  it("adds up amounts set per account into the total, and takes a total back with Undo", async () => {
    const user = await renderWorksheet();
    await waitFor(() => expect(fromAccount("Retirement")).toHaveValue("1,000.00"), {
      timeout: 2000,
    });

    await user.clear(fromAccount("Retirement"));
    await user.type(fromAccount("Retirement"), "200");
    await user.tab();

    expect(total()).toHaveValue("2,200.00");
    expect(screen.getByText("Set per account.")).toBeInTheDocument();

    // A total goes back to one share of every account, and says what it replaced.
    await user.click(screen.getByRole("button", { name: "50%" }));
    expect(fromAccount("Retirement")).toHaveValue("500.00");
    expect(screen.getByText("Per-account amounts replaced.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(fromAccount("Retirement")).toHaveValue("200.00");
    expect(total()).toHaveValue("2,200.00");
  });

  it("meets an account's amount with what it records, and says where the rest goes", async () => {
    const user = await renderWorksheet();
    await waitFor(() => expect(fromAccount("Retirement")).toHaveValue("1,000.00"), {
      timeout: 2000,
    });

    await user.clear(fromAccount("Retirement"));
    await user.type(fromAccount("Retirement"), "5000");
    expect(screen.getByText(/Enter the rest as cash not yet recorded/)).toBeInTheDocument();
    await user.tab();

    expect(fromAccount("Retirement")).toHaveValue("1,000.00");
    expect(total()).toHaveValue("3,000.00");
  });

  it("keeps the cash a preview read when an edit overtook it", async () => {
    const answers: ((result: AllocationWorksheetResult) => void)[] = [];
    previewMock.mockImplementation(
      () => new Promise<AllocationWorksheetResult>((resolve) => answers.push(resolve)),
    );
    const user = await renderWorksheet();
    await waitFor(() => expect(previewMock).toHaveBeenCalledTimes(1), { timeout: 2000 });

    // Leaving an account out sends a new preview before the first one answers.
    await user.click(screen.getByRole("checkbox", { name: "Include Retirement" }));
    await waitFor(() => expect(previewMock).toHaveBeenCalledTimes(2), { timeout: 2000 });

    // What the accounts record does not depend on the edit: the first answer
    // already says it.
    answers[0]?.(twoAccounts);
    await waitFor(() => expect(total()).toHaveValue("2,000.00"));
    expect(screen.getByRole("button", { name: "Next: Adjust positions" })).toBeEnabled();
  });

  it("waits for the accounts' cash before calculating", async () => {
    let answerPreview: (result: AllocationWorksheetResult) => void = () => undefined;
    previewMock.mockImplementation(
      () => new Promise<AllocationWorksheetResult>((resolve) => (answerPreview = resolve)),
    );
    await renderWorksheet();
    await waitFor(() => expect(previewMock).toHaveBeenCalled(), { timeout: 2000 });

    expect(screen.getByRole("button", { name: "Next: Adjust positions" })).toBeDisabled();
    expect(screen.getByText("Reading the cash the selected accounts record…")).toBeInTheDocument();

    answerPreview(twoAccounts);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next: Adjust positions" })).toBeEnabled(),
    );
  });

  it("shows no cash for an account the plan may not change", async () => {
    const user = await renderWorksheet();
    await waitFor(() => expect(fromAccount("Retirement")).toBeInTheDocument(), { timeout: 2000 });

    await user.click(screen.getByRole("checkbox", { name: "Include Retirement" }));

    expect(screen.queryByRole("textbox", { name: "Cash to deploy from Retirement" })).toBeNull();
    expect(total()).toHaveValue("2,000.00");
  });

  it("reads a newly ticked account's cash while a line still needs an account", async () => {
    accountsRef.current = [
      account("acc-1", "Brokerage"),
      account("acc-2", "Retirement"),
      account("acc-3", "Joint"),
    ];
    heldAccountIds.current = ["acc-1", "acc-2"];
    const user = await renderWorksheet();
    await user.click(screen.getByRole("checkbox", { name: "Include Joint" }));
    await calculateFromTarget(user);
    // VTI waits for an account, so the worksheet cannot be previewed.
    expect(screen.getByRole("button", { name: "Choose accounts" })).toBeInTheDocument();

    await goTo(user, "Setup");
    previewMock.mockClear();
    previewMock.mockResolvedValue({
      ...twoAccounts,
      recordedCashByAccount: { ...twoAccounts.recordedCashByAccount, "acc-3": 400 },
    });
    await user.click(screen.getByRole("checkbox", { name: "Include Joint" }));

    // The same preview, without lines or cash, reads what Joint records.
    await waitFor(() => expect(fromAccount("Joint")).toHaveValue("400.00"), { timeout: 2000 });
    expect(previewMock.mock.lastCall?.[0]).toMatchObject({
      lines: [],
      cash: { trackedCashToUse: 0, externalContribution: {} },
      selectedAccountIds: ["acc-1", "acc-2", "acc-3"],
    });
  });
});

describe("AllocationWorksheetTab Amounts panel", () => {
  // VBIAX is a 60/40 fund: 60% US equity, 40% Bonds.
  const securities = [
    { id: "vti", symbol: "VTI", value: 900, classes: [["us", "US equity", 900]] },
    {
      id: "vbiax",
      symbol: "VBIAX",
      value: 600,
      classes: [
        ["us", "US equity", 360],
        ["bond", "Bonds", 240],
      ],
    },
    { id: "bnd", symbol: "BND", value: 300, classes: [["bond", "Bonds", 300]] },
    { id: "iau", symbol: "IAU", value: 200, classes: [["gold", "Gold", 200]] },
  ] as const;

  const classes = [
    { categoryId: "us", categoryName: "US equity", currentBps: 6300, targetBps: 6000 },
    { categoryId: "bond", categoryName: "Bonds", currentBps: 2700, targetBps: 3000 },
    { categoryId: "gold", categoryName: "Gold", currentBps: 1000, targetBps: 1000 },
  ];

  const report = {
    ...driftReport,
    totalValue: 2000,
    rows: classes.map((row) => ({
      ...row,
      color: "",
      driftBps: row.currentBps - row.targetBps,
      currentValue: row.currentBps / 5,
      targetValue: row.targetBps / 5,
      valueDelta: 0,
      effectiveBandBps: 500,
      status: "in_band",
      isRequired: false,
      isZeroCurrent: false,
      isCash: false,
    })),
    holdings: {
      targetId: profile.id,
      totalValue: 2000,
      baseCurrency: "USD",
      rows: securities.flatMap((security) =>
        security.classes.map(([categoryId, categoryName, value]) => ({
          id: `${security.id}-${categoryId}`,
          holdingId: security.id,
          assetId: security.id,
          accountId: "acc-1",
          symbol: security.symbol,
          name: security.symbol,
          categoryId,
          categoryName,
          value,
          currentPct: value / 20,
          isUnknownCategory: false,
          isCash: false,
        })),
      ),
    },
  } as DriftReport;

  const preview: AllocationWorksheetResult = {
    ...previewResult,
    categories: classes.map((row) => ({
      ...row,
      color: "",
      currentValue: row.currentBps / 5,
      projectedValue: row.currentBps / 5,
      projectedBps: row.currentBps,
      currentDifferenceBps: row.currentBps - row.targetBps,
      projectedDifferenceBps: row.currentBps - row.targetBps,
      isCash: false,
      isUnclassified: false,
    })) as AllocationWorksheetResult["categories"],
  };

  const rowOrder = () =>
    [...document.querySelectorAll("[data-amounts-row]")].map((row) =>
      row.getAttribute("data-amounts-row"),
    );
  const row = (assetId: string) =>
    document.querySelector<HTMLElement>(`[data-amounts-row="${assetId}"]`)!;
  const railClass = (categoryId: string) =>
    document.querySelector<HTMLElement>(`[data-impact-class="${categoryId}"]`)!;
  /** Rows out of the collapsed group: those above its counted line. */
  const rowsAboveLine = () => {
    const ids: string[] = [];
    for (const element of document.querySelectorAll("[data-amounts-row], [data-collapsed-rows]")) {
      if (element.hasAttribute("data-collapsed-rows")) break;
      ids.push(element.getAttribute("data-amounts-row")!);
    }
    return ids;
  };
  const collapsedLine = () => document.querySelector<HTMLElement>("[data-collapsed-rows]")!;

  beforeEach(() => {
    acknowledgeDisclosure();
    accountsRef.current = [account("acc-1", "Brokerage")];
    holdingsRef.current = {
      "acc-1": securities.map(
        (security) =>
          ({
            id: `acc-1-${security.id}`,
            accountId: "acc-1",
            holdingType: HoldingType.SECURITY,
            instrument: {
              id: security.id,
              symbol: security.symbol,
              name: security.symbol,
              currency: "USD",
            },
            quantity: 10,
            marketValue: { local: security.value, base: security.value },
          }) as Holding,
      ),
    };
    generateMock.mockReset();
    previewMock.mockReset().mockResolvedValue(preview);
    useAccountsMock.mockClear();
  });

  afterEach(() => {
    holdingsRef.current = null;
    vi.unstubAllGlobals();
  });

  it("opens the whole list while nothing is decided, behind a line that can fold it", async () => {
    const user = await renderWorksheet(report);
    await goTo(user, "Adjust positions");

    expect(collapsedLine()).toHaveTextContent("4 securities with no adjustment");
    expect(collapsedLine()).toHaveTextContent("$2,000.00");
    // Below the line, in the list's own order.
    expect(rowsAboveLine()).toEqual([]);
    expect(rowOrder()).toEqual(["vti", "vbiax", "bnd", "iau"]);

    await user.click(collapsedLine());
    expect(rowOrder()).toEqual([]);
  });

  it("brings a typed row out at once, keeps its focus, and keeps it out until the list is left", async () => {
    const user = await renderWorksheet(report);
    await goTo(user, "Adjust positions");

    await user.type(screen.getByLabelText("Adjustment for BND"), "100");
    // Moved out of the group while typing, without losing a keystroke.
    expect(rowsAboveLine()).toEqual(["bnd"]);
    expect(screen.getByLabelText("Adjustment for BND")).toHaveValue("100");
    expect(screen.getByLabelText("Adjustment for BND")).toHaveFocus();

    // Cleared back to zero: it stays under the cursor for this visit.
    await user.clear(screen.getByLabelText("Adjustment for BND"));
    expect(rowsAboveLine()).toEqual(["bnd"]);

    await goTo(user, "Review");
    await goTo(user, "Adjust positions");
    expect(rowsAboveLine()).toEqual([]);
    expect(collapsedLine()).toHaveTextContent("4 securities with no adjustment");
  });

  it("keeps rows open in a class the calculation left an amount unresolved in", async () => {
    generateMock.mockResolvedValue({
      ...calculated,
      adjustments: [{ ...calculated.adjustments[0], lineId: "calc:vti", accountId: "acc-1" }],
      unresolved: [
        { categoryId: "gold", categoryName: "Gold", amount: 50, reason: "no_eligible_security" },
      ],
    });
    const user = await renderWorksheet(report);

    await calculateFromTarget(user);

    // VTI has a change; IAU has none but is how the Gold amount gets resolved.
    expect(rowOrder()).toEqual(["vti", "iau"]);
    expect(collapsedLine()).toHaveTextContent("2 securities with no adjustment");
    expect(railClass("gold")).toHaveTextContent(
      "+$50.00 unresolved: no eligible security selected",
    );
  });

  it("puts each step's one way forward under the impact summary", async () => {
    const user = await renderWorksheet(report);
    await goTo(user, "Adjust positions");
    const follows = (element: HTMLElement, reference: Element) =>
      Boolean(reference.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
    const summary = () => document.querySelector("[data-impact-class]")!;

    const next = screen.getAllByRole("button", { name: "Next: Review" });
    expect(next).toHaveLength(1);
    expect(follows(next[0], summary())).toBe(true);

    await user.click(next[0]);
    const exportCsv = screen.getAllByRole("button", { name: "Export CSV" });
    expect(exportCsv).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Copy for spreadsheet" })).toHaveLength(1);
    expect(follows(exportCsv[0], summary())).toBe(true);

    await user.click(screen.getByRole("button", { name: "Previous: Adjust positions" }));
    expect(screen.getByRole("button", { name: "Previous: Setup" })).toBeInTheDocument();
  });

  it("opens each step at its top, wherever the last one was left", async () => {
    const startedAt: Element[] = [];
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(function (
      this: HTMLElement,
      options?: boolean | ScrollIntoViewOptions,
    ) {
      if (typeof options === "object" && options.block === "start") startedAt.push(this);
    });
    // The worksheet's top has scrolled out of view.
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: -400,
      bottom: 400,
      left: 0,
      right: 0,
      width: 0,
      height: 800,
    } as DOMRect);
    try {
      const user = await renderWorksheet(report);
      expect(startedAt).toHaveLength(0);

      await user.click(screen.getByRole("button", { name: "Enter adjustments yourself" }));
      await user.click(screen.getByRole("button", { name: "Next: Review" }));

      expect(startedAt).toHaveLength(2);
      expect(startedAt[1]).toContainElement(screen.getByRole("navigation"));
    } finally {
      scroll.mockRestore();
      rect.mockRestore();
    }
  });

  it("never adds or removes a line in a class while a row is pointed at", async () => {
    generateMock.mockResolvedValue({
      ...calculated,
      adjustments: [{ ...calculated.adjustments[0], lineId: "calc:vti", accountId: "acc-1" }],
      unresolved: [
        { categoryId: "gold", categoryName: "Gold", amount: 50, reason: "no_eligible_security" },
      ],
    });
    const user = await renderWorksheet(report);
    await calculateFromTarget(user);
    const detailLines = () =>
      [...document.querySelectorAll("[data-impact-class]")].map(
        (element) => element.querySelectorAll("[data-class-detail]").length,
      );
    const resting = detailLines();
    expect(resting.length).toBeGreaterThan(0);
    expect(resting.every((count) => count === 1)).toBe(true);

    // The pointed row's share fills a line that was already there, and what
    // stays unresolved elsewhere does not hide meanwhile.
    await user.hover(row("vti"));
    await waitFor(() => expect(railClass("us")).toHaveTextContent("VTI:"));
    expect(detailLines()).toEqual(resting);
    expect(railClass("gold")).toHaveTextContent(
      "+$50.00 unresolved: no eligible security selected",
    );

    await user.unhover(row("vti"));
    expect(detailLines()).toEqual(resting);
  });

  it("lights both classes of a mixed fund with how much of each it is", async () => {
    const user = await renderWorksheet(report);
    await goTo(user, "Adjust positions");
    await waitFor(() => expect(previewMock).toHaveBeenCalled(), { timeout: 2000 });

    await user.hover(row("vbiax"));

    expect(railClass("us")).toHaveAttribute("data-emphasis", "lit");
    expect(railClass("bond")).toHaveAttribute("data-emphasis", "lit");
    expect(railClass("gold")).toHaveAttribute("data-emphasis", "dim");
    // 360 of the 1,260 of US equity, and 240 of the 540 of Bonds.
    await waitFor(() => expect(railClass("us")).toHaveTextContent("VBIAX: 29% of US equity"));
    expect(railClass("bond")).toHaveTextContent("VBIAX: 44% of Bonds");

    // Once it changes, each class shows where the fund's share goes and the
    // part of the change that lands there.
    await user.type(screen.getByLabelText("Adjustment for VBIAX"), "1200");
    await user.hover(row("vbiax"));
    expect(railClass("us")).toHaveTextContent(/VBIAX: 29% → \d+% of US equity/);
    expect(railClass("us")).toHaveTextContent("+$720.00");
    expect(railClass("bond")).toHaveTextContent("+$480.00");

    await user.unhover(row("vbiax"));
    expect(railClass("gold")).toHaveAttribute("data-emphasis", "none");
  });

  it("steps a row one unit at a time, with the price in view", async () => {
    const user = await renderWorksheet(report);
    await goTo(user, "Adjust positions");
    // BND: 10 units recorded at 300, so 30 a unit.
    expect(row("bnd")).toHaveTextContent("$30.00 per unit");

    await user.click(within(row("bnd")).getByRole("button", { name: "Add one unit of BND" }));
    await user.click(within(row("bnd")).getByRole("button", { name: "Add one unit of BND" }));
    // The amount moves; the units it comes to follow.
    expect(screen.getByLabelText("Adjustment for BND")).toHaveValue("60.00");
    expect(row("bnd")).toHaveTextContent("≈ 2 units at $30.00");

    await user.click(within(row("bnd")).getByRole("button", { name: "Remove one unit of BND" }));
    expect(screen.getByLabelText("Adjustment for BND")).toHaveValue("30.00");
    expect(row("bnd")).toHaveTextContent("≈ 1 unit at $30.00");
  });

  it("empties a position in one go from a worded action, not an icon", async () => {
    const user = await renderWorksheet(report);
    await user.click(screen.getByRole("checkbox", { name: "Rebalance" }));
    await goTo(user, "Adjust positions");

    // Offered on the row being worked on, not on every row.
    expect(
      within(row("vti")).queryByRole("button", { name: "Reduce to zero" }),
    ).not.toBeInTheDocument();
    // Selecting the row, as a tap does, offers it.
    await user.click(row("vti"));
    await user.click(within(row("vti")).getByRole("button", { name: "Reduce to zero" }));

    expect(screen.getByLabelText("Adjustment for VTI")).toHaveValue("-900.00");
    expect(within(row("vti")).getByRole("button", { name: "Reduce to zero" })).toBeDisabled();
  });

  it("reduces nothing while investing cash only, by hand included", async () => {
    const user = await renderWorksheet(report);
    await goTo(user, "Adjust positions");

    await user.click(row("vti"));
    expect(
      within(row("vti")).queryByRole("button", { name: "Reduce to zero" }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Adjustment for VTI"), "-100");

    expect(
      await screen.findByText(/VTI is reduced, but Invest cash only adds/),
    ).toBeInTheDocument();
  });

  it("names the marks on the class tracks", async () => {
    const user = await renderWorksheet(report);
    await goTo(user, "Adjust positions");

    const legend = document.querySelector<HTMLElement>("[data-track-legend]")!;
    expect(legend).toHaveTextContent("Current → Projected");
    expect(legend).toHaveTextContent("Target");
    // The range no longer moves the calculation, so it is not drawn.
    expect(legend).not.toHaveTextContent("Range");
  });

  it("lights the rows touching a class, and says how many sit in the collapsed group", async () => {
    const user = await renderWorksheet(report);
    await goTo(user, "Adjust positions");

    await user.hover(railClass("bond"));
    expect(collapsedLine()).toHaveTextContent("2 of them touch Bonds");
    expect(row("vbiax")).toHaveAttribute("data-emphasis", "lit");
    expect(row("bnd")).toHaveAttribute("data-emphasis", "lit");
    expect(row("vti")).toHaveAttribute("data-emphasis", "dim");
    // A 60/40 fund shows it is only partly in Bonds; a pure bond fund does not.
    expect(within(row("vbiax")).getByText("40%")).toBeInTheDocument();
    expect(within(row("bnd")).queryByText("100%")).not.toBeInTheDocument();
  });

  it("keeps a selection without filtering or reordering the list", async () => {
    const user = await renderWorksheet(report);
    await goTo(user, "Adjust positions");
    const order = rowOrder();

    await user.click(within(row("vbiax")).getAllByText("VBIAX")[0]);
    expect(row("vbiax")).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("Selected:")).toHaveTextContent("Selected: VBIAX");
    expect(rowOrder()).toEqual(order);

    // Pointing at a class previews it; the selection waits underneath.
    await user.hover(railClass("gold"));
    expect(row("iau")).toHaveAttribute("data-emphasis", "lit");
    await user.unhover(railClass("gold"));
    expect(row("vbiax")).toHaveAttribute("data-emphasis", "active");
    expect(railClass("bond")).toHaveAttribute("data-emphasis", "lit");

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(row("vbiax")).not.toHaveAttribute("aria-current");
    expect(rowOrder()).toEqual(order);
  });

  it("selects the row when its amount field is tapped", async () => {
    const user = await renderWorksheet(report);
    await goTo(user, "Adjust positions");

    await user.pointer({ keys: "[TouchA]", target: screen.getByLabelText("Adjustment for BND") });

    expect(row("bnd")).toHaveAttribute("aria-current", "true");
  });

  it("shows the weight a changed row reaches against the planning total", async () => {
    const user = await renderWorksheet(report);
    await goTo(user, "Adjust positions");
    expect(row("bnd")).toHaveTextContent("15.0%");

    await user.type(screen.getByLabelText("Adjustment for BND"), "100");

    // 400 of 2,000 held plus the 2,000 of cash the accounts record.
    await waitFor(() => expect(row("bnd")).toHaveTextContent("15.0 → 10.0%"));
  });

  it("states the preview's warnings on the row whose line they are about", async () => {
    previewMock.mockResolvedValue({
      ...preview,
      lines: [{ lineId: "position:bnd:acc-1:increase", assetId: "bnd" }],
      warnings: [
        {
          id: "w1",
          kind: "stale_quote",
          lineId: "position:bnd:acc-1:increase",
          message: "BND is priced from a quote dated 3 Sep.",
          acknowledgementRequired: false,
        },
      ],
    } as unknown as AllocationWorksheetResult);
    const user = await renderWorksheet(report);
    await goTo(user, "Adjust positions");

    await user.type(screen.getByLabelText("Adjustment for BND"), "100");

    const status = await within(row("bnd")).findByText("1 warning", {}, { timeout: 2000 });
    expect(status).toHaveAttribute("title", "BND is priced from a quote dated 3 Sep.");
    expect(within(row("vti")).queryByText(/warning/)).not.toBeInTheDocument();
  });

  it("does not render the worksheet again while pointing", async () => {
    const user = await renderWorksheet(report);
    await goTo(user, "Adjust positions");
    // Let the previews settle first: the first one reports the cash the
    // accounts record, which starts a second one a debounce later.
    await waitFor(() => expect(previewMock).toHaveBeenCalled(), { timeout: 2000 });
    await waitFor(() => expect(screen.queryByText("Updating…")).not.toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 700));
    await waitFor(() => expect(screen.queryByText("Updating…")).not.toBeInTheDocument());
    const renders = useAccountsMock.mock.calls.length;

    await user.hover(row("vbiax"));
    expect(railClass("bond")).toHaveAttribute("data-emphasis", "lit");
    await user.hover(railClass("gold"));
    expect(row("iau")).toHaveAttribute("data-emphasis", "lit");
    await user.unhover(railClass("gold"));

    expect(row("vbiax")).toHaveAttribute("data-emphasis", "none");
    expect(useAccountsMock.mock.calls.length).toBe(renders);
  });
});

describe("AllocationWorksheetTab Setup", () => {
  // VTI is US equity, above its target; BND is Bonds, below it.
  const holding = (assetId: string, symbol: string, value: number): Holding =>
    ({
      id: `acc-1-${assetId}`,
      accountId: "acc-1",
      holdingType: HoldingType.SECURITY,
      instrument: { id: assetId, symbol, name: symbol, currency: "USD" },
      quantity: 10,
      marketValue: { local: value, base: value },
    }) as Holding;

  const classes = [
    { categoryId: "us", categoryName: "US equity", currentBps: 7000, targetBps: 6000, delta: 300 },
    { categoryId: "bond", categoryName: "Bonds", currentBps: 3000, targetBps: 4000, delta: -300 },
  ];

  const report = {
    ...driftReport,
    rows: classes.map(({ delta, ...row }) => ({
      ...row,
      color: "",
      driftBps: row.currentBps - row.targetBps,
      currentValue: row.currentBps / 10,
      targetValue: row.targetBps / 10,
      valueDelta: delta,
      effectiveBandBps: 500,
      status: delta > 0 ? "overweight" : "underweight",
      isRequired: false,
      isZeroCurrent: false,
      isCash: false,
    })),
    holdings: {
      targetId: profile.id,
      totalValue: 3000,
      baseCurrency: "USD",
      rows: [
        ["vti", "VTI", "us", "US equity", 2100],
        ["bnd", "BND", "bond", "Bonds", 900],
      ].map(([assetId, symbol, categoryId, categoryName, value]) => ({
        id: `${assetId}-${categoryId}`,
        holdingId: assetId,
        assetId,
        accountId: "acc-1",
        symbol,
        name: symbol,
        categoryId,
        categoryName,
        value,
        currentPct: Number(value) / 30,
        isUnknownCategory: false,
        isCash: false,
      })),
    },
  } as DriftReport;

  const gapNote = (categoryId: string) =>
    document.querySelector<HTMLElement>(`[data-gap-category="${categoryId}"]`)!;
  /** The securities card starts folded to what applies to this run. */
  const openSecurities = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("button", { name: "Change" }));
  const neverReduced = (subjectType: "asset" | "account", subjectId: string) =>
    ({
      id: `${subjectType}-${subjectId}`,
      targetId: profile.id,
      subjectType,
      subjectId,
      action: "sell",
      effect: "block",
      createdAt: "",
      updatedAt: "",
    }) as AllocationTargetConstraint;

  beforeEach(() => {
    acknowledgeDisclosure();
    accountsRef.current = [account("acc-1", "Brokerage")];
    holdingsRef.current = { "acc-1": [holding("vti", "VTI", 2100), holding("bnd", "BND", 900)] };
    generateMock.mockReset().mockResolvedValue(calculated);
    previewMock.mockReset().mockResolvedValue(previewResult);
  });

  afterEach(() => {
    holdingsRef.current = null;
    constraintsRef.current = [];
    vi.unstubAllGlobals();
  });

  it("moves an account taken out of the worksheet below the ones in it", async () => {
    accountsRef.current = [
      account("acc-1", "Brokerage"),
      account("acc-2", "Retirement"),
      account("acc-3", "Joint"),
    ];
    const user = await renderWorksheet(report);
    const order = () =>
      [...document.querySelectorAll("[data-worksheet-account]")].map((row) =>
        row.getAttribute("data-worksheet-account"),
      );
    expect(order()).toEqual(["acc-1", "acc-2", "acc-3"]);

    await user.click(screen.getByRole("checkbox", { name: "Include Brokerage" }));

    expect(order()).toEqual(["acc-2", "acc-3", "acc-1"]);
    const leftOut = screen.getByRole("group", { name: "Left out · 1" });
    expect(within(leftOut).getByRole("checkbox", { name: "Include Brokerage" })).not.toBeChecked();

    await user.click(within(leftOut).getByRole("button", { name: "Add all back" }));
    expect(order()).toEqual(["acc-1", "acc-2", "acc-3"]);
  });

  it("says what each category's gap can reach with the securities as set", async () => {
    const user = await renderWorksheet(report);
    await waitFor(() => expect(gapNote("bond")).toHaveTextContent("Increases BND"));
    // Where it is against its target, and the money signed the way it moves.
    expect(gapNote("bond")).toHaveTextContent(/30\.0%\s*→\s*40\.0%/);
    expect(gapNote("bond")).toHaveTextContent("+$300");
    expect(gapNote("us")).toHaveTextContent("−$300");
    // Coloured as on the allocation page: equity forest, then the palette's next.
    expect(gapNote("us").querySelector("span[style]")).toHaveStyle({
      backgroundColor: "rgb(53, 92, 76)",
    });
    // Adding comes first, then reducing.
    expect(
      [...document.querySelectorAll("[data-gap-category]")].map((row) =>
        row.getAttribute("data-gap-category"),
      ),
    ).toEqual(["bond", "us"]);
    // Invest cash adds to what is below target and leaves the rest.
    expect(gapNote("us")).toHaveTextContent("Not reduced");

    await user.click(screen.getByRole("checkbox", { name: "Rebalance" }));
    expect(gapNote("us")).toHaveTextContent("Reduces VTI");

    await openSecurities(user);
    await user.click(screen.getByRole("checkbox", { name: "Reduce VTI" }));
    expect(gapNote("us")).toHaveTextContent("Nothing to reduce");
    await user.click(screen.getByRole("checkbox", { name: "Increase BND" }));
    expect(gapNote("bond")).toHaveTextContent("Nothing to increase");
  });

  it("keeps a security turned off for reductions out of what Rebalance may reduce", async () => {
    const user = await renderWorksheet(report);
    await user.click(screen.getByRole("checkbox", { name: "Rebalance" }));
    await openSecurities(user);
    const reduceVti = screen.getByRole("checkbox", { name: "Reduce VTI" });
    expect(reduceVti).toBeChecked();

    await user.click(reduceVti);
    expect(reduceVti).not.toBeChecked();
    await calculateFromTarget(user);

    // Increases are a separate choice and stay open to every security.
    expect(generateMock.mock.lastCall?.[0]).toMatchObject({
      mode: "rebalance",
      sellableAssetIds: ["bnd"],
      eligibleAssetIds: undefined,
    });
  });

  it("sends no reductions to limit while investing cash only", async () => {
    const user = await renderWorksheet(report);
    await openSecurities(user);
    // Reductions are a Rebalance choice: the column shows only with it.
    expect(screen.queryByRole("checkbox", { name: "Reduce VTI" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Rebalance" }));
    await user.click(screen.getByRole("checkbox", { name: "Reduce VTI" }));
    await user.click(screen.getByRole("checkbox", { name: "Rebalance" }));
    await calculateFromTarget(user);

    expect(generateMock.mock.lastCall?.[0]).toMatchObject({
      mode: "invest_cash",
      sellableAssetIds: undefined,
    });
  });

  it("lists a fund that spans categories once, under its largest", async () => {
    // VBIAX is 60% US equity, 40% Bonds.
    holdingsRef.current = {
      "acc-1": [holding("vti", "VTI", 2100), holding("vbiax", "VBIAX", 600)],
    };
    const spanning = {
      ...report,
      holdings: {
        ...report.holdings!,
        rows: [
          ...report.holdings!.rows.filter((row) => row.assetId === "vti"),
          ...[
            ["us", "US equity", 360],
            ["bond", "Bonds", 240],
          ].map(([categoryId, categoryName, value]) => ({
            ...report.holdings!.rows[0],
            id: `vbiax-${categoryId}`,
            holdingId: "vbiax",
            assetId: "vbiax",
            symbol: "VBIAX",
            name: "VBIAX",
            categoryId: String(categoryId),
            categoryName: String(categoryName),
            value: Number(value),
          })),
        ],
      },
    } as DriftReport;
    const user = await renderWorksheet(spanning);
    await openSecurities(user);

    const usEquity = await screen.findByRole("group", { name: "US equity" });
    expect(within(usEquity).getByText(/also Bonds/)).toBeInTheDocument();
    // Its Bonds share is below target, so it may still be increased: a switch, not a dash.
    expect(within(usEquity).getByRole("checkbox", { name: "Increase VBIAX" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox", { name: "Increase VBIAX" })).toHaveLength(1);
  });

  it("counts what sits in Unknown as reducible there, as the calculation does", async () => {
    holdingsRef.current = {
      "acc-1": [holding("vti", "VTI", 2100), holding("btc", "BTC", 300)],
    };
    const withUnknown = {
      ...report,
      rows: [
        ...report.rows,
        { ...report.rows[0], categoryId: "__UNKNOWN__", categoryName: "Unknown", valueDelta: 300 },
      ],
      holdings: {
        ...report.holdings!,
        rows: [
          ...report.holdings!.rows,
          {
            ...report.holdings!.rows[0],
            id: "btc-unknown",
            holdingId: "btc",
            assetId: "btc",
            symbol: "BTC",
            name: "BTC",
            categoryId: "__UNKNOWN__",
            categoryName: "Unknown",
            value: 300,
            isUnknownCategory: true,
          },
        ],
      },
    } as DriftReport;
    const user = await renderWorksheet(withUnknown);
    await user.click(screen.getByRole("checkbox", { name: "Rebalance" }));
    await openSecurities(user);

    await waitFor(() => expect(gapNote("__UNKNOWN__")).toHaveTextContent("Reduces BTC"));
    expect(
      within(screen.getByRole("group", { name: "Unknown" })).getByRole("checkbox", {
        name: "Reduce BTC",
      }),
    ).toBeChecked();
  });

  it("shows what the target never reduces instead of offering a switch it ignores", async () => {
    constraintsRef.current = [neverReduced("asset", "vti")];
    const user = await renderWorksheet(report);
    await user.click(screen.getByRole("checkbox", { name: "Rebalance" }));

    // VTI is US equity's only security, so nothing there can be reduced.
    await waitFor(() => expect(gapNote("us")).toHaveTextContent("Nothing to reduce"));
    expect(screen.getByText("Protected on the target: VTI")).toBeInTheDocument();

    await openSecurities(user);
    expect(screen.queryByRole("checkbox", { name: "Reduce VTI" })).not.toBeInTheDocument();
    expect(screen.getByText("Protected on the target: never reduced")).toBeInTheDocument();
    // A rule against reducing leaves increases to the user.
    expect(screen.getByRole("checkbox", { name: "Increase BND" })).toBeChecked();
  });

  it("says on an account's row that the target never reduces its holdings", async () => {
    accountsRef.current = [account("acc-1", "Brokerage"), account("acc-2", "Retirement")];
    constraintsRef.current = [neverReduced("account", "acc-2")];
    await renderWorksheet(report);

    const row = (accountId: string) =>
      document.querySelector<HTMLElement>(`[data-worksheet-account="${accountId}"]`)!;
    await waitFor(() => expect(row("acc-2")).toHaveTextContent("never reduced"));
    expect(row("acc-1")).not.toHaveTextContent("never reduced");
  });

  it("folds the securities to what applies to this run", async () => {
    const user = await renderWorksheet(report);
    await user.click(screen.getByRole("checkbox", { name: "Rebalance" }));
    expect(screen.getByText("Nothing left out this time")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Reduce VTI" })).not.toBeInTheDocument();

    await openSecurities(user);
    await user.click(screen.getByRole("checkbox", { name: "Reduce VTI" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.getByText("Not reduced this time: VTI")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("states what each account records beside its name, whatever share it deploys", async () => {
    const user = await renderWorksheet(report);
    const row = () => document.querySelector<HTMLElement>('[data-worksheet-account="acc-1"]')!;
    const details = () => row().querySelector("label")!;
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Cash to deploy" })).toHaveValue("2,000.00"),
    );
    expect(details()).toHaveTextContent("$2,000.00 recorded");

    await user.click(screen.getByRole("button", { name: "50%" }));

    // The row keeps its shape: the share shows in the field, nothing grows under it.
    expect(details()).toHaveTextContent("$2,000.00 recorded");
    expect(screen.getByRole("textbox", { name: "Cash to deploy from Brokerage" })).toHaveValue(
      "1,000.00",
    );
  });

  it("keeps the deposit field open while the keyboard moves within it", async () => {
    const user = await renderWorksheet(report);
    await user.click(
      screen.getByRole("button", { name: "Add cash not yet recorded to Brokerage" }),
    );
    await user.keyboard("500");
    await user.tab();

    const remove = screen.getByRole("button", { name: "Remove the deposit to Brokerage" });
    expect(remove).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(
      screen.getByRole("button", { name: "Add cash not yet recorded to Brokerage" }),
    ).toHaveFocus();
    expect(screen.queryByText(/deposit$/)).not.toBeInTheDocument();
  });

  it("keeps a security added in Setup through the calculation", async () => {
    const user = await renderWorksheet(report);
    await openSecurities(user);
    await user.type(screen.getByRole("searchbox", { name: "Find or add a security" }), "VXUS");
    await user.click(screen.getByRole("button", { name: "Add VXUS" }));
    expect(
      within(screen.getByRole("group", { name: "Added" })).getByRole("button", {
        name: "Remove VXUS",
      }),
    ).toBeInTheDocument();

    await calculateFromTarget(user);

    // Not held, so the calculation gives it nothing; its amount is the user's to set.
    expect(screen.getByLabelText("Adjustment for VXUS")).toHaveValue("");
  });
});
