import { sumAmounts } from "@/lib/amount-math";

export type ReturnType = "daily" | "pnl" | "return";

interface BaseHoldingPerformanceAmounts {
  costBasisBase?: number | null;
  totalGainBase?: number | null;
  totalReturnBase?: number | null;
  returnBasisBase?: number | null;
}

export interface BasePortfolioPerformance {
  totalPnl: number;
  totalPnlPct: number | null;
  totalReturn: number;
  totalReturnPct: number | null;
}

interface DailyHoldingPerformanceAmounts {
  dayChangePct?: number | null;
  marketValueBase: number;
}

export interface DailyPortfolioPerformance {
  changeAmount: number;
  changePct: number | null;
}

function percentageFromGrossBasis(amount: number, grossBasis: number): number | null {
  if (grossBasis > 0) return amount / grossBasis;
  return amount === 0 ? 0 : null;
}

export function calculateBasePortfolioPerformance(
  holdings: BaseHoldingPerformanceAmounts[],
): BasePortfolioPerformance {
  let basis = 0;
  let hasUnbasedPnl = false;
  let hasUnbasedReturn = false;

  holdings.forEach((holding) => {
    const holdingBasis = Math.abs(holding.returnBasisBase ?? holding.costBasisBase ?? 0);
    const holdingPnl = holding.totalGainBase ?? 0;
    const holdingReturn = holding.totalReturnBase ?? holding.totalGainBase ?? 0;

    basis += holdingBasis;
    hasUnbasedPnl ||= holdingBasis === 0 && holdingPnl !== 0;
    hasUnbasedReturn ||= holdingBasis === 0 && holdingReturn !== 0;
  });

  const totalPnl = sumAmounts(holdings.map((holding) => holding.totalGainBase ?? 0));
  const totalReturn = sumAmounts(
    holdings.map((holding) => holding.totalReturnBase ?? holding.totalGainBase ?? 0),
  );

  return {
    totalPnl,
    totalPnlPct: hasUnbasedPnl ? null : percentageFromGrossBasis(totalPnl, basis),
    totalReturn,
    totalReturnPct: hasUnbasedReturn ? null : percentageFromGrossBasis(totalReturn, basis),
  };
}

export function calculateDailyPortfolioPerformance(
  holdings: DailyHoldingPerformanceAmounts[],
): DailyPortfolioPerformance {
  let grossExposure = 0;
  const changes: number[] = [];
  let hasDailyPerformance = false;

  holdings.forEach((holding) => {
    if (holding.dayChangePct == null) return;

    const exposure = Math.abs(holding.marketValueBase);
    hasDailyPerformance = true;
    grossExposure += exposure;
    changes.push(exposure * holding.dayChangePct);
  });

  const changeAmount = sumAmounts(changes);

  return {
    changeAmount,
    changePct: grossExposure > 0 ? changeAmount / grossExposure : hasDailyPerformance ? 0 : null,
  };
}

export function getPortfolioChangePercent(
  returnType: ReturnType,
  dailyChangePct: number | null,
  totalPnlPct: number | null,
  totalReturnPct: number | null,
): number | null {
  if (returnType === "daily") return dailyChangePct;
  return returnType === "return" ? totalReturnPct : totalPnlPct;
}
