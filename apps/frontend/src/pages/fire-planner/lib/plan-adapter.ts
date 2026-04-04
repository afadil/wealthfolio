import type { RetirementPlan } from "../types";

export const DEFAULT_RETIREMENT_PLAN: RetirementPlan = {
  version: "v2",
  personal: {
    currentAge: 30,
    targetRetirementAge: 50,
    planningHorizonAge: 90,
  },
  expenses: {
    living: { monthlyAmount: 3000 },
    healthcare: { monthlyAmount: 0 },
  },
  incomeStreams: [],
  investment: {
    expectedAnnualReturn: 0.07,
    expectedReturnStdDev: 0.12,
    inflationRate: 0.02,
    monthlyContribution: 1000,
    contributionGrowthRate: 0.02,
    targetAllocations: {},
  },
  withdrawal: {
    safeWithdrawalRate: 0.035,
    strategy: "constant-dollar",
  },
  currency: "USD",
};

export function parseSettingsJson(json: string): RetirementPlan {
  try {
    const raw = JSON.parse(json);
    return {
      ...DEFAULT_RETIREMENT_PLAN,
      ...raw,
      personal: { ...DEFAULT_RETIREMENT_PLAN.personal, ...raw.personal },
      expenses: {
        living: { ...DEFAULT_RETIREMENT_PLAN.expenses.living, ...raw.expenses?.living },
        healthcare: { ...DEFAULT_RETIREMENT_PLAN.expenses.healthcare, ...raw.expenses?.healthcare },
        housing: raw.expenses?.housing ?? DEFAULT_RETIREMENT_PLAN.expenses.housing,
        discretionary:
          raw.expenses?.discretionary ?? DEFAULT_RETIREMENT_PLAN.expenses.discretionary,
      },
      incomeStreams: raw.incomeStreams ?? DEFAULT_RETIREMENT_PLAN.incomeStreams,
      investment: { ...DEFAULT_RETIREMENT_PLAN.investment, ...raw.investment },
      withdrawal: { ...DEFAULT_RETIREMENT_PLAN.withdrawal, ...raw.withdrawal },
      tax: raw.tax ?? DEFAULT_RETIREMENT_PLAN.tax,
    };
  } catch {
    return { ...DEFAULT_RETIREMENT_PLAN };
  }
}
