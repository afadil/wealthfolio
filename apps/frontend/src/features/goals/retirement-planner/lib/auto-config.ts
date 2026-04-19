import { calculatePerformanceSummary } from "@/adapters";
import type { Account, ActivityDetails, Holding } from "@/lib/types";
import type { RetirementPlan } from "../types";

export interface AutoConfigResult {
  monthlyContribution: number | null;
  preRetirementAnnualReturn: number | null;
  retirementAnnualReturn: number | null;
  annualInvestmentFeeRate: number | null;
  targetAllocations: Record<string, number> | null;
  currency: string | null;
  notes: {
    monthlyContribution?: string;
    preRetirementAnnualReturn?: string;
    retirementAnnualReturn?: string;
    annualInvestmentFeeRate?: string;
    targetAllocations?: string;
  };
}

export function deriveMonthlyContribution(activities: ActivityDetails[]): {
  value: number | null;
  note: string;
} {
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  const relevant = activities.filter((a) => {
    const date = a.date instanceof Date ? a.date : new Date(a.date as unknown as string);
    const isRecent = date >= oneYearAgo;
    const isBuyOrDeposit =
      a.activityType === "BUY" || a.activityType === "DEPOSIT" || a.activityType === "TRANSFER_IN";
    return isRecent && isBuyOrDeposit;
  });

  if (relevant.length === 0) {
    return { value: null, note: "No BUY/DEPOSIT activities found in the last 12 months." };
  }

  const monthlyTotals = new Map<string, number>();

  relevant.forEach((a) => {
    const amount = parseFloat(a.amount ?? "0");
    if (isNaN(amount) || amount === 0) return;
    const date = a.date instanceof Date ? a.date : new Date(a.date as unknown as string);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const fxRate = parseFloat(a.fxRate ?? "1") || 1;
    monthlyTotals.set(key, (monthlyTotals.get(key) ?? 0) + Math.abs(amount) * fxRate);
  });

  if (monthlyTotals.size === 0) {
    return { value: null, note: "Activities found but amounts could not be parsed." };
  }

  const average =
    Array.from(monthlyTotals.values()).reduce((sum, v) => sum + v, 0) / monthlyTotals.size;

  return {
    value: Math.round(average),
    note: `Average of ${monthlyTotals.size} months with ${relevant.length} activities (last 12 months).`,
  };
}

export async function deriveExpectedReturn(accounts: Account[]): Promise<{
  value: number | null;
  note: string;
}> {
  const activeAccounts = accounts.filter((a) => a.isActive && !a.isArchived);
  if (activeAccounts.length === 0) {
    return { value: null, note: "No active accounts found." };
  }

  const endDate = new Date().toISOString().split("T")[0];
  const windows = [
    { years: 5, label: "5-year" },
    { years: 3, label: "3-year" },
    { years: 1, label: "1-year" },
  ];

  for (const { years, label } of windows) {
    const startDate = new Date(
      new Date().getFullYear() - years,
      new Date().getMonth(),
      new Date().getDate(),
    )
      .toISOString()
      .split("T")[0];

    try {
      const results = await Promise.all(
        activeAccounts.map((a) =>
          calculatePerformanceSummary({
            itemType: "account",
            itemId: a.id,
            startDate,
            endDate,
          }).catch(() => null),
        ),
      );

      const validReturns = results
        .filter((r) => r !== null && r.annualizedSimpleReturn != null)
        .map((r) => r!.annualizedSimpleReturn!);

      if (validReturns.length === 0) continue;

      const avg = validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;
      if (avg < -0.5 || avg > 1.0) continue;

      return {
        value: Math.round(avg * 1000) / 1000,
        note: `Annualized simple return over ${label} across ${validReturns.length} account(s).`,
      };
    } catch {
      continue;
    }
  }

  return { value: null, note: "Could not retrieve performance data." };
}

export function deriveTargetAllocations(holdings: Holding[]): {
  value: Record<string, number> | null;
  note: string;
} {
  const relevant = holdings.filter(
    (h) => h.holdingType !== "cash" && (h.marketValue?.base ?? 0) > 0,
  );

  if (relevant.length === 0) {
    return { value: null, note: "No holdings found to derive allocations." };
  }

  const total = relevant.reduce((sum, h) => sum + (h.marketValue?.base ?? 0), 0);
  if (total === 0) return { value: null, note: "Total portfolio value is zero." };

  const allocs: Record<string, number> = {};
  relevant.forEach((h) => {
    const sym = h.instrument?.symbol ?? "";
    if (!sym) return;
    const weight = (h.marketValue?.base ?? 0) / total;
    if (weight >= 0.01) {
      allocs[sym] = Math.round(weight * 200) / 200;
    }
  });

  const allocTotal = Object.values(allocs).reduce((sum, w) => sum + w, 0);
  if (allocTotal > 0) {
    Object.keys(allocs).forEach((k) => {
      allocs[k] = Math.round((allocs[k] / allocTotal) * 1000) / 1000;
    });
  }

  const count = Object.keys(allocs).length;
  return {
    value: allocs,
    note: `Derived from ${count} holding${count !== 1 ? "s" : ""} based on current market weights.`,
  };
}

export async function runAutoConfig(
  activities: ActivityDetails[],
  holdings: Holding[],
  accounts: Account[],
): Promise<AutoConfigResult> {
  const [contribution, expectedReturn] = await Promise.all([
    Promise.resolve(deriveMonthlyContribution(activities)),
    deriveExpectedReturn(accounts),
  ]);

  const allocResult = deriveTargetAllocations(holdings);

  return {
    monthlyContribution: contribution.value,
    preRetirementAnnualReturn: expectedReturn.value,
    retirementAnnualReturn: 0.0337,
    annualInvestmentFeeRate: 0.006,
    targetAllocations: allocResult.value,
    currency: null,
    notes: {
      monthlyContribution: contribution.note,
      preRetirementAnnualReturn: expectedReturn.note,
      retirementAnnualReturn: "Default retirement-phase gross return assumption.",
      annualInvestmentFeeRate: "Default annual portfolio fee drag.",
      targetAllocations: allocResult.note,
    },
  };
}

export function applyAutoConfig(current: RetirementPlan, result: AutoConfigResult): RetirementPlan {
  return {
    ...current,
    investment: {
      ...current.investment,
      ...(result.monthlyContribution !== null
        ? { monthlyContribution: result.monthlyContribution }
        : {}),
      ...(result.preRetirementAnnualReturn !== null
        ? { preRetirementAnnualReturn: result.preRetirementAnnualReturn }
        : {}),
      ...(result.retirementAnnualReturn !== null
        ? { retirementAnnualReturn: result.retirementAnnualReturn }
        : {}),
      ...(result.annualInvestmentFeeRate !== null
        ? { annualInvestmentFeeRate: result.annualInvestmentFeeRate }
        : {}),
      ...(result.targetAllocations !== null ? { targetAllocations: result.targetAllocations } : {}),
    },
  };
}
