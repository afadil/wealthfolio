/**
 * Save-Up goal projection engine.
 *
 * - Daily compounding for growth using actual calendar day counts
 * - Monthly contributions at end of month
 * - annualReturn is a decimal (e.g. 0.07 for 7%)
 */

export interface SaveUpProjection {
  /** Projected value at target date */
  projectedValue: number;
  /** Required monthly contribution to hit target */
  requiredMonthly: number;
  /** Date when target will be reached (null if already reached or can't be projected) */
  projectedCompletionDate: string | null;
  /** Health status */
  health: "on_track" | "at_risk" | "off_track";
}

interface SaveUpInput {
  currentAmount: number;
  targetAmount: number;
  targetDate: string;
  monthlyContribution: number;
  annualReturn: number;
}

/** Number of days in a given month (1-indexed). */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Difference in whole calendar days between two dates. */
function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

/**
 * Future value with daily compounding and monthly end-of-month contributions.
 * Uses actual calendar day counts per month.
 */
function futureValue(
  principal: number,
  monthlyContribution: number,
  annualReturn: number,
  startDate: Date,
  endDate: Date,
): number {
  if (endDate <= startDate) return principal;

  const dailyRate = annualReturn / 365;
  let balance = principal;
  let cursor = new Date(startDate);

  while (cursor < endDate) {
    // Advance to end of current month or endDate, whichever is earlier
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0); // last day of month
    const periodEnd = monthEnd < endDate ? monthEnd : endDate;
    const days = daysBetween(cursor, periodEnd);

    if (days > 0) {
      balance *= Math.pow(1 + dailyRate, days);
    }

    // Add contribution at end of month (only if we reached month end, not an early endDate)
    if (periodEnd.getTime() === monthEnd.getTime() && periodEnd < endDate) {
      balance += monthlyContribution;
    }

    // Move cursor to day after periodEnd
    cursor = new Date(periodEnd);
    cursor.setDate(cursor.getDate() + 1);
  }

  return balance;
}

/**
 * Count of whole months between two dates.
 */
function monthsBetween(start: Date, end: Date): number {
  return Math.max(
    0,
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()),
  );
}

/**
 * Solve for monthly contribution needed to reach target.
 * Uses bisection method with actual calendar math.
 */
function solveRequiredMonthly(
  principal: number,
  targetAmount: number,
  annualReturn: number,
  startDate: Date,
  endDate: Date,
): number {
  if (endDate <= startDate) return Math.max(0, targetAmount - principal);
  if (principal >= targetAmount) return 0;

  let lo = 0;
  let hi = targetAmount;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const fv = futureValue(principal, mid, annualReturn, startDate, endDate);
    if (fv < targetAmount) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return Math.ceil((lo + hi) / 2);
}

/**
 * Find the month when the target is first reached.
 */
function findCompletionDate(
  principal: number,
  monthlyContribution: number,
  annualReturn: number,
  targetAmount: number,
  startDate: Date,
  maxMonths: number,
): Date | null {
  if (principal >= targetAmount) return startDate;
  if (monthlyContribution <= 0 && annualReturn <= 0) return null;

  const dailyRate = annualReturn / 365;
  let balance = principal;
  const cursor = new Date(startDate);

  for (let m = 1; m <= maxMonths; m++) {
    const days = daysInMonth(cursor.getFullYear(), cursor.getMonth() + 1);
    balance *= Math.pow(1 + dailyRate, days);
    balance += monthlyContribution;
    cursor.setMonth(cursor.getMonth() + 1);
    if (balance >= targetAmount) return new Date(cursor);
  }
  return null;
}

export function projectSaveUp(input: SaveUpInput): SaveUpProjection {
  const { currentAmount, targetAmount, targetDate, monthlyContribution, annualReturn } = input;

  const now = new Date();
  const target = new Date(targetDate);

  const projectedValue = futureValue(currentAmount, monthlyContribution, annualReturn, now, target);
  const requiredMonthly = solveRequiredMonthly(
    currentAmount,
    targetAmount,
    annualReturn,
    now,
    target,
  );

  const totalMonths = monthsBetween(now, target);
  const completionDate = findCompletionDate(
    currentAmount,
    monthlyContribution,
    annualReturn,
    targetAmount,
    now,
    Math.max(totalMonths * 3, 120), // Search up to 3x remaining or 10 years
  );

  let projectedCompletionDate: string | null = null;
  if (completionDate) {
    projectedCompletionDate = completionDate.toISOString().split("T")[0];
  }

  // Health status
  let health: SaveUpProjection["health"];
  if (projectedValue >= targetAmount) {
    health = "on_track";
  } else if (projectedValue >= targetAmount * 0.9) {
    health = "at_risk";
  } else {
    health = "off_track";
  }

  return {
    projectedValue,
    requiredMonthly,
    projectedCompletionDate,
    health,
  };
}

/** A single data point for the projection chart. */
export interface ProjectionPoint {
  date: string; // YYYY-MM
  nominal: number;
  optimistic: number;
  pessimistic: number;
  target: number;
}

/**
 * Generate monthly projection data for charting.
 * Runs three scenarios: nominal (given return), optimistic (+2%), pessimistic (-2%).
 */
export function generateProjectionSeries(input: SaveUpInput): ProjectionPoint[] {
  const { currentAmount, targetAmount, targetDate, monthlyContribution, annualReturn } = input;

  const now = new Date();
  const end = new Date(targetDate);
  const months = monthsBetween(now, end);
  if (months <= 0) return [];

  const scenarios = [
    { key: "pessimistic" as const, rate: Math.max(0, annualReturn - 0.02) },
    { key: "nominal" as const, rate: annualReturn },
    { key: "optimistic" as const, rate: annualReturn + 0.02 },
  ];

  // Build monthly balances for each scenario
  const series = new Map<string, { nominal: number; optimistic: number; pessimistic: number }>();
  const points: ProjectionPoint[] = [];

  for (const { key, rate } of scenarios) {
    const dailyRate = rate / 365;
    let balance = currentAmount;
    const cursor = new Date(now);

    for (let m = 0; m <= months; m++) {
      const label = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;

      if (!series.has(label)) {
        series.set(label, { nominal: 0, optimistic: 0, pessimistic: 0 });
      }
      series.get(label)![key] = balance;

      if (m < months) {
        const days = daysInMonth(cursor.getFullYear(), cursor.getMonth() + 1);
        balance *= Math.pow(1 + dailyRate, days);
        balance += monthlyContribution;
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
  }

  for (const [date, vals] of series) {
    points.push({ date, ...vals, target: targetAmount });
  }

  return points;
}
