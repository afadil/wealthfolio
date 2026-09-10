import { ActivityType, InstrumentType } from "@/lib/constants";
import { roundDecimal } from "@/lib/utils";

// Mirrors Asset::contract_multiplier in assets_model.rs - the app-wide
// multiplier defaults (option 100, everything else 1). Bonds deliberately
// default to 1: provider quotes are stored as a FRACTION of par, so a
// percent-of-par default would double-apply the /100. Percent-of-par is
// opt-in per asset via explicit contractMultiplier metadata.
export function resolveActivityCashMultiplier(
  instrumentType: unknown,
  explicitMultiplier?: unknown,
): number {
  const explicit = Number(explicitMultiplier);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const normalizedType =
    typeof instrumentType === "string" ? instrumentType.trim().toUpperCase() : "";
  return normalizedType === InstrumentType.OPTION ? 100 : 1;
}

interface TradeCashInputs {
  activityType: ActivityType;
  instrumentType: string;
  quantity: unknown;
  unitPrice: unknown;
  fee: unknown;
  tax: unknown;
  contractMultiplier?: unknown;
}

interface StoredTradeAmountInputs extends TradeCashInputs {
  storedAmount: unknown;
}

/**
 * Signed cash effect of a trade: negative is cash out. A BUY is always a
 * debit; a SELL whose charges exceed its proceeds is one too, which is why
 * the sign lives here rather than being re-derived per call site. Mirrors the
 * SELL reversal in economic_events.rs.
 */
export function calculateTradeFinalCash({
  activityType,
  instrumentType,
  quantity,
  unitPrice,
  fee,
  tax,
  contractMultiplier,
}: TradeCashInputs): number | undefined {
  const q = Number(quantity);
  const price = Number(unitPrice);
  if (!(q > 0) || !(price > 0)) return undefined;

  const gross = q * price * resolveActivityCashMultiplier(instrumentType, contractMultiplier);
  const charges = Math.abs(Number(fee) || 0) + Math.abs(Number(tax) || 0);
  const signed = activityType === ActivityType.BUY ? -(gross + charges) : gross - charges;
  // Round the magnitude, then re-apply the sign: roundDecimal breaks ties
  // upward, so rounding the signed value would round a debit and a credit of
  // the same size to different magnitudes.
  const magnitude = roundDecimal(Math.abs(signed));
  return signed < 0 ? -magnitude : magnitude;
}

/**
 * The magnitude a trade's `amount` column stores. Direction is carried by the
 * activity type, so persistence only ever sees the absolute value.
 */
export function calculateTradeFinalAmount(inputs: TradeCashInputs): number | undefined {
  const cash = calculateTradeFinalCash(inputs);
  return cash === undefined ? undefined : Math.abs(cash);
}

/**
 * Whether an existing trade total must remain user-owned when an edit form
 * opens. A matching stored total follows future calculation changes; a
 * different total is authoritative until the user explicitly opts back in.
 */
export function isStoredTradeAmountCustom({
  storedAmount,
  ...cashInputs
}: StoredTradeAmountInputs): boolean {
  if (storedAmount === null || storedAmount === undefined || storedAmount === "") return false;
  const stored = Number(storedAmount);
  if (!Number.isFinite(stored)) return false;

  const calculated = calculateTradeFinalAmount(cashInputs);
  if (calculated === undefined) return true;

  // This only seeds form ownership. Backend persistence applies its
  // currency-scaled tolerance when deciding whether a total needs review.
  return Math.abs(stored - calculated) > 0.005;
}

export function calculateIncomeFinalAmount(
  quantity: unknown,
  unitPrice: unknown,
  instrumentType?: unknown,
  contractMultiplier?: unknown,
): number | undefined {
  const q = Number(quantity);
  const price = Number(unitPrice);
  if (!(q > 0) || !(price > 0)) return undefined;
  // Mirrors calculate_composite_final_cash (economic_events.rs) with the
  // multiplier defaults from Asset::contract_multiplier (assets_model.rs), which
  // includes the asset's unit multiplier.
  return roundDecimal(
    q * price * resolveActivityCashMultiplier(instrumentType, contractMultiplier),
  );
}
