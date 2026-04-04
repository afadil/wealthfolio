// All monetary values in the user's base currency (from Wealthfolio settings)
// All rates as decimals (0.065 = 6.5%)

export interface GlidepathSettings {
  enabled: boolean;
  /** Expected annual return for the bond portion (e.g. 0.03 = 3%). */
  bondReturnRate: number;
  /** Fraction held in bonds at the FIRE date (e.g. 0.2 = 20%). */
  bondAllocationAtFire: number;
  /** Fraction held in bonds at the planning horizon (e.g. 0.5 = 50%). */
  bondAllocationAtHorizon: number;
}

export interface FireProjection {
  /** Age when portfolio first reached the FIRE target. null if target was never reached. */
  fireAge: number | null;
  fireYear: number | null;
  retirementStartAge: number | null;
  retirementStartReason?: RetirementStartReason | null;
  portfolioAtFire: number;
  /** True when withdrawal phase started with portfolio >= required capital. */
  fundedAtRetirement: boolean;
  coastFireAmount: number;
  coastFireReached: boolean;
  yearByYear: YearlySnapshot[];
}

export type RetirementStartReason = "funded" | "target_age_forced";

export interface YearlySnapshot {
  age: number;
  year: number;
  phase: "accumulation" | "fire";
  portfolioValue: number;
  annualContribution: number;
  annualWithdrawal: number;
  annualIncome: number;
  netWithdrawalFromPortfolio: number;
  pensionAssets: number;
  annualTaxes?: number;
  grossWithdrawal?: number;
}

export interface MonteCarloResult {
  successRate: number;
  /** Median age at which the FI target was genuinely reached. null for underfunded plans
   *  where fewer than 50% of simulations hit the target before the horizon. */
  medianFireAge: number | null;
  percentiles: {
    p10: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p90: number[];
  };
  ageAxis: number[];
  finalPortfolioAtHorizon: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
  nSimulations: number;
}

export interface AllocationHealth {
  symbol: string;
  name: string;
  currentWeight: number;
  targetWeight: number;
  drift: number;
  status: "underweight" | "overweight" | "ok";
  currentValue: number;
  daysSinceLastBuy: number | null;
}

export interface ScenarioResult {
  label: string;
  annualReturn: number;
  fireAge: number | null;
  portfolioAtHorizon: number;
  fundedAtGoalAge: boolean;
  success: boolean;
  failureAge?: number | null;
  yearByYear: YearlySnapshot[];
}

export interface SorrScenario {
  label: string;
  returns: number[];
  portfolioPath: number[];
  finalValue: number;
  survived: boolean;
  failureAge?: number | null;
}

export interface SensitivityResult {
  contribution: SensitivityMatrix;
  swr: SensitivitySWRMatrix;
}

export interface StrategyComparisonResult {
  constantDollar: MonteCarloResult;
  constantPercentage: MonteCarloResult;
  guardrails: MonteCarloResult;
}

export interface SensitivityMatrix {
  contributionRows: number[];
  returnColumns: number[];
  fireAges: (number | null)[][];
}

export interface SensitivitySWRMatrix {
  swrRows: number[];
  returnColumns: number[];
  fireAges: (number | null)[][];
}

// ─── Retirement Plan Types ──────────────────────────────────────────────────

export interface RetirementPlan {
  version: "v2";
  personal: PersonalProfile;
  expenses: ExpenseBudget;
  incomeStreams: RetirementIncomeStream[];
  investment: InvestmentAssumptions;
  withdrawal: WithdrawalConfig;
  tax?: TaxProfile;
  currency: string;
}

export interface PersonalProfile {
  currentAge: number;
  targetRetirementAge: number;
  planningHorizonAge: number;
  currentAnnualSalary?: number;
  salaryGrowthRate?: number;
}

export interface ExpenseBudget {
  living: ExpenseBucket;
  healthcare: ExpenseBucket;
  housing?: ExpenseBucket;
  discretionary?: ExpenseBucket;
}

export interface ExpenseBucket {
  monthlyAmount: number;
  inflationRate?: number;
  startAge?: number;
  endAge?: number;
  essential?: boolean;
}

export interface RetirementIncomeStream {
  id: string;
  label: string;
  streamType: "db" | "dc";
  startAge: number;
  adjustForInflation: boolean;
  annualGrowthRate?: number;
  monthlyAmount?: number;
  linkedAccountId?: string;
  currentValue?: number;
  monthlyContribution?: number;
  accumulationReturn?: number;
}

export interface InvestmentAssumptions {
  expectedAnnualReturn: number;
  expectedReturnStdDev: number;
  inflationRate: number;
  monthlyContribution: number;
  contributionGrowthRate: number;
  glidePath?: GlidepathSettings;
  targetAllocations: Record<string, number>;
}

export interface GuardrailsConfig {
  ceilingRate: number;
  floorRate: number;
}

export interface WithdrawalConfig {
  safeWithdrawalRate: number;
  strategy: "constant-dollar" | "constant-percentage" | "guardrails";
  guardrails?: GuardrailsConfig;
}

export interface TaxProfile {
  taxableWithdrawalRate: number;
  taxDeferredWithdrawalRate: number;
  taxFreeWithdrawalRate: number;
  earlyWithdrawalPenaltyRate?: number;
  earlyWithdrawalPenaltyAge?: number;
  countryCode?: string;
  withdrawalBuckets?: TaxBucketBalances;
}

export interface TaxBucketBalances {
  taxable: number;
  taxDeferred: number;
  taxFree: number;
}
