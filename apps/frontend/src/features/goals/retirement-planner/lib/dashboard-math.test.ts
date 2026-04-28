import { describe, expect, it } from "vitest";
import {
  deriveRetirementReadiness,
  resolveCoverageAnnualNominalValues,
  resolveFundedProgress,
  resolvePortfolioDrawRate,
} from "./dashboard-math";

describe("retirement dashboard math", () => {
  it("does not inflate backend nominal budget fallback values again", () => {
    const values = resolveCoverageAnnualNominalValues({
      totalMonthlyBudget: 1_000,
      fallbackMonthlyIncome: 400,
      effectiveTaxRate: 0.25,
    });

    expect(values.annualSpendingNominal).toBe(12_000);
    expect(values.annualIncomeNominal).toBe(4_800);
    expect(values.annualPortfolioGapNominal).toBe(7_200);
    expect(values.annualGrossWithdrawalNominal).toBe(9_600);
    expect(values.annualEstimatedTaxesNominal).toBe(2_400);
  });

  it("uses fire-phase snapshot values directly when available", () => {
    const values = resolveCoverageAnnualNominalValues({
      snapshot: {
        phase: "fire",
        plannedExpenses: 15_000,
        annualIncome: 5_000,
        netWithdrawalFromPortfolio: 10_000,
        grossWithdrawal: 11_000,
        annualTaxes: 1_000,
      },
      totalMonthlyBudget: 99_999,
      fallbackMonthlyIncome: 99_999,
      effectiveTaxRate: 0.25,
    });

    expect(values.annualSpendingNominal).toBe(15_000);
    expect(values.annualIncomeNominal).toBe(5_000);
    expect(values.annualPortfolioGapNominal).toBe(10_000);
    expect(values.annualGrossWithdrawalNominal).toBe(11_000);
    expect(values.annualEstimatedTaxesNominal).toBe(1_000);
  });

  it("keeps funded progress independent from today's-value versus nominal display mode", () => {
    expect(resolveFundedProgress(0.25, 500_000, 1_000_000)).toBe(0.25);
    expect(resolveFundedProgress(0.25, 500_000, 2_000_000)).toBe(0.25);
    expect(resolveFundedProgress(undefined, 500_000, 1_000_000)).toBe(0.5);
    expect(resolveFundedProgress(1.2, 500_000, 1_000_000)).toBe(1);
    expect(resolveFundedProgress(-0.2, 500_000, 1_000_000)).toBe(0);
  });

  it("derives deterministic readiness without conflating spending gaps and depletion", () => {
    expect(
      deriveRetirementReadiness({
        overview: { requiredCapitalReachable: false },
        plannerMode: "traditional",
        isFinanciallyIndependent: false,
        effectiveFiAge: null,
        desiredAge: 65,
        horizonAge: 90,
      }),
    ).toMatchObject({ tone: "bad", problem: "unreachable-target" });

    expect(
      deriveRetirementReadiness({
        overview: { requiredCapitalReachable: true, spendingShortfallAge: 78 },
        plannerMode: "traditional",
        isFinanciallyIndependent: false,
        effectiveFiAge: null,
        desiredAge: 65,
        horizonAge: 90,
      }),
    ).toMatchObject({ tone: "watch", problem: "spending-gap" });

    expect(
      deriveRetirementReadiness({
        overview: { requiredCapitalReachable: true, failureAge: 83 },
        plannerMode: "traditional",
        isFinanciallyIndependent: false,
        effectiveFiAge: null,
        desiredAge: 65,
        horizonAge: 90,
      }),
    ).toMatchObject({ tone: "bad", problem: "portfolio-depletion" });

    expect(
      deriveRetirementReadiness({
        overview: { requiredCapitalReachable: true, spendingShortfallAge: 78, failureAge: 83 },
        plannerMode: "traditional",
        isFinanciallyIndependent: false,
        effectiveFiAge: null,
        desiredAge: 65,
        horizonAge: 90,
      }),
    ).toMatchObject({ tone: "bad", problem: "portfolio-depletion" });
  });

  it("shows portfolio draw rate only when meaningful", () => {
    expect(
      resolvePortfolioDrawRate({
        requiredCapitalReachable: true,
        portfolioValueAtAge: 1_000_000,
        grossWithdrawalAtAge: 45_000,
        annualIncomeAtAge: 12_000,
        annualSpendingAtAge: 60_000,
        portfolioEndAtAge: 990_000,
      }),
    ).toBe(0.045);

    expect(
      resolvePortfolioDrawRate({
        requiredCapitalReachable: false,
        portfolioValueAtAge: 1_000_000,
        grossWithdrawalAtAge: 45_000,
        annualIncomeAtAge: 12_000,
        annualSpendingAtAge: 60_000,
        portfolioEndAtAge: 990_000,
      }),
    ).toBeNull();

    expect(
      resolvePortfolioDrawRate({
        requiredCapitalReachable: true,
        portfolioValueAtAge: 1_000_000,
        grossWithdrawalAtAge: 2_000,
        annualIncomeAtAge: 57_000,
        annualSpendingAtAge: 60_000,
        portfolioEndAtAge: 990_000,
      }),
    ).toBeNull();

    expect(
      resolvePortfolioDrawRate({
        requiredCapitalReachable: true,
        portfolioValueAtAge: 1_000_000,
        grossWithdrawalAtAge: 45_000,
        annualIncomeAtAge: 12_000,
        annualSpendingAtAge: 60_000,
        portfolioEndAtAge: 0,
      }),
    ).toBeNull();
  });
});
