import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DataGrid,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  useDataGrid,
} from "@wealthfolio/ui";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@wealthfolio/ui/components/ui/tooltip";
import { useMemo, useState, useCallback } from "react";
import { searchTicker } from "@/adapters";
import { saveActivities, updateToolResult } from "@/adapters";
import { CreateCustomAssetDialog } from "@/components/create-custom-asset-dialog";
import type { SymbolSearchResult } from "@wealthfolio/ui";
import type {
  ImportCsvArgs,
  ImportCsvOutput,
  ImportCsvActivityDraft,
  ImportCsvCleaningAction,
  ImportCsvValidationSummary,
  ImportCsvAccountOption,
  ImportCsvMappingData,
} from "../../types";
import { useRuntimeContext } from "../../hooks/use-runtime-context";

// ============================================================================
// Local Transaction Type for DataGrid
// ============================================================================

interface ImportLocalTransaction {
  id: string;
  tempId: string;
  isNew: boolean;
  accountId?: string;
  activityType?: string;
  subtype?: string;
  /** Whether this is an external transfer (for TRANSFER_IN/TRANSFER_OUT) */
  isExternal?: boolean;
  /** Activity date as string (ISO format) - aligned with DraftActivity */
  activityDate?: string;
  /** Symbol - aligned with DraftActivity */
  symbol?: string;
  /** Resolved exchange MIC for the symbol */
  exchangeMic?: string;
  quantity?: string | number | null;
  unitPrice?: string | number | null;
  amount?: string | number | null;
  fee?: string | number | null;
  fxRate?: string | number | null;
  currency?: string;
  comment?: string;
  // Row index for display
  rowIndex: number;
  // Validation
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Backend Response Normalizer
// ============================================================================

interface BackendActivityDraft {
  row_number?: number;
  rowNumber?: number;
  activity_type?: string;
  activityType?: string;
  activity_date?: string;
  activityDate?: string;
  symbol?: string;
  exchange_mic?: string;
  exchangeMic?: string;
  quantity?: string | number | null;
  unit_price?: string | number | null;
  unitPrice?: string | number | null;
  amount?: string | number | null;
  fee?: string | number | null;
  fx_rate?: string | number | null;
  fxRate?: string | number | null;
  subtype?: string;
  currency?: string;
  notes?: string;
  comment?: string;
  account_id?: string;
  accountId?: string;
  is_valid?: boolean;
  isValid?: boolean;
  errors?: string[];
  warnings?: string[];
}

function normalizeDecimal(value: unknown): string | number | null | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  return undefined;
}

function normalizeActivityDraft(raw: BackendActivityDraft, index: number): ImportCsvActivityDraft {
  const errors = raw.errors ?? [];
  const warnings = raw.warnings ?? [];
  const isValid = raw.is_valid ?? raw.isValid ?? errors.length === 0;

  let validationStatus: "valid" | "warning" | "error" = "valid";
  if (!isValid || errors.length > 0) {
    validationStatus = "error";
  } else if (warnings.length > 0) {
    validationStatus = "warning";
  }

  return {
    tempId: `import-${index}`,
    isNew: true,
    accountId: raw.account_id ?? raw.accountId,
    activityType: raw.activity_type ?? raw.activityType,
    activityDate: raw.activity_date ?? raw.activityDate,
    symbol: raw.symbol,
    exchangeMic: raw.exchange_mic ?? raw.exchangeMic,
    quantity: normalizeDecimal(raw.quantity),
    unitPrice: normalizeDecimal(raw.unit_price ?? raw.unitPrice),
    amount: normalizeDecimal(raw.amount),
    fee: normalizeDecimal(raw.fee),
    fxRate: normalizeDecimal(raw.fx_rate ?? raw.fxRate),
    currency: raw.currency,
    comment: raw.notes ?? raw.comment,
    subtype: raw.subtype,
    validationStatus,
    validationErrors: [...errors, ...warnings],
    sourceRow: raw.row_number ?? raw.rowNumber ?? index + 1,
  };
}

function normalizeCleaningAction(raw: Record<string, unknown>): ImportCsvCleaningAction {
  return {
    type: (raw.action_type ?? raw.actionType ?? raw.type) as ImportCsvCleaningAction["type"],
    description: (raw.description as string) ?? "",
    affectedRows: (raw.affected_rows ?? raw.affectedRows) as number | undefined,
  };
}

