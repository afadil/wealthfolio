// All monetary values in the user's base currency (from Wealthfolio settings)
// All rates as decimals (0.065 = 6.5%)

export type WithdrawalStrategy = "constant-dollar" | "constant-percentage";

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
}

export interface IncomeStream {
  id: string;
  label: string;
  monthlyAmount: number;
  startAge: number;
  startAgeIsAuto?: boolean;
  adjustForInflation: boolean;
  annualGrowthRate?: number;
  linkedAccountId?: string;
  currentValue?: number;
  monthlyContribution?: number;
  accumulationReturn?: number;
}

export interface FireProjection {
  fireAge: number | null;
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
  annualIncome: number;
  netWithdrawalFromPortfolio: number;
  pensionAssets: number;
}

export interface MonteCarloResult {
  successRate: number;
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
