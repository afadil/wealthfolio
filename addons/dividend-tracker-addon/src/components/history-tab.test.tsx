// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ActivityDetails, AddonContext } from "@wealthfolio/addon-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import HistoryTab from "./history-tab";

vi.mock("@wealthfolio/ui", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useBalancePrivacy: () => ({ isBalanceHidden: false }),
    formatAmount: (amount: number | string | null, currency: string) =>
      amount == null ? "-" : `${currency}:${Number(amount).toFixed(2)}`,
  };
});

expect.extend(matchers);
afterEach(() => cleanup());

function makeCtx(
  searchResult: { data: ActivityDetails[]; meta?: { totalRowCount: number } } = { data: [] },
): AddonContext {
  const meta = searchResult.meta ?? { totalRowCount: searchResult.data.length };
  return {
    api: {
      activities: {
        search: vi.fn().mockResolvedValue({ data: searchResult.data, meta }),
      },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() },
    },
  } as unknown as AddonContext;
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("HistoryTab", () => {
  it("shows loading state initially", () => {
    const ctx = {
      api: {
        activities: {
          search: vi.fn().mockReturnValue(new Promise(() => {})),
        },
        logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn() },
      },
    } as unknown as AddonContext;

    renderWithQuery(<HistoryTab ctx={ctx} />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows empty state when no dividends found", async () => {
    const ctx = makeCtx({ data: [] });
    renderWithQuery(<HistoryTab ctx={ctx} />);
    expect(await screen.findByText("No dividend activities found.")).toBeInTheDocument();
  });

  it("renders dividend activity rows", async () => {
    const activities: ActivityDetails[] = [
      {
        id: "div-1",
        activityType: "DIVIDEND",
        date: new Date("2025-06-15"),
        quantity: null,
        unitPrice: null,
        amount: "12.50",
        fee: null,
        currency: "USD",
        needsReview: false,
        createdAt: new Date("2025-06-15"),
        updatedAt: new Date("2025-06-15"),
        accountId: "acct1",
        accountName: "Main Brokerage",
        accountCurrency: "USD",
        assetId: "aapl-id",
        assetSymbol: "AAPL",
        subtype: "REGULAR",
      } as ActivityDetails,
      {
        id: "div-2",
        activityType: "DIVIDEND",
        date: new Date("2025-03-10"),
        quantity: null,
        unitPrice: null,
        amount: "8.75",
        fee: null,
        currency: "CAD",
        needsReview: false,
        createdAt: new Date("2025-03-10"),
        updatedAt: new Date("2025-03-10"),
        accountId: "acct2",
        accountName: "TFSA",
        accountCurrency: "CAD",
        assetId: "ry-id",
        assetSymbol: "RY",
        subtype: null,
      } as ActivityDetails,
    ];

    const ctx = makeCtx({ data: activities });
    renderWithQuery(<HistoryTab ctx={ctx} />);

    // Wait for data to render
    expect(await screen.findByText("AAPL")).toBeInTheDocument();
    expect(screen.getByText("RY")).toBeInTheDocument();

    // Check accounts
    expect(screen.getByText("Main Brokerage")).toBeInTheDocument();
    expect(screen.getByText("TFSA")).toBeInTheDocument();

    // Check amounts (formatted via mocked formatAmount: "CURRENCY:amount")
    // Each amount appears twice: once in the data row and once in the per-currency total row
    expect(screen.getAllByText("USD:12.50").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("CAD:8.75").length).toBeGreaterThanOrEqual(1);

    // Check subtype: "REGULAR" badge and "—" for null
    expect(screen.getByText("REGULAR")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("calls search with correct parameters", async () => {
    const ctx = makeCtx({ data: [] });
    renderWithQuery(<HistoryTab ctx={ctx} />);

    await screen.findByText("No dividend activities found.");

    expect(ctx.api.activities.search).toHaveBeenCalledWith(
      0,
      200,
      { activityTypes: ["DIVIDEND"] },
      "",
      { id: "date", desc: true },
    );
  });

  it("shows truncation warning when more activities exist than page size", async () => {
    const ctx = makeCtx({ data: [], meta: { totalRowCount: 350 } });
    // Override search to return some data so we don't hit empty state
    const activities: ActivityDetails[] = [
      {
        id: "div-1",
        activityType: "DIVIDEND",
        date: new Date("2025-06-15"),
        quantity: null,
        unitPrice: null,
        amount: "10.00",
        fee: null,
        currency: "USD",
        needsReview: false,
        createdAt: new Date("2025-06-15"),
        updatedAt: new Date("2025-06-15"),
        accountId: "acct1",
        accountName: "Main Brokerage",
        accountCurrency: "USD",
        assetId: "aapl-id",
        assetSymbol: "AAPL",
        subtype: null,
      } as ActivityDetails,
    ];
    const ctxWithMore = makeCtx({ data: activities, meta: { totalRowCount: 350 } });
    renderWithQuery(<HistoryTab ctx={ctxWithMore} />);

    expect(await screen.findByText(/Showing 200 of 350/)).toBeInTheDocument();
  });

  it("renders sortable column header buttons", async () => {
    const activities: ActivityDetails[] = [
      {
        id: "div-1",
        activityType: "DIVIDEND",
        date: new Date("2025-06-15"),
        quantity: null,
        unitPrice: null,
        amount: "12.50",
        fee: null,
        currency: "USD",
        needsReview: false,
        createdAt: new Date("2025-06-15"),
        updatedAt: new Date("2025-06-15"),
        accountId: "acct1",
        accountName: "Main Brokerage",
        accountCurrency: "USD",
        assetId: "aapl-id",
        assetSymbol: "AAPL",
        subtype: null,
      } as ActivityDetails,
    ];

    const ctx = makeCtx({ data: activities });
    renderWithQuery(<HistoryTab ctx={ctx} />);

    await screen.findByText("AAPL");

    // All four sortable headers should be buttons
    expect(screen.getByRole("button", { name: /Date/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Symbol/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Account/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Amount/ })).toBeInTheDocument();
  });

  it("clicking a sort button reverses sort direction on second click", async () => {
    const activities: ActivityDetails[] = [
      {
        id: "div-1",
        activityType: "DIVIDEND",
        date: new Date("2025-06-15"),
        quantity: null,
        unitPrice: null,
        amount: "5.00",
        fee: null,
        currency: "USD",
        needsReview: false,
        createdAt: new Date("2025-06-15"),
        updatedAt: new Date("2025-06-15"),
        accountId: "acct1",
        accountName: "Alpha",
        accountCurrency: "USD",
        assetId: "a-id",
        assetSymbol: "AAPL",
        subtype: null,
      } as ActivityDetails,
      {
        id: "div-2",
        activityType: "DIVIDEND",
        date: new Date("2025-03-10"),
        quantity: null,
        unitPrice: null,
        amount: "20.00",
        fee: null,
        currency: "USD",
        needsReview: false,
        createdAt: new Date("2025-03-10"),
        updatedAt: new Date("2025-03-10"),
        accountId: "acct1",
        accountName: "Alpha",
        accountCurrency: "USD",
        assetId: "b-id",
        assetSymbol: "MSFT",
        subtype: null,
      } as ActivityDetails,
    ];

    const ctx = makeCtx({ data: activities });
    renderWithQuery(<HistoryTab ctx={ctx} />);
    await screen.findByText("AAPL");

    const amountBtn = screen.getByRole("button", { name: /Amount/ });

    // First click: sort by amount asc → AAPL ($5.00) before MSFT ($20.00)
    fireEvent.click(amountBtn);
    const rowsAsc = screen.getAllByRole("row");
    expect(rowsAsc[1].textContent).toContain("AAPL");
    expect(rowsAsc[2].textContent).toContain("MSFT");

    // Second click: sort by amount desc → MSFT ($20.00) before AAPL ($5.00)
    fireEvent.click(amountBtn);
    const rowsDesc = screen.getAllByRole("row");
    expect(rowsDesc[1].textContent).toContain("MSFT");
    expect(rowsDesc[2].textContent).toContain("AAPL");
  });

  it("shows per-currency total rows", async () => {
    const activities: ActivityDetails[] = [
      {
        id: "div-1",
        activityType: "DIVIDEND",
        date: new Date("2025-06-15"),
        quantity: null,
        unitPrice: null,
        amount: "10.00",
        fee: null,
        currency: "USD",
        needsReview: false,
        createdAt: new Date("2025-06-15"),
        updatedAt: new Date("2025-06-15"),
        accountId: "acct1",
        accountName: "Main Brokerage",
        accountCurrency: "USD",
        assetId: "a-id",
        assetSymbol: "AAPL",
        subtype: null,
      } as ActivityDetails,
      {
        id: "div-2",
        activityType: "DIVIDEND",
        date: new Date("2025-03-10"),
        quantity: null,
        unitPrice: null,
        amount: "5.00",
        fee: null,
        currency: "USD",
        needsReview: false,
        createdAt: new Date("2025-03-10"),
        updatedAt: new Date("2025-03-10"),
        accountId: "acct1",
        accountName: "Main Brokerage",
        accountCurrency: "USD",
        assetId: "b-id",
        assetSymbol: "MSFT",
        subtype: null,
      } as ActivityDetails,
    ];

    const ctx = makeCtx({ data: activities });
    renderWithQuery(<HistoryTab ctx={ctx} />);

    await screen.findByText("AAPL");

    // Total label and formatted sum (10 + 5 = 15)
    expect(screen.getByText("USD total")).toBeInTheDocument();
    expect(screen.getByText("USD:15.00")).toBeInTheDocument();
  });

  it("renders account filter select", async () => {
    const activities: ActivityDetails[] = [
      {
        id: "div-1",
        activityType: "DIVIDEND",
        date: new Date("2025-06-15"),
        quantity: null,
        unitPrice: null,
        amount: "10.00",
        fee: null,
        currency: "USD",
        needsReview: false,
        createdAt: new Date("2025-06-15"),
        updatedAt: new Date("2025-06-15"),
        accountId: "acct1",
        accountName: "Main Brokerage",
        accountCurrency: "USD",
        assetId: "a-id",
        assetSymbol: "AAPL",
        subtype: null,
      } as ActivityDetails,
    ];

    const ctx = makeCtx({ data: activities });
    renderWithQuery(<HistoryTab ctx={ctx} />);

    await screen.findByText("AAPL");

    // Radix Select renders a button with role="combobox"
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