function normalizeValidation(raw: Record<string, unknown>): ImportCsvValidationSummary {
  return {
    totalRows: (raw.total_rows ?? raw.totalRows ?? 0) as number,
    validRows: (raw.valid_rows ?? raw.validRows ?? 0) as number,
    warningRows: (raw.warning_rows ?? raw.warningRows ?? 0) as number,
    errorRows: (raw.error_rows ?? raw.errorRows ?? 0) as number,
    errors: [],
    globalErrors: (raw.global_errors ?? raw.globalErrors) as string[] | undefined,
  };
}

function normalizeAccount(raw: Record<string, unknown>): ImportCsvAccountOption {
  return {
    id: (raw.id as string) ?? "",
    name: (raw.name as string) ?? "",
    currency: (raw.currency as string) ?? "USD",
  };
}

function normalizeMapping(raw: Record<string, unknown>): ImportCsvMappingData {
  // Handle both snake_case and camelCase
  return {
    accountId: (raw.account_id ?? raw.accountId) as string | undefined,
    name: raw.name as string | undefined,
    fieldMappings: (raw.field_mappings ?? raw.fieldMappings ?? {}) as Record<string, string>,
    activityMappings: (raw.activity_mappings ?? raw.activityMappings ?? {}) as Record<
      string,
      string[]
    >,
    symbolMappings: (raw.symbol_mappings ?? raw.symbolMappings ?? {}) as Record<string, string>,
    accountMappings: (raw.account_mappings ?? raw.accountMappings ?? {}) as Record<string, string>,
    parseConfig: (raw.parse_config ?? raw.parseConfig) as ImportCsvMappingData["parseConfig"],
  };
}

function normalizeResult(result: unknown): ImportCsvOutput | null {
  if (!result) return null;

  if (typeof result === "string") {
    try {
      return normalizeResult(JSON.parse(result));
    } catch {
      return null;
    }
  }

  if (typeof result !== "object" || result === null) return null;

  const candidate = result as Record<string, unknown>;

  if ("data" in candidate && typeof candidate.data === "object") {
    return normalizeResult(candidate.data);
  }

  const activitiesRaw = Array.isArray(candidate.activities) ? candidate.activities : [];
  const activities = activitiesRaw.map((a: BackendActivityDraft, i: number) =>
    normalizeActivityDraft(a, i),
  );

  // Handle applied_mapping (new format)
  const mappingRaw = (candidate.applied_mapping ?? candidate.appliedMapping ?? {}) as Record<
    string,
    unknown
  >;
  const appliedMapping = normalizeMapping(mappingRaw);

  const cleaningRaw = Array.isArray(candidate.cleaning_actions ?? candidate.cleaningActions)
    ? (candidate.cleaning_actions ?? candidate.cleaningActions)
    : [];
  const cleaningActions = (cleaningRaw as Record<string, unknown>[]).map(normalizeCleaningAction);

  const validationRaw = (candidate.validation ?? {}) as Record<string, unknown>;
  const validation = normalizeValidation(validationRaw);

  const accountsRaw = Array.isArray(candidate.available_accounts ?? candidate.availableAccounts)
    ? (candidate.available_accounts ?? candidate.availableAccounts)
    : [];
  const availableAccounts = (accountsRaw as Record<string, unknown>[]).map(normalizeAccount);

  const detectedHeaders = Array.isArray(candidate.detected_headers ?? candidate.detectedHeaders)
    ? ((candidate.detected_headers ?? candidate.detectedHeaders) as string[])
    : undefined;

  return {
    activities,
    appliedMapping,
    cleaningActions,
    validation,
    availableAccounts,
    detectedHeaders,
    totalRows: (candidate.total_rows ?? candidate.totalRows) as number | undefined,
    truncated: candidate.truncated as boolean | undefined,
    usedSavedProfile: (candidate.used_saved_profile ?? candidate.usedSavedProfile) as
      | boolean
      | undefined,
    submitted: candidate.submitted as boolean | undefined,
    createdActivityIds: (candidate.created_activity_ids ?? candidate.createdActivityIds) as
      | string[]
      | undefined,
    submittedAt: (candidate.submitted_at ?? candidate.submittedAt) as string | undefined,
  };
}

// ============================================================================
// Convert to LocalTransaction for DataGrid
// ============================================================================

