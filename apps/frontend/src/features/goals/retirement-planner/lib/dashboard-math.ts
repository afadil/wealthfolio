interface CoverageSnapshotLike {
  phase?: string;
  plannedExpenses?: number;
  annualExpenses?: number;
  annualIncome?: number;
  netWithdrawalFromPortfolio?: number;
  grossWithdrawal?: number;
  annualTaxes?: number;
}

interface CoverageAnnualNominalValuesInput {
  snapshot?: CoverageSnapshotLike;
  totalMonthlyBudget: number;
  fallbackMonthlyIncome: number;
  effectiveTaxRate: number;
}

export interface CoverageAnnualNominalValues {
  annualSpendingNominal: number;
  annualIncomeNominal: number;
  annualPortfolioGapNominal: number;
  annualGrossWithdrawalNominal: number;
  annualEstimatedTaxesNominal: number;
}

export function resolveCoverageAnnualNominalValues({
  snapshot,
  totalMonthlyBudget,
  fallbackMonthlyIncome,
  effectiveTaxRate,
}: CoverageAnnualNominalValuesInput): CoverageAnnualNominalValues {
  const snapshotSpending =
    snapshot?.plannedExpenses ?? (snapshot?.phase === "fire" ? snapshot.annualExpenses : undefined);
  const snapshotIncome = snapshot?.phase === "fire" ? snapshot.annualIncome : undefined;
  const snapshotPortfolioGap =
    snapshot?.phase === "fire" ? snapshot.netWithdrawalFromPortfolio : undefined;
  const snapshotGrossWithdrawal = snapshot?.phase === "fire" ? snapshot.grossWithdrawal : undefined;
  const snapshotTaxes = snapshot?.phase === "fire" ? snapshot.annualTaxes : undefined;

  const annualSpendingNominal = snapshotSpending ?? totalMonthlyBudget * 12;
  const annualIncomeNominal = snapshotIncome ?? fallbackMonthlyIncome * 12;
  const annualPortfolioGapNominal =
    snapshotPortfolioGap ?? Math.max(0, annualSpendingNominal - annualIncomeNominal);
  const annualGrossWithdrawalNominal =
    snapshotGrossWithdrawal ??
    (effectiveTaxRate > 0
      ? annualPortfolioGapNominal / Math.max(0.01, 1 - effectiveTaxRate)
      : annualPortfolioGapNominal);
  const annualEstimatedTaxesNominal =
    snapshotTaxes ?? Math.max(0, annualGrossWithdrawalNominal - annualPortfolioGapNominal);

  return {
    annualSpendingNominal,
    annualIncomeNominal,
    annualPortfolioGapNominal,
    annualGrossWithdrawalNominal,
    annualEstimatedTaxesNominal,
  };
}

export function resolveFundedProgress(
  backendProgress: number | null | undefined,
  portfolioNow: number,
  targetTodayAtGoal: number,
) {
  const progress =
    backendProgress ?? (targetTodayAtGoal > 0 ? portfolioNow / targetTodayAtGoal : 0);
  return Math.min(Math.max(progress, 0), 1);
}
