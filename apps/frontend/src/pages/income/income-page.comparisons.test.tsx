import type { IncomeSummary } from "@/lib/types";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IncomePage from "./income-page";

const mocks = vi.hoisted(() => ({ useQuery: vi.fn() }));

vi.mock("@/adapters", () => ({ getIncomeSummary: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("./income-history-chart", () => ({ IncomeHistoryChart: () => null }));
vi.mock("@/components/account-filter-selector", () => ({ AccountScopeSelector: () => null }));
vi.mock("@/hooks/use-balance-privacy", () => ({
  useBalancePrivacy: () => ({ isBalanceHidden: false }),
}));

function summary(
  period: string,
  byMonth: Record<string, number>,
  monthlyAverage: number,
  yoyGrowth: number | null,
): IncomeSummary {
  const totalIncome = Object.values(byMonth).reduce((sum, amount) => sum + amount, 0);
  return {
    period,
    byMonth,
    byType: { DIVIDEND: totalIncome },
    byAsset: {},
    byCurrency: { USD: totalIncome },
    byCurrencyBase: { USD: totalIncome },
    byAccount: {},
    totalIncome,
    currency: "USD",
    monthlyAverage,
    yoyGrowth,
    unconvertedCurrencies: [],
  };
}

// As the server returns them in October 2026: 110 in May 2025 (the first
// activity) and 2,500 in June 2026.
const firstIncomeLastYear = [
  summary("ALL", { "2025-05": 110, "2026-06": 2500 }, 2610 / 17, null),
  summary("YTD", { "2026-06": 2500 }, 250, 21.73),
  summary("LAST_YEAR", { "2025-05": 110 }, 13.75, null),
  summary("TWO_YEARS_AGO", {}, 0, null),
];

async function renderPeriod(summaries: IncomeSummary[], period?: "Year to Date" | "Last Year") {
  mocks.useQuery.mockReturnValue({ data: summaries, isLoading: false, error: null });
  render(<IncomePage />);
  if (period) {
    // The desktop and mobile toolbars each have a period selector.
    await userEvent.click(screen.getAllByRole("button", { name: period })[0]);
  }
}

describe("IncomePage comparisons", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows no change when last year had no income", async () => {
    await renderPeriod(
      [
        summary("ALL", { "2026-06": 2500 }, 625, null),
        summary("YTD", { "2026-06": 2500 }, 250, null),
        summary("LAST_YEAR", {}, 0, null),
        summary("TWO_YEARS_AGO", {}, 0, null),
      ],
      "Year to Date",
    );

    expect(screen.getAllByText("No comparison with last year")).toHaveLength(2);
    expect(screen.queryByText("Year-over-year growth")).not.toBeInTheDocument();
    expect(screen.queryByText("Since last period")).not.toBeInTheDocument();
  });

  it("shows no change when the year before had no income", async () => {
    await renderPeriod(firstIncomeLastYear, "Last Year");

    expect(screen.getAllByText("No comparison with the year before")).toHaveLength(2);
    expect(screen.queryByText("Since last period")).not.toBeInTheDocument();
  });

  it("shows no change when the year before's only income had no exchange rate", async () => {
    await renderPeriod(
      [
        ...firstIncomeLastYear.slice(0, 2),
        {
          ...summary("LAST_YEAR", { "2025-05": 110 }, 13.75, null),
          unconvertedCurrencies: ["CHF"],
        },
        { ...summary("TWO_YEARS_AGO", {}, 0, null), byCurrency: { CHF: 300 } },
      ],
      "Last Year",
    );

    expect(
      screen.getByText(
        "Income in CHF is left out of the totals because there is no exchange rate to USD.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("No comparison with the year before")).toHaveLength(2);
  });

  it("shows no monthly change when last year's average rounds to zero", async () => {
    await renderPeriod(
      [
        summary("ALL", { "2025-05": 0.01, "2026-06": 2500 }, 147.06, null),
        summary("YTD", { "2026-06": 2500 }, 250, 249999),
        summary("LAST_YEAR", { "2025-05": 0.01 }, 0, null),
        summary("TWO_YEARS_AGO", {}, 0, null),
      ],
      "Year to Date",
    );

    // The totals still compare: 2,500 against 0.01.
    expect(screen.getByText("Year-over-year growth")).toBeInTheDocument();
    expect(screen.getAllByText("No comparison with last year")).toHaveLength(1);
    expect(screen.queryByText("Since last period")).not.toBeInTheDocument();
  });

  it("compares the monthly average with last year's, whichever months had income", async () => {
    await renderPeriod(firstIncomeLastYear, "Year to Date");

    // 250 a month against 13.75.
    expect(screen.getByText("+1,718.18%")).toBeInTheDocument();
    expect(screen.getByText("Since last period")).toBeInTheDocument();
  });

  it("compares quarterly income with the previous period's monthly average", async () => {
    const quarterly = { "03": 300, "06": 300, "09": 300 };
    const months = (year: string, amounts: Record<string, number>) =>
      Object.fromEntries(
        Object.entries(amounts).map(([month, amount]) => [`${year}-${month}`, amount]),
      );
    const lastYear = months("2025", { ...quarterly, "12": 300 });
    const thisYear = months("2026", quarterly);

    await renderPeriod(
      [
        summary("ALL", { ...lastYear, ...thisYear }, 2100 / 21, null),
        summary("YTD", thisYear, 90, -0.25),
        summary("LAST_YEAR", lastYear, 100, null),
        summary("TWO_YEARS_AGO", {}, 0, null),
      ],
      "Year to Date",
    );

    // 900 over ten months against 1,200 over twelve; December's is still to come.
    expect(screen.getByText("-10.00%")).toBeInTheDocument();
  });

  it("shows no change for All Time, which has no earlier period", async () => {
    await renderPeriod(firstIncomeLastYear);

    expect(screen.getByText("Cumulative income since inception")).toBeInTheDocument();
    expect(screen.getByText("Average since inception")).toBeInTheDocument();
    expect(screen.queryByText("Since last period")).not.toBeInTheDocument();
  });
});
