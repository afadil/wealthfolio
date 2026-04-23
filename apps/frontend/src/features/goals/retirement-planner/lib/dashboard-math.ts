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

interface PortfolioDrawRateInput {
  requiredCapitalReachable: boolean;
  portfolioValueAtAge: number | null | undefined;
  grossWithdrawalAtAge: number | null | undefined;
  annualIncomeAtAge: number;
  annualSpendingAtAge: number;
  portfolioEndAtAge: number | null | undefined;
}

export function resolvePortfolioDrawRate({
  requiredCapitalReachable,
  portfolioValueAtAge,
  grossWithdrawalAtAge,
  annualIncomeAtAge,
  annualSpendingAtAge,
  portfolioEndAtAge,
}: PortfolioDrawRateInput) {
  const portfolioValue = portfolioValueAtAge ?? 0;
  const grossWithdrawal = grossWithdrawalAtAge ?? 0;
  const portfolioEnd = portfolioEndAtAge ?? portfolioValue;

  if (!requiredCapitalReachable) return null;
  if (portfolioValue <= 0 || grossWithdrawal <= 0) return null;
  if (annualSpendingAtAge > 0 && annualIncomeAtAge >= annualSpendingAtAge * 0.95) return null;
  if (portfolioEnd <= 0) return null;

  return grossWithdrawal / portfolioValue;
}

export type ReadinessTone = "good" | "watch" | "bad";

interface RetirementOverviewLike {
  requiredCapitalReachable?: boolean;
  successStatus?: string;
  failureAge?: number | null;
  spendingShortfallAge?: number | null;
}

interface DeriveRetirementReadinessInput {
  overview?: RetirementOverviewLike | null;
  plannerMode: "fire" | "traditional";
  isFinanciallyIndependent: boolean;
  effectiveFiAge: number | null;
  desiredAge: number;
  horizonAge: number;
}

export interface RetirementReadiness {
  tone: ReadinessTone;
  problem:
    | "loading"
    | "unreachable-target"
    | "spending-gap"
    | "portfolio-depletion"
    | "on-track"
    | "late"
    | "not-reachable";
  body: string | null;
}

export function deriveRetirementReadiness({
  overview,
  plannerMode,
  isFinanciallyIndependent,
  effectiveFiAge,
  desiredAge,
  horizonAge,
}: DeriveRetirementReadinessInput): RetirementReadiness {
  if (!overview) {
    return { tone: "watch", problem: "loading", body: null };
  }

  if (overview.requiredCapitalReachable === false) {
    return {
      tone: "bad",
      problem: "unreachable-target",
      body: "Target cannot be sized with the current assumptions. Check spending, inflation, returns, and retirement horizon.",
    };
  }

  if (overview.failureAge != null || overview.successStatus === "depleted") {
    return {
      tone: "bad",
      problem: "portfolio-depletion",
      body: `Projected portfolio runs short during age ${overview.failureAge ?? horizonAge}. Reduce spending, retire later, or add retirement income.`,
    };
  }

  if (overview.spendingShortfallAge != null) {
    return {
      tone: "watch",
      problem: "spending-gap",
      body: `Projected spending gap starts at age ${overview.spendingShortfallAge}. Increase contributions, retire later, reduce retirement spending, or add retirement income.`,
    };
  }

  if (plannerMode === "traditional") {
    if (overview.successStatus === "shortfall") {
      return {
        tone: "watch",
        problem: "spending-gap",
        body: "Short at retirement. Increase contributions, retire later, reduce retirement spending, or add retirement income.",
      };
    }
    return { tone: "good", problem: "on-track", body: null };
  }

  if (isFinanciallyIndependent) {
    return {
      tone: "good",
      problem: "on-track",
      body: "You have reached financial independence with the current assumptions.",
    };
  }

  if (effectiveFiAge == null) {
    return {
      tone: "bad",
      problem: "not-reachable",
      body: `Not reachable by age ${horizonAge} with current assumptions. Consider increasing contributions, extending the desired retirement age, reducing retirement spending, or adding retirement income.`,
    };
  }

  if (effectiveFiAge <= desiredAge) {
    return { tone: "good", problem: "on-track", body: null };
  }

  const yearsLate = effectiveFiAge - desiredAge;
  return {
    tone: yearsLate <= 3 ? "watch" : "bad",
    problem: "late",
    body: `${yearsLate} year${yearsLate !== 1 ? "s" : ""} after your desired age. Consider increasing contributions, extending the desired retirement age, or reducing retirement spending.`,
  };
}