function toLocalTransaction(draft: ImportCsvActivityDraft, index: number): ImportLocalTransaction {
  const draftAny = draft as unknown as Record<string, unknown>;
  return {
    id: draft.tempId,
    tempId: draft.tempId,
    isNew: true,
    accountId: draft.accountId,
    activityType: draft.activityType,
    subtype: draft.subtype ?? (draftAny.subtype as string | undefined),
    isExternal: draftAny.isExternal as boolean | undefined,
    activityDate: draft.activityDate,
    symbol: draft.symbol,
    exchangeMic: draft.exchangeMic,
    quantity: draft.quantity,
    unitPrice: draft.unitPrice,
    amount: draft.amount,
    fee: draft.fee,
    fxRate: draft.fxRate ?? (draftAny.fxRate as string | number | null | undefined),
    currency: draft.currency,
    comment: draft.comment,
    rowIndex: index,
    isValid: draft.validationStatus !== "error",
    errors:
      draft.validationErrors?.filter(
        (_, i) => i < (draft.validationStatus === "error" ? Infinity : 0),
      ) ?? [],
    warnings: draft.validationStatus === "warning" ? (draft.validationErrors ?? []) : [],
  };
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function ImportCsvLoadingSkeleton() {
  return (
    <Card className="bg-muted/40 border-primary/10">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-20" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-32 w-full" />
        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Success State
// ============================================================================

interface SuccessStateProps {
  activityCount: number;
}

function SuccessState({ activityCount }: SuccessStateProps) {
  return (
    <Card className="bg-muted/40 border-success/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Icons.CheckCircle className="text-success h-5 w-5" />
          <CardTitle className="text-base">Import Complete</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Successfully imported <span className="text-foreground font-medium">{activityCount}</span>{" "}
          activities.
        </p>
        <Button variant="outline" size="sm" onClick={() => window.open("/activities", "_blank")}>
          <Icons.ExternalLink className="mr-2 h-4 w-4" />
          View Activities
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Mapping Quality Badge
// ============================================================================

interface MappingQualityBadgeProps {
  mapping: ImportCsvMappingData;
  usedSavedProfile?: boolean;
}

function MappingQualityBadge({ mapping, usedSavedProfile }: MappingQualityBadgeProps) {
  // Calculate quality from number of mapped fields (out of 6 core fields)
  const coreFields = ["date", "activityType", "symbol", "quantity", "unitPrice", "amount"];
  const mappedCount = coreFields.filter(
    (f) => mapping.fieldMappings?.[f] && mapping.fieldMappings[f].length > 0,
  ).length;
  const quality = mappedCount / coreFields.length;

  let className = "";
  let label = "";

  if (usedSavedProfile) {
    className = "bg-blue-500/10 text-blue-500 border-blue-500/30";
    label = "Saved profile";
  } else if (quality >= 0.8) {
    className = "bg-success/10 text-success border-success/30";
    label = `${mappedCount}/${coreFields.length} fields mapped`;
  } else if (quality >= 0.5) {
    className = "bg-warning/10 text-warning border-warning/30";
    label = `${mappedCount}/${coreFields.length} fields mapped`;
  } else {
    className = "bg-destructive/10 text-destructive border-destructive/30";
    label = `${mappedCount}/${coreFields.length} fields mapped`;
  }

  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}

// ============================================================================
// Cleaning Actions Summary
// ============================================================================

interface CleaningActionsSummaryProps {
  actions: ImportCsvCleaningAction[];
}

function CleaningActionsSummary({ actions }: CleaningActionsSummaryProps) {
  if (actions.length === 0) return null;

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground w-full justify-between px-2"
        >
          <span className="flex items-center gap-2">
            <Icons.Sparkles className="h-4 w-4" />
            <span className="text-xs">
              {actions.length} auto-cleaning action{actions.length > 1 ? "s" : ""} applied
            </span>
          </span>
          <Icons.ChevronDown className="h-4 w-4" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-2 pt-2">
        <ul className="text-muted-foreground space-y-1 text-xs">
          {actions.map((action, i) => (
            <li key={i} className="flex items-start gap-2">
              <Icons.Check className="text-success mt-0.5 h-3 w-3" />
              <span>{action.description}</span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// Validation Summary
// ============================================================================

interface ValidationSummaryProps {
  validation: ImportCsvValidationSummary;
}

function ValidationSummaryBadges({ validation }: ValidationSummaryProps) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Badge variant="outline" className="bg-success/10 text-success border-success/30">
        {validation.validRows} valid
      </Badge>
      {validation.warningRows > 0 && (
        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
          {validation.warningRows} warnings
        </Badge>
      )}
      {validation.errorRows > 0 && (
        <Badge
          variant="outline"
          className="bg-destructive/10 text-destructive border-destructive/30"
        >
          {validation.errorRows} errors
        </Badge>
      )}
    </div>
  );
}

// ============================================================================
// Import Data Grid Columns (uses shared columns from import-columns.tsx)
// ============================================================================

import { useImportColumns } from "@/pages/activity/import/components/import-columns";

// ============================================================================
// Main Import Form with DataGrid
// ============================================================================

interface ImportFormProps {
  data: ImportCsvOutput;
  toolCallId?: string;
  onSuccess: (createdIds: string[]) => void;
}

function ImportForm({ data, toolCallId, onSuccess }: ImportFormProps) {
  const runtime = useRuntimeContext();
  const threadId = runtime.currentThreadId;

  // Convert drafts to local transactions
  const initialTransactions = useMemo(
    () => data.activities.map((draft, index) => toLocalTransaction(draft, index)),
    [data.activities],
  );

  const [transactions, setTransactions] = useState<ImportLocalTransaction[]>(initialTransactions);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(
    data.activities[0]?.accountId ??
      (data.availableAccounts.length === 1 ? data.availableAccounts[0].id : undefined),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Custom asset dialog state
  const [customAssetDialog, setCustomAssetDialog] = useState<{
    open: boolean;
    rowIndex: number;
    symbol: string;
  }>({ open: false, rowIndex: -1, symbol: "" });

  // Get fallback currency from selected account or first available
  const fallbackCurrency = useMemo(() => {
    if (selectedAccountId) {
      const account = data.availableAccounts.find((a) => a.id === selectedAccountId);
      if (account) return account.currency;
    }
    return data.availableAccounts[0]?.currency ?? "USD";
  }, [selectedAccountId, data.availableAccounts]);

  // Symbol selection handler - update transaction with symbol and currency from search result
  const handleSymbolSelect = useCallback(
    (rowIndex: number, _symbol: string, result?: SymbolSearchResult) => {
      if (!result) return;

      setTransactions((prev) => {
        const updated = [...prev];
        if (updated[rowIndex]) {
          const row = updated[rowIndex];
          const currency = result.currency ?? row.currency ?? fallbackCurrency;
          updated[rowIndex] = {
            ...row,
            symbol: result.symbol,
            exchangeMic: result.exchangeMic,
            currency,
          };
        }
        return updated;
      });
    },
    [fallbackCurrency],
  );

  // Request to create a custom asset - opens the dialog
  const handleCreateCustomAsset = useCallback((rowIndex: number, symbol: string) => {
    setCustomAssetDialog({ open: true, rowIndex, symbol });
  }, []);

  // Handle custom asset created from dialog
  const handleCustomAssetCreated = useCallback(
    (result: SymbolSearchResult) => {
      const { rowIndex } = customAssetDialog;
      if (rowIndex < 0) return;

      setTransactions((prev) => {
        const updated = [...prev];
        if (updated[rowIndex]) {
          const row = updated[rowIndex];
          const currency = result.currency ?? row.currency ?? fallbackCurrency;
          updated[rowIndex] = {
            ...row,
            symbol: result.symbol,
            exchangeMic: result.exchangeMic,
            currency,
          };
        }
        return updated;
      });

      setCustomAssetDialog({ open: false, rowIndex: -1, symbol: "" });
    },
    [customAssetDialog, fallbackCurrency],
  );

  // Symbol search handler
  const handleSymbolSearch = useCallback(async (query: string): Promise<SymbolSearchResult[]> => {
    const results = await searchTicker(query);
    return results.map((result) => ({
      symbol: result.symbol,
      shortName: result.shortName,
      longName: result.longName,
      exchange: result.exchange,
      exchangeMic: result.exchangeMic,
      currency: result.currency,
      score: result.score,
      dataSource: result.dataSource,
    }));
  }, []);

  // Status cell renderer for validation display
  const renderStatusCell = useCallback((row: ImportLocalTransaction) => {
    const { isValid, errors, warnings, rowIndex } = row;
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground w-5 text-xs">{rowIndex + 1}</span>
        {isValid && warnings.length === 0 && <Icons.CheckCircle className="text-success h-4 w-4" />}
        {!isValid && (
          <Tooltip>
            <TooltipTrigger>
              <Icons.AlertCircle className="text-destructive h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>{errors.join(", ")}</TooltipContent>
          </Tooltip>
        )}
        {isValid && warnings.length > 0 && (
          <Tooltip>
            <TooltipTrigger>
              <Icons.AlertTriangle className="text-warning h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>{warnings.join(", ")}</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }, []);

  const columns = useImportColumns<ImportLocalTransaction>({
    accounts: data.availableAccounts,
    onSymbolSearch: handleSymbolSearch,
    onSymbolSelect: handleSymbolSelect,
    onCreateCustomAsset: handleCreateCustomAsset,
    enableSelection: false,
    enableStatusColumn: true,
    renderStatusCell,
  });

  const validCount = useMemo(() => transactions.filter((t) => t.isValid).length, [transactions]);
  const errorCount = useMemo(() => transactions.filter((t) => !t.isValid).length, [transactions]);
  const canSubmit = validCount > 0 && selectedAccountId;

  // Handle account change - update all transactions
  const handleAccountChange = useCallback((accountId: string) => {
    setSelectedAccountId(accountId);
    setTransactions((prev) => prev.map((t) => ({ ...t, accountId })));
  }, []);

  // Handle data changes from DataGrid
  const onDataChange = useCallback((nextData: ImportLocalTransaction[]) => {
    setTransactions(nextData);
  }, []);

  // DataGrid setup
  const dataGrid = useDataGrid<ImportLocalTransaction>({
    data: transactions,
    columns,
    getRowId: (row) => row.id,
    enableRowSelection: false,
    enableSorting: false,
    enableColumnFilters: false,
    enableSearch: false,
    enablePaste: true,
    onDataChange,
    initialState: {
      columnVisibility: {
        subtype: false, // Hidden by default
        isExternal: true,
      },
    },
  });

  const handleSubmit = useCallback(async () => {
    if (!selectedAccountId) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Filter out error rows and prepare payloads
      const validTransactions = transactions.filter((t) => t.isValid);

      const creates = validTransactions.map((t) => ({
        id: t.tempId,
        accountId: selectedAccountId,
        activityType: t.activityType ?? "BUY",
        subtype: t.subtype,
        isExternal: t.isExternal,
        activityDate: t.activityDate ?? new Date().toISOString(),
        asset: t.symbol ? { symbol: t.symbol, exchangeMic: t.exchangeMic } : undefined,
        quantity: t.quantity,
        unitPrice: t.unitPrice,
        amount: t.amount,
        fee: t.fee,
        fxRate: t.fxRate,
        currency: t.currency,
        comment: t.comment,
      }));

      const result = await saveActivities({
        creates,
        updates: [],
        deleteIds: [],
      });

      const createdIds = result.created?.map((c) => c.id) ?? [];

      // Update tool result in DB
      if (threadId && toolCallId) {
        try {
          await updateToolResult({
            threadId,
            toolCallId,
            resultPatch: {
              submitted: true,
              createdActivityIds: createdIds,
              submittedAt: new Date().toISOString(),
            },
          });
        } catch (e) {
          console.error("Failed to update tool result:", e);
        }
      }

      onSuccess(createdIds);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to import activities");
    } finally {
      setIsSubmitting(false);
    }
  }, [transactions, selectedAccountId, threadId, toolCallId, onSuccess]);

  return (
    <Card className="bg-muted/40 border-primary/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icons.FileSpreadsheet className="text-primary h-5 w-5" />
            <CardTitle className="text-base">CSV Import Preview</CardTitle>
            <MappingQualityBadge
              mapping={data.appliedMapping}
              usedSavedProfile={data.usedSavedProfile}
            />
          </div>
          <ValidationSummaryBadges validation={data.validation} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cleaning actions summary */}
        <CleaningActionsSummary actions={data.cleaningActions} />

        {/* Account selector */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Target account:</span>
          <Select value={selectedAccountId ?? ""} onValueChange={handleAccountChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {data.availableAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name} ({account.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Truncation warning */}
        {data.truncated && (
          <div className="border-warning/50 bg-warning/10 text-warning flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <Icons.AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              CSV was truncated. Showing first {transactions.length} of {data.totalRows} rows.
            </span>
          </div>
        )}

        {/* DataGrid */}
        <div className="overflow-hidden rounded-md border">
          <DataGrid
            {...dataGrid}
            height={Math.min(400, 50 + transactions.length * 36)}
            stretchColumns
          />
        </div>

        {/* Error message */}
        {submitError && (
          <div className="border-destructive/50 bg-destructive/10 text-destructive flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <Icons.AlertCircle className="h-4 w-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-muted-foreground text-xs">
            {errorCount > 0 && (
              <span className="text-destructive">
                {errorCount} row{errorCount > 1 ? "s" : ""} with errors will be skipped
              </span>
            )}
          </div>
          <Button onClick={handleSubmit} disabled={isSubmitting || !canSubmit}>
            {isSubmitting ? (
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Icons.Download className="mr-2 h-4 w-4" />
            )}
            Import {validCount} Activities
          </Button>
        </div>

        {/* Custom asset creation dialog */}
        <CreateCustomAssetDialog
          open={customAssetDialog.open}
          onOpenChange={(open) => {
            if (!open) {
              setCustomAssetDialog({ open: false, rowIndex: -1, symbol: "" });
            }
          }}
          onAssetCreated={handleCustomAssetCreated}
          defaultSymbol={customAssetDialog.symbol}
          defaultCurrency={
            customAssetDialog.rowIndex >= 0
              ? (transactions[customAssetDialog.rowIndex]?.currency ?? fallbackCurrency)
              : fallbackCurrency
          }
        />
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Abstain State (Model Low Confidence)
// ============================================================================

interface AbstainStateProps {
  globalErrors: string[];
}

function AbstainState({ globalErrors }: AbstainStateProps) {
  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Icons.AlertTriangle className="text-warning h-5 w-5" />
          <CardTitle className="text-base">Manual Mapping Required</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          The AI was unable to confidently map the CSV columns. Please use the manual import flow or
          provide more context about your CSV format.
        </p>
        {globalErrors.length > 0 && (
          <ul className="text-muted-foreground list-inside list-disc text-sm">
            {globalErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open("/activities/import", "_blank")}
        >
          <Icons.ExternalLink className="mr-2 h-4 w-4" />
          Use Manual Import
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

type ImportCsvToolUIContentProps = ToolCallMessagePartProps<ImportCsvArgs, ImportCsvOutput>;

function ImportCsvToolUIContent({ result, status, toolCallId }: ImportCsvToolUIContentProps) {
  const parsed = useMemo(() => normalizeResult(result), [result]);
  const [successState, setSuccessState] = useState<{
    submitted: boolean;
    createdActivityIds?: string[];
  }>({ submitted: false });

  const isLoading = status?.type === "running";
  const isIncomplete = status?.type === "incomplete";

  const wasSubmitted = parsed?.submitted || successState.submitted;

  if (isLoading) {
    return <ImportCsvLoadingSkeleton />;
  }

  if (isIncomplete) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="py-4">
          <p className="text-destructive text-sm font-medium">Failed to parse CSV</p>
          <p className="text-muted-foreground mt-1 text-xs">
            The request was interrupted or failed.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!parsed) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="py-4">
          <p className="text-destructive text-sm font-medium">No import data available</p>
        </CardContent>
      </Card>
    );
  }

  // Show abstain state if there are global errors and no valid activities
  if (
    parsed.validation.globalErrors &&
    parsed.validation.globalErrors.length > 0 &&
    parsed.activities.length === 0
  ) {
    return <AbstainState globalErrors={parsed.validation.globalErrors} />;
  }

  if (parsed.activities.length === 0) {
    return (
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="py-4">
          <p className="text-warning text-sm font-medium">No activities found in CSV</p>
          <p className="text-muted-foreground mt-1 text-xs">
            The CSV file was parsed but no valid activity rows were detected.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (wasSubmitted) {
    return (
      <SuccessState
        activityCount={
          parsed.createdActivityIds?.length ??
          successState.createdActivityIds?.length ??
          parsed.activities.length
        }
      />
    );
  }

  return (
    <ImportForm
      data={parsed}
      toolCallId={toolCallId}
      onSuccess={(createdIds) => {
        setSuccessState({ submitted: true, createdActivityIds: createdIds });
      }}
    />
  );
}

// ============================================================================
// Export
// ============================================================================

export const ImportCsvToolUI = makeAssistantToolUI<ImportCsvArgs, ImportCsvOutput>({
  toolName: "import_csv",
  render: (props) => {
    return <ImportCsvToolUIContent {...props} />;
  },
});
