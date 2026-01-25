import type { ImportMappingData } from "@/lib/types";
import type {
  ImportAction,
  ImportStep,
  ParseConfig,
  DraftActivity,
  ImportResult,
} from "./import-context";

// ─────────────────────────────────────────────────────────────────────────────
// Action Creators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set the file to be imported.
 */
export function setFile(file: File): ImportAction {
  return { type: "SET_FILE", payload: file };
}

/**
 * Set the target account ID for the import.
 */
export function setAccountId(accountId: string): ImportAction {
  return { type: "SET_ACCOUNT_ID", payload: accountId };
}

/**
 * Update parse configuration options.
 * Accepts partial config - only specified fields will be updated.
 */
export function setParseConfig(config: Partial<ParseConfig>): ImportAction {
  return { type: "SET_PARSE_CONFIG", payload: config };
}

/**
 * Set parsed CSV data (headers and rows).
 */
export function setParsedData(headers: string[], rows: string[][]): ImportAction {
  return { type: "SET_PARSED_DATA", payload: { headers, rows } };
}

/**
 * Set the import mapping configuration.
 */
export function setMapping(mapping: ImportMappingData): ImportAction {
  return { type: "SET_MAPPING", payload: mapping };
}

/**
 * Set all draft activities (typically after initial validation).
 */
export function setDraftActivities(activities: DraftActivity[]): ImportAction {
  return { type: "SET_DRAFT_ACTIVITIES", payload: activities };
}

/**
 * Update a single draft activity by row index.
 */
export function updateDraft(
  rowIndex: number,
  updates: Partial<DraftActivity>,
): ImportAction {
  return { type: "UPDATE_DRAFT", payload: { rowIndex, updates } };
}

/**
 * Update multiple draft activities at once.
 * Useful for bulk operations like "skip selected" or "set currency".
 */
export function bulkUpdateDrafts(
  rowIndexes: number[],
  updates: Partial<DraftActivity>,
): ImportAction {
  return { type: "BULK_UPDATE_DRAFTS", payload: { rowIndexes, updates } };
}

/**
 * Set duplicate information.
 * Maps idempotency keys to existing activity IDs.
 */
export function setDuplicates(duplicates: Record<string, string>): ImportAction {
  return { type: "SET_DUPLICATES", payload: duplicates };
}

/**
 * Set the final import result.
 */
export function setImportResult(result: ImportResult): ImportAction {
  return { type: "SET_IMPORT_RESULT", payload: result };
}

/**
 * Navigate to a specific step.
 */
export function setStep(step: ImportStep): ImportAction {
  return { type: "SET_STEP", payload: step };
}

/**
 * Navigate to the next step in the wizard.
 */
export function nextStep(): ImportAction {
  return { type: "NEXT_STEP" };
}

/**
 * Navigate to the previous step in the wizard.
 */
export function prevStep(): ImportAction {
  return { type: "PREV_STEP" };
}

/**
 * Reset the entire import state to initial values.
 */
export function reset(): ImportAction {
  return { type: "RESET" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Action Creators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Skip a single draft activity with a reason.
 */
export function skipDraft(rowIndex: number, reason?: string): ImportAction {
  return updateDraft(rowIndex, {
    status: "skipped",
    skipReason: reason ?? "Skipped by user",
  });
}

/**
 * Unskip a draft activity (set back to valid status).
 * Note: Actual status should be re-validated after unskipping.
 */
export function unskipDraft(rowIndex: number): ImportAction {
  return updateDraft(rowIndex, {
    status: "valid",
    skipReason: undefined,
  });
}

/**
 * Skip multiple draft activities.
 */
export function bulkSkipDrafts(rowIndexes: number[], reason?: string): ImportAction {
  return bulkUpdateDrafts(rowIndexes, {
    status: "skipped",
    skipReason: reason ?? "Skipped by user",
  });
}

/**
 * Unskip multiple draft activities.
 */
export function bulkUnskipDrafts(rowIndexes: number[]): ImportAction {
  return bulkUpdateDrafts(rowIndexes, {
    status: "valid",
    skipReason: undefined,
  });
}

/**
 * Set currency for multiple draft activities.
 */
export function bulkSetCurrency(rowIndexes: number[], currency: string): ImportAction {
  return bulkUpdateDrafts(rowIndexes, { currency });
}

/**
 * Set account for multiple draft activities.
 */
export function bulkSetAccount(rowIndexes: number[], accountId: string): ImportAction {
  return bulkUpdateDrafts(rowIndexes, { accountId });
}
