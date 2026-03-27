// All monetary values in the user's base currency (from Wealthfolio settings)
// All rates as decimals (0.065 = 6.5%)

export type WithdrawalStrategy = "constant-dollar" | "constant-percentage";

export interface FireSettings {
  // Core FIRE parameters
  monthlyExpensesAtFire: number; // Monthly spending needed in FIRE
  safeWithdrawalRate: number; // Default: 0.035 (3.5%)
  withdrawalStrategy: WithdrawalStrategy; // Default: "constant-dollar"
  expectedAnnualReturn: number; // Portfolio expected return. Default: 0.07
  expectedReturnStdDev: number; // Volatility for Monte Carlo. Default: 0.12
  inflationRate: number; // Default: 0.02
  currentAge: number;
  targetFireAge: number;

  // Monthly contributions
  monthlyContribution: number;
  contributionGrowthRate: number; // Annual growth rate of contribution. Default: 0.02

  // Salary model (optional) — when set, salaryGrowthRate overrides contributionGrowthRate
  currentAnnualSalary?: number;
  salaryGrowthRate?: number; // Annual salary raise %. Default: same as contributionGrowthRate

  // Additional income in FIRE (pension, part-time, annuity, etc.)
  additionalIncomeStreams: IncomeStream[];

  // Planning horizon — used to size the simulation window and SORR test
  planningHorizonAge: number; // Default: 90

  // Which accounts to include in the FIRE portfolio total.
  // If undefined, defaults to all SECURITIES + CRYPTOCURRENCY accounts (excludes CASH).
  includedAccountIds?: string[];

  // Target allocation per asset for drift detection
  // Key: asset symbol or name, Value: target weight 0–1
  targetAllocations: Record<string, number>;

  // Currency auto-read from Wealthfolio settings
  currency: string;
}

export interface IncomeStream {
  id: string;
  label: string; // e.g. "State Pension", "Part-time work"
  monthlyAmount: number;
  startAge: number;
  startAgeIsAuto?: boolean; // if true, startAge is always set to targetFireAge at save time
  adjustForInflation: boolean;
  annualGrowthRate?: number; // explicit per-stream growth rate; overrides adjustForInflation when set

  // Optional link to a Wealthfolio account — used to sync currentValue from live data
  linkedAccountId?: string;

  // Accumulation phase — for assets like private pension funds (fondo pensione, TFR)
  // Leave at 0 / undefined for pure income streams like INPS state pension
  currentValue?: number; // Current balance of the pension fund
  monthlyContribution?: number; // Monthly contribution during accumulation (e.g. TFR)
  accumulationReturn?: number; // Annual growth rate during accumulation (e.g. 0.04)
}

export interface FireProjection {
  fireAge: number | null; // null = not reached in horizon
  fireYear: number | null;
  portfolioAtFire: number;
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
  annualIncome: number; // From additional income streams
  netWithdrawalFromPortfolio: number;
  pensionAssets: number; // Total value of all accumulating pension funds this year
}

export interface MonteCarloResult {
  successRate: number; // 0–1, % of simulations where portfolio survives
  medianFireAge: number;
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
  drift: number; // currentWeight - targetWeight
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
  returns: number[]; // Year-by-year returns starting at FIRE
  portfolioPath: number[];
  finalValue: number;
  survived: boolean;
}

export interface SensitivityMatrix {
  contributionRows: number[];
  returnColumns: number[];
  // fireAges[i][j] = fire age for contribution[i] and return[j]
  fireAges: (number | null)[][];
}

export interface SensitivitySWRMatrix {
  swrRows: number[];
  returnColumns: number[];
  // fireAges[i][j] = FIRE age for swr[i] and return[j]
  fireAges: (number | null)[][];
}
