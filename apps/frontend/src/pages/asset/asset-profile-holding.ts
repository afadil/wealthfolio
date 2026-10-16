import type { Holding, MonetaryValue } from "@/lib/types";
import { amountDifference, sumAmounts } from "@/lib/amount-math";

// Holdings lists keep open and closed positions separate. The asset overview
// shows the current position with lifetime metrics across both lifecycle rows.
export function getAssetProfileHolding(holdings: Holding[], assetId: string): Holding | null {
  const positions = holdings.filter(
    (holding) => holding.instrument?.id === assetId || holding.id === assetId,
  );
  const current = positions.find((holding) => !holding.isClosed) ?? positions[0];
  if (!current) return null;
  if (positions.length === 1) return current;

  const sum = (
    field: "income" | "realizedGain" | "totalGain" | "totalReturn" | "returnBasis",
  ): MonetaryValue | null => {
    const values = positions.flatMap((holding) => (holding[field] ? [holding[field]] : []));
    if (values.length === 0) return null;
    return {
      local: sumAmounts(values.map((value) => Number(value.local))),
      base: sumAmounts(values.map((value) => Number(value.base))),
    };
  };
  const percentage = (value: MonetaryValue | null, basis: number): number | null => {
    if (value == null) return null;
    return basis !== 0 ? value.local / Math.abs(basis) : value.local === 0 ? 0 : null;
  };

  const income = sum("income");
  const realizedGain = sum("realizedGain");
  const totalGain = sum("totalGain");
  const totalReturn = sum("totalReturn");
  const returnBasis = sum("returnBasis");
  const basis = returnBasis?.local ?? 0;

  return {
    ...current,
    income,
    realizedGain,
    realizedGainPct: percentage(
      realizedGain,
      amountDifference(basis, Number(current.costBasis?.local ?? 0)),
    ),
    totalGain,
    totalGainPct: percentage(totalGain, basis),
    totalReturn,
    totalReturnPct: percentage(totalReturn, basis),
    returnBasis,
  };
}
