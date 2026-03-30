// All monetary values in the user's base currency (from Wealthfolio settings)
// All rates as decimals (0.065 = 6.5%)

export type WithdrawalStrategy = "constant-dollar" | "constant-percentage";

export interface GlidepathSettings {
  enabled: boolean;
  /** Expected annual return for the bond portion (e.g. 0.03 = 3%). */
  bondReturnRate: number;
  /** Fraction held in bonds at the FIRE date (e.g. 0.2 = 20%). */
  bondAllocationAtFire: number;
  /** Fraction held in bonds at the planning horizon (e.g. 0.5 = 50%). */
  bondAllocationAtHorizon: number;
}

export interface FireSettings {
  monthlyExpensesAtFire: number;
  safeWithdrawalRate: number;
  withdrawalStrategy: WithdrawalStrategy;
  expectedAnnualReturn: number;
  expectedReturnStdDev: number;
  inflationRate: number;
  currentAge: number;
  targetFireAge: number;
  monthlyContribution: number;
  contributionGrowthRate: number;
  currentAnnualSalary?: number;
  salaryGrowthRate?: number;
  additionalIncomeStreams: IncomeStream[];
  planningHorizonAge: number;
  includedAccountIds?: string[];
  targetAllocations: Record<string, number>;
  currency: string;
  linkedGoalId?: string;
  /** Monthly healthcare cost at FIRE in today's money (on top of monthlyExpensesAtFire). */
  healthcareMonthlyAtFire?: number;
  /** Annual inflation rate for healthcare costs. Defaults to inflationRate when undefined. */
  healthcareInflationRate?: number;
  /** Glide-path settings for bond allocation shift during retirement. */
  glidePath?: GlidepathSettings;
}

/**
 * "db" (defined-benefit, default): user enters `monthlyAmount` manually.
 * "dc" (defined-contribution): payout is derived as `balanceAtStartAge * swr / 12`.
 *  Absence of this field is treated as "db" for backward compatibility.
 */
export type StreamType = "db" | "dc";

export interface IncomeStream {
  id: string;
  label: string;
  /** For DB streams: the manual monthly payout. For DC streams, ignored — payout is derived. */
  monthlyAmount: number;
  startAge: number;
  startAgeIsAuto?: boolean;
  adjustForInflation: boolean;
  annualGrowthRate?: number;
  linkedAccountId?: string;
  currentValue?: number;
  monthlyContribution?: number;
  accumulationReturn?: number;
  /** Undefined = defined-benefit (backward-compatible default). */
  streamType?: StreamType;
}

export interface FireProjection {
  /** Age when portfolio first reached the FIRE target. null if target was never reached. */
  fireAge: number | null;
  fireYear: number | null;
  portfolioAtFire: number;
  /** True when withdrawal phase started with portfolio >= FIRE target (genuine FI).
   *  False means retirement was forced by targetFireAge before the target was reached. */
  fundedAtRetirement: boolean;
  coastFireAmount: number;
  coastFireReached: boolean;
  yearByYear: YearlySnapshot[];
}

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
  yearByYear: YearlySnapshot[];
}

export interface SorrScenario {
  label: string;
  returns: number[];
  portfolioPath: number[];
  finalValue: number;
  survived: boolean;
}

export interface SensitivityResult {
  contribution: SensitivityMatrix;
  swr: SensitivitySWRMatrix;
}

export interface StrategyComparisonResult {
  constantDollar: MonteCarloResult;
  constantPercentage: MonteCarloResult;
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
