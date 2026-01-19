import type { PickerActivityType } from "../config/activity-form-config";

/**
 * Maps a database activity type to the picker activity type.
 * TRANSFER_IN/TRANSFER_OUT are merged into TRANSFER for the picker UI.
 */
export function mapActivityTypeToPicker(activityType?: string | null): PickerActivityType | undefined {
  if (!activityType) return undefined;
  if (activityType === "TRANSFER_IN" || activityType === "TRANSFER_OUT") {
    return "TRANSFER";
  }
  return activityType as PickerActivityType;
}

/**
 * Checks if the activity type is a pure cash activity (no asset involved).
 * Used to determine if account currency should be included in payload.
 */
export function isPureCashActivity(activityType: string): boolean {
  return ["DEPOSIT", "WITHDRAWAL", "FEE", "INTEREST", "TAX"].includes(activityType);
}
