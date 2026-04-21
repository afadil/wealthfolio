import type { RetirementPlan } from "../types";
import { normalizeExpenseBudget } from "./expense-items";

export const DEFAULT_RETIREMENT_PLAN: RetirementPlan = {
  version: "v3",
  personal: {
    currentAge: 30,
    targetRetirementAge: 50,
    planningHorizonAge: 90,
  },
  expenses: {
    items: [
      { id: "living", label: "Living", monthlyAmount: 3000, essential: true },
      { id: "healthcare", label: "Healthcare", monthlyAmount: 0, essential: true },
    ],
  },
  incomeStreams: [],
  investment: {
    preRetirementAnnualReturn: 0.0577,
    retirementAnnualReturn: 0.0337,
    annualInvestmentFeeRate: 0.006,
    annualVolatility: 0.12,
    inflationRate: 0.02,
    monthlyContribution: 1000,
    contributionGrowthRate: 0.02,
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
    const rawInvestment = raw.investment ?? {};
    const {
      expectedAnnualReturn,
      expectedReturnStdDev,
      targetAllocations,
      ...investmentWithoutLegacy
    } = rawInvestment;
    void targetAllocations;
    return {
      ...DEFAULT_RETIREMENT_PLAN,
      ...raw,
      version: "v3",
      personal: { ...DEFAULT_RETIREMENT_PLAN.personal, ...raw.personal },
      expenses: normalizeExpenseBudget(raw.expenses ?? DEFAULT_RETIREMENT_PLAN.expenses),
      incomeStreams: raw.incomeStreams ?? DEFAULT_RETIREMENT_PLAN.incomeStreams,
      investment: {
        ...DEFAULT_RETIREMENT_PLAN.investment,
        ...investmentWithoutLegacy,
        preRetirementAnnualReturn:
          rawInvestment.preRetirementAnnualReturn ??
          expectedAnnualReturn ??
          DEFAULT_RETIREMENT_PLAN.investment.preRetirementAnnualReturn,
        retirementAnnualReturn:
          rawInvestment.retirementAnnualReturn ??
          DEFAULT_RETIREMENT_PLAN.investment.retirementAnnualReturn,
        annualInvestmentFeeRate:
          rawInvestment.annualInvestmentFeeRate ??
          DEFAULT_RETIREMENT_PLAN.investment.annualInvestmentFeeRate,
        annualVolatility:
          rawInvestment.annualVolatility ??
          expectedReturnStdDev ??
          DEFAULT_RETIREMENT_PLAN.investment.annualVolatility,
      },
      withdrawal: { ...DEFAULT_RETIREMENT_PLAN.withdrawal, ...raw.withdrawal },
      tax: raw.tax ?? DEFAULT_RETIREMENT_PLAN.tax,
    };
  } catch {
    return { ...DEFAULT_RETIREMENT_PLAN };
  }
}
