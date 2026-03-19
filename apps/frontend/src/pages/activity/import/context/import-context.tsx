import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  useRef,
  type ReactNode,
  type Dispatch,
} from "react";
import { checkActivitiesImport, logger } from "@/adapters";
import type { ActivityImport, ImportMappingData } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ImportStep = "upload" | "mapping" | "review" | "confirm" | "result";

export interface ParseConfig {
  hasHeaderRow: boolean;
  headerRowIndex: number;
  delimiter: string; // ",", ";", "\t", "auto"
  skipTopRows: number;
  skipBottomRows: number;
  skipEmptyRows: boolean;
  dateFormat: string; // "auto" | "YYYY-MM-DD" | "DD/MM/YYYY" | etc.
  decimalSeparator: string; // "auto" | "." | ","
  thousandsSeparator: string; // "auto" | "," | "." | " " | "none"
  defaultCurrency: string;
}

export type DraftActivityStatus = "valid" | "warning" | "error" | "skipped" | "duplicate";

export interface DraftActivity {
  rowIndex: number;
  rawRow: string[];

  // Normalized fields
  activityDate: string;
  activityType: string;
  symbol?: string;
  assetId?: string;
  quantity?: string | null;
  unitPrice?: string | null;
  amount?: string | null;
  currency: string;
  fee?: string | null;
  accountId: string;
  comment?: string;
  subtype?: string;
  fxRate?: string | null;
  /** Whether this is an external transfer (for TRANSFER_IN/TRANSFER_OUT) */
  isExternal?: boolean;

  // Enriched by backend check
  exchangeMic?: string;
  symbolName?: string;
  quoteCcy?: string;
  instrumentType?: string;
  quoteMode?: string;

  // Validation state
  status: DraftActivityStatus;
  errors: Record<string, string[]>;
  warnings: Record<string, string[]>;
  skipReason?: string;
  duplicateOfId?: string;
  duplicateOfLineNumber?: number;
  isEdited: boolean;
}

export interface ImportResultStats {
  total: number;
  imported: number;
  skipped: number;
  duplicates: number;
  errors: number;
}

export interface ImportResult {
  success: boolean;
  stats: ImportResultStats;
  importRunId?: string;
  errorMessage?: string;
}

