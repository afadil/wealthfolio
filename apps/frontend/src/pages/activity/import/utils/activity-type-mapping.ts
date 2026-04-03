import { ActivityType } from "@/lib/constants";

export function normalizeActivityLabel(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Find the best activity type match for a CSV value.
 * Only explicit user/template mappings count as resolved.
 */
export function findMappedActivityType(
  csvValue: string,
  activityMappings: Record<string, string[]>,
): ActivityType | null {
  const normalized = normalizeActivityLabel(csvValue);

  for (const [activityType, csvValues] of Object.entries(activityMappings)) {
    if (csvValues?.some((v) => normalized === normalizeActivityLabel(v))) {
      return activityType as ActivityType;
    }
  }

  return null;
}
