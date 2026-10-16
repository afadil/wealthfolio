import { render, screen } from "@/test/render";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IncomeContentImpl } from "./income-tool-ui";

vi.mock("@/hooks/use-balance-privacy", () => ({
  useBalancePrivacy: () => ({ isBalanceHidden: false }),
}));

type IncomeContentProps = ComponentProps<typeof IncomeContentImpl>;

function renderCard(output: Record<string, unknown>) {
  return render(
    <IncomeContentImpl
      args={{ period: "ALL" }}
      argsText=""
      result={
        {
          currency: "USD",
          monthlyAverage: 0,
          byType: {},
          topAssets: [],
          byMonth: {},
          period: "ALL",
          ...output,
        } as unknown as IncomeContentProps["result"]
      }
      status={{ type: "complete" } as IncomeContentProps["status"]}
      toolName="get_income"
      toolCallId="tool-call-1"
      type="tool-call"
      addResult={vi.fn()}
      resume={vi.fn()}
    />,
  );
}

describe("IncomeToolUI unconverted currencies", () => {
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

  it("names the currencies left out of a partial total", () => {
    renderCard({ totalIncome: 2500, unconvertedCurrencies: ["INR"] });

    expect(
      screen.getByText(
        "Income in INR is left out of the totals because there is no exchange rate to USD.",
      ),
    ).toBeInTheDocument();
  });

  it("explains a zero total instead of reporting no income", () => {
    renderCard({ totalIncome: 0, unconvertedCurrencies: ["INR"] });

    expect(screen.queryByText("No income data found for this period.")).not.toBeInTheDocument();
    expect(screen.getByText(/Income in INR is left out of the totals/)).toBeInTheDocument();
  });

  it("still reports no income when nothing was left out", () => {
    renderCard({ totalIncome: 0 });

    expect(screen.getByText("No income data found for this period.")).toBeInTheDocument();
  });
});
