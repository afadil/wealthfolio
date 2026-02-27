// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup, render, screen } from "@testing-library/react";
import type { ActivityDetails, AddonContext } from "@wealthfolio/addon-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import HistoryTab from "./history-tab";

expect.extend(matchers);
afterEach(() => cleanup());

function makeCtx(searchResult: { data: ActivityDetails[] } = { data: [] }): AddonContext {
  return {
    api: {
      activities: {
        search: vi.fn().mockResolvedValue(searchResult),
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

    // Check amounts
    expect(screen.getByText("12.50")).toBeInTheDocument();
    expect(screen.getByText("8.75")).toBeInTheDocument();

    // Check currencies
    expect(screen.getByText("USD")).toBeInTheDocument();
    expect(screen.getByText("CAD")).toBeInTheDocument();

    // Check subtype: "REGULAR" and "—" for null
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
});