export interface ImportState {
  step: ImportStep;
  file: File | null;
  parseConfig: ParseConfig;
  headers: string[];
  parsedRows: string[][];
  mapping: ImportMappingData | null;
  draftActivities: DraftActivity[];
  duplicates: Record<string, string>; // idempotencyKey -> existingActivityId
  importResult: ImportResult | null;
  accountId: string;
  holdingsCheckPassed: boolean;
  isValidating: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

export const defaultParseConfig: ParseConfig = {
  hasHeaderRow: true,
  headerRowIndex: 0,
  delimiter: "auto",
  skipTopRows: 0,
  skipBottomRows: 0,
  skipEmptyRows: true,
  dateFormat: "auto",
  decimalSeparator: "auto",
  thousandsSeparator: "auto",
  defaultCurrency: "USD",
};

const INITIAL_STATE: ImportState = {
  step: "upload",
  file: null,
  parseConfig: defaultParseConfig,
  headers: [],
  parsedRows: [],
  mapping: null,
  draftActivities: [],
  duplicates: {},
  importResult: null,
  accountId: "",
  holdingsCheckPassed: false,
  isValidating: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

export type ImportAction =
  | { type: "SET_FILE"; payload: File }
  | { type: "SET_ACCOUNT_ID"; payload: string }
  | { type: "SET_PARSE_CONFIG"; payload: Partial<ParseConfig> }
  | { type: "SET_PARSED_DATA"; payload: { headers: string[]; rows: string[][] } }
  | { type: "SET_MAPPING"; payload: ImportMappingData }
  | { type: "SET_DRAFT_ACTIVITIES"; payload: DraftActivity[] }
  | { type: "UPDATE_DRAFT"; payload: { rowIndex: number; updates: Partial<DraftActivity> } }
  | {
      type: "BULK_UPDATE_DRAFTS";
      payload: { rowIndexes: number[]; updates: Partial<DraftActivity> };
    }
  | { type: "SET_DUPLICATES"; payload: Record<string, string> }
  | { type: "SET_IMPORT_RESULT"; payload: ImportResult }
  | { type: "SET_HOLDINGS_CHECK_PASSED"; payload: boolean }
  | { type: "SET_STEP"; payload: ImportStep }
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
  | { type: "SET_IS_VALIDATING"; payload: boolean }
  | { type: "RESET" };

// ─────────────────────────────────────────────────────────────────────────────
// Step Navigation Helpers
// ─────────────────────────────────────────────────────────────────────────────

const STEP_ORDER: ImportStep[] = ["upload", "mapping", "review", "confirm", "result"];

function getNextStep(current: ImportStep): ImportStep {
  const idx = STEP_ORDER.indexOf(current);
  if (idx < STEP_ORDER.length - 1) {
    return STEP_ORDER[idx + 1];
  }
  return current;
}

function getPrevStep(current: ImportStep): ImportStep {
  const idx = STEP_ORDER.indexOf(current);
  if (idx > 0) {
    return STEP_ORDER[idx - 1];
  }
  return current;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────────────────────

function importReducer(state: ImportState, action: ImportAction): ImportState {
  switch (action.type) {
    case "SET_FILE":
      return { ...state, file: action.payload };

    case "SET_ACCOUNT_ID":
      return { ...state, accountId: action.payload };

    case "SET_PARSE_CONFIG":
      return {
        ...state,
        parseConfig: { ...state.parseConfig, ...action.payload },
      };

    case "SET_PARSED_DATA":
      return {
        ...state,
        headers: action.payload.headers,
        parsedRows: action.payload.rows,
      };

    case "SET_MAPPING":
      return { ...state, mapping: action.payload };

    case "SET_DRAFT_ACTIVITIES":
      return { ...state, draftActivities: action.payload };

    case "UPDATE_DRAFT": {
      const { rowIndex, updates } = action.payload;
      return {
        ...state,
        draftActivities: state.draftActivities.map((draft) =>
          draft.rowIndex === rowIndex ? { ...draft, ...updates, isEdited: true } : draft,
        ),
      };
    }

    case "BULK_UPDATE_DRAFTS": {
      const { rowIndexes, updates } = action.payload;
      const indexSet = new Set(rowIndexes);
      return {
        ...state,
        draftActivities: state.draftActivities.map((draft) =>
          indexSet.has(draft.rowIndex) ? { ...draft, ...updates, isEdited: true } : draft,
        ),
      };
    }

    case "SET_DUPLICATES":
      return { ...state, duplicates: action.payload };

    case "SET_IMPORT_RESULT":
      return { ...state, importResult: action.payload };

    case "SET_HOLDINGS_CHECK_PASSED":
      return { ...state, holdingsCheckPassed: action.payload };

    case "SET_STEP":
      return { ...state, step: action.payload };

    case "NEXT_STEP":
      return { ...state, step: getNextStep(state.step) };

    case "PREV_STEP": {
      const prevStepValue = getPrevStep(state.step);
      // Clear draft activities when going back from review to mapping
      // so they get regenerated with the (potentially updated) mappings.
      const clearDrafts = state.step === "review" && prevStepValue === "mapping";
      return {
        ...state,
        step: prevStepValue,
        ...(clearDrafts && { draftActivities: [], isValidating: false }),
      };
    }

    case "SET_IS_VALIDATING":
      return { ...state, isValidating: action.payload };

    case "RESET":
      return { ...INITIAL_STATE };

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

interface ImportContextValue {
  state: ImportState;
  dispatch: Dispatch<ImportAction>;
  validateDrafts: (drafts: DraftActivity[]) => Promise<void>;
}

const ImportContext = createContext<ImportContextValue | null>(null);

// Inline helper — avoids a circular import with draft-utils (which imports DraftActivity from here)
function mergeIssueMaps(
  current: Record<string, string[]>,
  incoming: Record<string, string[]>,
): Record<string, string[]> {
  const merged: Record<string, string[]> = { ...current };
  for (const [key, messages] of Object.entries(incoming)) {
    const existing = merged[key] ?? [];
    const next = [...existing];
    for (const message of messages) {
      if (!next.includes(message)) next.push(message);
    }
    merged[key] = next;
  }
  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

interface ImportProviderProps {
  children: ReactNode;
  initialAccountId?: string;
}

export function ImportProvider({ children, initialAccountId }: ImportProviderProps) {
  const [state, dispatch] = useReducer(importReducer, {
    ...INITIAL_STATE,
    accountId: initialAccountId ?? "",
  });

  const validationRunRef = useRef(0);
  // "Latest ref" pattern — keeps validateDrafts stable while reading current values
  const accountIdRef = useRef(state.accountId);
  accountIdRef.current = state.accountId;
  const defaultCurrencyRef = useRef(state.parseConfig.defaultCurrency);
  defaultCurrencyRef.current = state.parseConfig.defaultCurrency;

  const validateDrafts = useCallback(
    async (drafts: DraftActivity[]) => {
      const run = ++validationRunRef.current;
      dispatch({ type: "SET_IS_VALIDATING", payload: true });
      try {
        const accountId = accountIdRef.current;
        if (!accountId) {
          logger.warn("No account selected - skipping backend validation");
          if (run === validationRunRef.current) {
            dispatch({ type: "SET_DRAFT_ACTIVITIES", payload: drafts });
          }
          return;
        }

        const activitiesToValidate = drafts
          .filter((d) => d.status !== "skipped" && d.activityType)
          .map(
            (draft) =>
              ({
                accountId: draft.accountId || accountId,
                activityType: draft.activityType as ActivityImport["activityType"],
                date: draft.activityDate || "",
                symbol: draft.symbol || "",
                exchangeMic: draft.exchangeMic,
                quoteCcy: draft.quoteCcy,
                instrumentType: draft.instrumentType,
                quoteMode: draft.quoteMode,
                quantity: draft.quantity,
                unitPrice: draft.unitPrice,
                amount: draft.amount,
                currency: draft.currency || defaultCurrencyRef.current,
                fee: draft.fee,
                isDraft: true,
                isValid: draft.status === "valid" || draft.status === "warning",
                lineNumber: draft.rowIndex + 1,
                comment: draft.comment,
                fxRate: draft.fxRate,
                subtype: draft.subtype,
              }) satisfies Partial<ActivityImport>,
          ) as ActivityImport[];

        let updatedDrafts = drafts;
        if (activitiesToValidate.length > 0) {
          const validated = await checkActivitiesImport({
            accountId,
            activities: activitiesToValidate,
          });
          if (run !== validationRunRef.current) {
            return;
          }

          updatedDrafts = drafts.map((draft) => {
            const backendResult = validated.find((v) => v.lineNumber === draft.rowIndex + 1);
            if (!backendResult) {
              return {
                ...draft,
                accountId: draft.accountId || accountId,
                duplicateOfId: undefined,
                duplicateOfLineNumber: undefined,
              };
            }

            const backendErrors: Record<string, string[]> = {};
            if (backendResult.errors) {
              for (const [key, value] of Object.entries(backendResult.errors)) {
                backendErrors[key] = Array.isArray(value) ? value : [String(value)];
              }
            }
            const backendWarnings: Record<string, string[]> = {};
            if (backendResult.warnings) {
              for (const [key, value] of Object.entries(backendResult.warnings)) {
                backendWarnings[key] = Array.isArray(value) ? value : [String(value)];
              }
            }
            if (!backendResult.isValid && Object.keys(backendErrors).length === 0) {
              backendErrors.general = ["Validation failed"];
            }

            const mergedErrors = mergeIssueMaps(draft.errors || {}, backendErrors);
            const retainedWarnings = { ...(draft.warnings || {}) };
            delete retainedWarnings._duplicate;
            const mergedWarnings = mergeIssueMaps(retainedWarnings, backendWarnings);
            const hasErrors = Object.keys(mergedErrors).length > 0;
            const hasWarnings = Object.keys(mergedWarnings).length > 0;

            return {
              ...draft,
              accountId: draft.accountId || accountId,
              errors: mergedErrors,
              warnings: mergedWarnings,
              duplicateOfId: backendResult.duplicateOfId,
              duplicateOfLineNumber: backendResult.duplicateOfLineNumber,
              symbolName: backendResult.symbolName,
              exchangeMic: backendResult.exchangeMic,
              quoteCcy: backendResult.quoteCcy,
              instrumentType: backendResult.instrumentType,
              status:
                draft.status === "skipped"
                  ? draft.status
                  : hasErrors
                    ? "error"
                    : hasWarnings
                      ? "warning"
                      : "valid",
            } as DraftActivity;
          });
        }
        if (run === validationRunRef.current) {
          dispatch({ type: "SET_DRAFT_ACTIVITIES", payload: updatedDrafts });
        }
      } catch (error) {
        logger.error(`Backend validation failed: ${error}`);
        if (run === validationRunRef.current) {
          dispatch({ type: "SET_DRAFT_ACTIVITIES", payload: drafts });
        }
      } finally {
        if (run === validationRunRef.current) {
          dispatch({ type: "SET_IS_VALIDATING", payload: false });
        }
      }
    },
    [dispatch],
  );

  return (
    <ImportContext.Provider value={{ state, dispatch, validateDrafts }}>
      {children}
    </ImportContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hook to access the full import context (state and dispatch).
 * Throws if used outside ImportProvider.
 */
export function useImportContext(): ImportContextValue {
  const ctx = useContext(ImportContext);
  if (!ctx) {
    throw new Error("useImportContext must be used within ImportProvider");
  }
  return ctx;
}

/**
 * Hook to access only the import state.
 * Useful for components that only need to read state.
 */
export function useImportState(): ImportState {
  const { state } = useImportContext();
  return state;
}

/**
 * Hook to access only the dispatch function.
 * Useful for components that only need to dispatch actions.
 */
export function useImportDispatch(): Dispatch<ImportAction> {
  const { dispatch } = useImportContext();
  return dispatch;
}
