import type { FireSettings } from "../types";

export const DEFAULT_SETTINGS: FireSettings = {
  monthlyExpensesAtFire: 3000,
  safeWithdrawalRate: 0.035,
  withdrawalStrategy: "constant-dollar",
  expectedAnnualReturn: 0.07,
  expectedReturnStdDev: 0.12,
  inflationRate: 0.02,
  currentAge: 30,
  targetFireAge: 50,
  monthlyContribution: 1000,
  contributionGrowthRate: 0.02,
  planningHorizonAge: 90,
  additionalIncomeStreams: [],
  targetAllocations: {},
  currency: "USD",
};
