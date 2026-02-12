import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from "react";
import type { ImportMappingData } from "@/lib/types";

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
  | { type: "SET_STEP"; payload: ImportStep }
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
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

    case "SET_STEP":
      return { ...state, step: action.payload };

    case "NEXT_STEP":
      return { ...state, step: getNextStep(state.step) };

    case "PREV_STEP":
      return { ...state, step: getPrevStep(state.step) };

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
}

const ImportContext = createContext<ImportContextValue | null>(null);

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

  return <ImportContext.Provider value={{ state, dispatch }}>{children}</ImportContext.Provider>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hook to access the full import context (state and dispatch).
 * Throws if used outside ImportProvider.
 */
export function useImportContext(): ImportContextValue {
  const context = useContext(ImportContext);
  if (!context) {
    throw new Error("useImportContext must be used within ImportProvider");
  }
  return context;
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
