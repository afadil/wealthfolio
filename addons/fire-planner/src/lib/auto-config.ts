import type { AddonContext, ActivityDetails, Holding, Account } from "@wealthfolio/addon-sdk";
import type { FireSettings } from "../types";

export interface AutoConfigResult {
  monthlyContribution: number | null;
  expectedAnnualReturn: number | null;
  targetAllocations: Record<string, number> | null;
  currency: string | null;
  // Human-readable notes explaining how each value was derived
  notes: {
    monthlyContribution?: string;
    expectedAnnualReturn?: string;
    targetAllocations?: string;
  };
}

// ─── Monthly Contribution ───────────────────────────────────────────────────────

/**
 * Derive average monthly contribution from the last 12 months of BUY and DEPOSIT
 * activities. Uses |amount| in the activity's own currency as an approximation
 * (works well when accounts are mostly in base currency).
 */
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

  // Group by year-month and sum amounts
  const monthlyTotals = new Map<string, number>();
  let skipped = 0;

  relevant.forEach((a) => {
    const amount = parseFloat(a.amount ?? "0");
    if (isNaN(amount) || amount === 0) {
      skipped++;
      return;
    }
    const date = a.date instanceof Date ? a.date : new Date(a.date as unknown as string);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    // Use fxRate to convert to base currency (fxRate = 1 activity currency → fxRate base currency)
    const fxRate = parseFloat(a.fxRate ?? "1") || 1;
    const baseAmount = Math.abs(amount) * fxRate;
    monthlyTotals.set(key, (monthlyTotals.get(key) ?? 0) + baseAmount);
  });

  if (monthlyTotals.size === 0) {
    return { value: null, note: "Activities found but amounts could not be parsed." };
  }

  const average =
    Array.from(monthlyTotals.values()).reduce((sum, v) => sum + v, 0) / monthlyTotals.size;

  const note = `Average of ${monthlyTotals.size} months with ${relevant.length} activities (last 12 months).`;
  return { value: Math.round(average), note };
}

// ─── Expected Annual Return ─────────────────────────────────────────────────────

/**
 * Estimate expected annual return from historical performance across all accounts.
 * Uses the annualized simple return from the performance API over the longest
 * available window (up to 5 years).
 */
export async function deriveExpectedReturn(
  accounts: Account[],
  ctx: AddonContext,
): Promise<{ value: number | null; note: string }> {
  const activeAccounts = accounts.filter((a) => a.isActive && !a.isArchived);
  if (activeAccounts.length === 0) {
    return { value: null, note: "No active accounts found." };
  }

  const endDate = new Date().toISOString().split("T")[0];
  // Try 5 years first, fall back to 3 years if no data
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
          ctx.api.performance
            .calculateSummary({ itemType: "account", itemId: a.id, startDate, endDate })
            .catch(() => null),
        ),
      );

      const validReturns = results
        .filter((r) => r !== null && r.annualizedSimpleReturn != null)
        .map((r) => r!.annualizedSimpleReturn!);

      if (validReturns.length === 0) continue;

      // Weight average by number of valid accounts
      const avg = validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length;

      // Sanity check: ignore implausible values (< -50% or > 100% annualized)
      if (avg < -0.5 || avg > 1.0) continue;

      return {
        value: Math.round(avg * 1000) / 1000, // round to 0.1%
        note: `Annualized simple return over ${label} across ${validReturns.length} account(s).`,
      };
    } catch {
      continue;
    }
  }

  return {
    value: null,
    note: "Could not retrieve performance data. Check account history.",
  };
}

// ─── Target Allocations ─────────────────────────────────────────────────────────

/**
 * Derive target allocations from current portfolio holdings.
 * Returns weights rounded to the nearest 0.5% with a minimum threshold of 1%.
 */
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
      // Round to nearest 0.5%
      allocs[sym] = Math.round(weight * 200) / 200;
    }
  });

  // Normalize so weights sum to 1.0
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

// ─── Full Auto-Config ───────────────────────────────────────────────────────────

export async function runAutoConfig(
  activities: ActivityDetails[],
  holdings: Holding[],
  accounts: Account[],
  ctx: AddonContext,
): Promise<AutoConfigResult> {
  const [contribution, expectedReturn, appSettings] = await Promise.all([
    Promise.resolve(deriveMonthlyContribution(activities)),
    deriveExpectedReturn(accounts, ctx),
    ctx.api.settings.get().catch(() => null),
  ]);

  const allocResult = deriveTargetAllocations(holdings);

  return {
    monthlyContribution: contribution.value,
    expectedAnnualReturn: expectedReturn.value,
    targetAllocations: allocResult.value,
    currency: appSettings?.baseCurrency ?? null,
    notes: {
      monthlyContribution: contribution.note,
      expectedAnnualReturn: expectedReturn.note,
      targetAllocations: allocResult.note,
    },
  };
}

/**
 * Apply auto-config results to a settings draft, keeping existing values
 * where auto-config returns null.
 */
export function applyAutoConfig(current: FireSettings, result: AutoConfigResult): FireSettings {
  return {
    ...current,
    ...(result.monthlyContribution !== null
      ? { monthlyContribution: result.monthlyContribution }
      : {}),
    ...(result.expectedAnnualReturn !== null
      ? { expectedAnnualReturn: result.expectedAnnualReturn }
      : {}),
    ...(result.targetAllocations !== null ? { targetAllocations: result.targetAllocations } : {}),
    ...(result.currency !== null ? { currency: result.currency } : {}),
  };
}
