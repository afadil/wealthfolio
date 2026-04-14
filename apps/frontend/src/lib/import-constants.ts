/**
 * CSV import kind identifiers (no i18n / no zod) — safe to import from adapters during boot.
 */
export const ImportType = {
  ACTIVITY: "CSV_ACTIVITY",
  HOLDINGS: "CSV_HOLDINGS",
} as const;
export type ImportType = (typeof ImportType)[keyof typeof ImportType];
