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
import { ActivityType, ActivityTypeNames } from "@/lib/constants";
import type { ColumnDef } from "@tanstack/react-table";
import type { SymbolSearchResult } from "@wealthfolio/ui";
import type {
  ImportCsvArgs,
  ImportCsvOutput,
  ImportCsvActivityDraft,
  ImportCsvCleaningAction,
  ImportCsvValidationSummary,
  ImportCsvAccountOption,
  ImportPlan,
  ImportCsvSignRuleConfig,
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
  date?: Date;
  assetSymbol?: string;
  /** Resolved exchange MIC for the symbol */
  exchangeMic?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  fee?: number;
  currency?: string;
  comment?: string;
  // Validation
  isValid: boolean;
  errors: string[];
  warnings: string[];
  sourceRow: number;
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
  quantity?: number;
  unit_price?: number;
  unitPrice?: number;
  amount?: number;
  fee?: number;
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
    quantity: raw.quantity != null ? Number(raw.quantity) : undefined,
    unitPrice: raw.unit_price ?? raw.unitPrice != null ? Number(raw.unit_price ?? raw.unitPrice) : undefined,
    amount: raw.amount != null ? Number(raw.amount) : undefined,
    fee: raw.fee != null ? Number(raw.fee) : undefined,
    currency: raw.currency,
    comment: raw.notes ?? raw.comment,
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

function normalizePlan(raw: Record<string, unknown>): ImportPlan {
  const columnMappingsRaw = (raw.column_mappings ?? raw.columnMappings ?? {}) as Record<string, unknown>;
  const enumMapsRaw = (raw.enum_maps ?? raw.enumMaps ?? {}) as Record<string, unknown>;
  const confidenceRaw = (raw.confidence ?? {}) as Record<string, unknown>;

  return {
    columnMappings: {
      date: columnMappingsRaw.date as number | null | undefined,
      activityType: (columnMappingsRaw.activity_type ?? columnMappingsRaw.activityType) as number | null | undefined,
      symbol: columnMappingsRaw.symbol as number | null | undefined,
      quantity: columnMappingsRaw.quantity as number | null | undefined,
      unitPrice: (columnMappingsRaw.unit_price ?? columnMappingsRaw.unitPrice) as number | null | undefined,
      amount: columnMappingsRaw.amount as number | null | undefined,
      fee: columnMappingsRaw.fee as number | null | undefined,
      currency: columnMappingsRaw.currency as number | null | undefined,
      account: columnMappingsRaw.account as number | null | undefined,
      comment: columnMappingsRaw.comment as number | null | undefined,
    },
    transforms: Array.isArray(raw.transforms) ? raw.transforms : [],
    enumMaps: {
      activityType: (enumMapsRaw.activity_type ?? enumMapsRaw.activityType) as Record<string, string> | undefined,
    },
    signRules: Array.isArray(raw.sign_rules ?? raw.signRules) ? (raw.sign_rules ?? raw.signRules) as ImportCsvSignRuleConfig[] : [],
    confidence: {
      overall: (confidenceRaw.overall as number) ?? 0.5,
      byField: (confidenceRaw.by_field ?? confidenceRaw.byField) as Record<string, number> | undefined,
    },
    notes: Array.isArray(raw.notes) ? raw.notes : [],
    abstain: (raw.abstain as boolean) ?? false,
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
  const activities = activitiesRaw.map((a: BackendActivityDraft, i: number) => normalizeActivityDraft(a, i));

  const planRaw = (candidate.applied_plan ?? candidate.appliedPlan ?? {}) as Record<string, unknown>;
  const appliedPlan = normalizePlan(planRaw);

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
    ? (candidate.detected_headers ?? candidate.detectedHeaders) as string[]
    : undefined;

  return {
    activities,
    appliedPlan,
    cleaningActions,
    validation,
    availableAccounts,
    detectedHeaders,
    totalRows: (candidate.total_rows ?? candidate.totalRows) as number | undefined,
    truncated: candidate.truncated as boolean | undefined,
    submitted: candidate.submitted as boolean | undefined,
    createdActivityIds: (candidate.created_activity_ids ?? candidate.createdActivityIds) as string[] | undefined,
    submittedAt: (candidate.submitted_at ?? candidate.submittedAt) as string | undefined,
  };
}

// ============================================================================
// Convert to LocalTransaction for DataGrid
// ============================================================================

function toLocalTransaction(draft: ImportCsvActivityDraft): ImportLocalTransaction {
  return {
    id: draft.tempId,
    tempId: draft.tempId,
    isNew: true,
    accountId: draft.accountId,
    activityType: draft.activityType,
    date: draft.activityDate ? new Date(draft.activityDate) : undefined,
    assetSymbol: draft.symbol,
    exchangeMic: draft.exchangeMic,
    quantity: draft.quantity,
    unitPrice: draft.unitPrice,
    amount: draft.amount,
    fee: draft.fee,
    currency: draft.currency,
    comment: draft.comment,
    isValid: draft.validationStatus !== "error",
    errors: draft.validationErrors?.filter((_, i) => i < (draft.validationStatus === "error" ? Infinity : 0)) ?? [],
    warnings: draft.validationStatus === "warning" ? (draft.validationErrors ?? []) : [],
    sourceRow: draft.sourceRow,
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
          <Icons.CheckCircle className="h-5 w-5 text-success" />
          <CardTitle className="text-base">Import Complete</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Successfully imported <span className="font-medium text-foreground">{activityCount}</span> activities.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open("/activities", "_blank")}
        >
          <Icons.ExternalLink className="mr-2 h-4 w-4" />
          View Activities
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Confidence Badge
// ============================================================================

interface ConfidenceBadgeProps {
  confidence: number;
}

function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  const percentage = Math.round(confidence * 100);
  let className = "";

  if (confidence >= 0.8) {
    className = "bg-success/10 text-success border-success/30";
  } else if (confidence >= 0.5) {
    className = "bg-warning/10 text-warning border-warning/30";
  } else {
    className = "bg-destructive/10 text-destructive border-destructive/30";
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={className}>
          {percentage}% confidence
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p>AI confidence in column mapping accuracy</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ============================================================================
// Cleaning Actions Summary
// ============================================================================

interface CleaningActionsSummaryProps {
  actions: ImportCsvCleaningAction[];
  plan: ImportPlan;
}

function CleaningActionsSummary({ actions, plan }: CleaningActionsSummaryProps) {
  const hasActions = actions.length > 0;
  const hasNotes = plan.notes && plan.notes.length > 0;

  if (!hasActions && !hasNotes) return null;

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between px-2 text-muted-foreground hover:text-foreground">
          <span className="flex items-center gap-2">
            <Icons.Sparkles className="h-4 w-4" />
            <span className="text-xs">
              {actions.length > 0 && `${actions.length} auto-cleaning action${actions.length > 1 ? "s" : ""} applied`}
              {actions.length > 0 && hasNotes && " • "}
              {hasNotes && `${plan.notes!.length} note${plan.notes!.length > 1 ? "s" : ""}`}
            </span>
          </span>
          <Icons.ChevronDown className="h-4 w-4" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2 pt-2 space-y-2">
        {hasActions && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2">
                <Icons.Check className="h-3 w-3 mt-0.5 text-success" />
                <span>{action.description}</span>
              </li>
            ))}
          </ul>
        )}
        {hasNotes && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {plan.notes!.map((note, i) => (
              <li key={i} className="flex items-start gap-2">
                <Icons.Info className="h-3 w-3 mt-0.5 text-blue-500" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        )}
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
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
          {validation.errorRows} errors
        </Badge>
      )}
    </div>
  );
}

// ============================================================================
// Import Data Grid Columns
// ============================================================================

function useImportColumns(accounts: ImportCsvAccountOption[]) {
  const activityTypeOptions = useMemo(
    () =>
      (Object.values(ActivityType) as ActivityType[]).map((type) => ({
        value: type,
        label: ActivityTypeNames[type],
      })),
    [],
  );

  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        value: account.id,
        label: `${account.name} (${account.currency})`,
      })),
    [accounts],
  );

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

  const columns = useMemo<ColumnDef<ImportLocalTransaction>[]>(
    () => [
      // Row number
      {
        id: "sourceRow",
        accessorKey: "sourceRow",
        header: "#",
        size: 50,
        minSize: 50,
        maxSize: 50,
        enableSorting: false,
        enableResizing: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">{row.original.sourceRow}</span>
        ),
      },
      // Status indicator
      {
        id: "status",
        header: "",
        size: 32,
        minSize: 32,
        maxSize: 32,
        enableResizing: false,
        enableSorting: false,
        cell: ({ row }) => {
          const { isValid, errors, warnings } = row.original;
          if (isValid && warnings.length === 0) {
            return <Icons.CheckCircle className="h-4 w-4 text-success" />;
          }
          if (!isValid) {
            return (
              <Tooltip>
                <TooltipTrigger>
                  <Icons.AlertCircle className="h-4 w-4 text-destructive" />
                </TooltipTrigger>
                <TooltipContent>{errors.join(", ")}</TooltipContent>
              </Tooltip>
            );
          }
          return (
            <Tooltip>
              <TooltipTrigger>
                <Icons.AlertTriangle className="h-4 w-4 text-warning" />
              </TooltipTrigger>
              <TooltipContent>{warnings.join(", ")}</TooltipContent>
            </Tooltip>
          );
        },
      },
      // Account
      {
        id: "accountId",
        accessorKey: "accountId",
        header: "Account",
        size: 160,
        meta: { cell: { variant: "select", options: accountOptions } },
      },
      // Type
      {
        accessorKey: "activityType",
        header: "Type",
        size: 130,
        meta: {
          cell: {
            variant: "select",
            options: activityTypeOptions,
          },
        },
      },
      // Date
      {
        id: "date",
        accessorKey: "date",
        header: "Date",
        size: 140,
        meta: { cell: { variant: "datetime" } },
      },
      // Symbol
      {
        accessorKey: "assetSymbol",
        header: "Symbol",
        size: 120,
        meta: {
          cell: {
            variant: "symbol",
            onSearch: handleSymbolSearch,
          },
        },
      },
      // Quantity
      {
        accessorKey: "quantity",
        header: "Qty",
        size: 100,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001 } },
      },
      // Price
      {
        accessorKey: "unitPrice",
        header: "Price",
        size: 100,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001 } },
      },
      // Amount
      {
        accessorKey: "amount",
        header: "Amount",
        size: 100,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.01 } },
      },
      // Fee
      {
        accessorKey: "fee",
        header: "Fee",
        size: 80,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.01 } },
      },
      // Currency
      {
        accessorKey: "currency",
        header: "CCY",
        size: 80,
        enableSorting: false,
        meta: { cell: { variant: "currency" } },
      },
      // Comment
      {
        accessorKey: "comment",
        header: "Comment",
        size: 200,
        enableSorting: false,
        meta: { cell: { variant: "long-text" } },
      },
    ],
    [accountOptions, activityTypeOptions, handleSymbolSearch],
  );

  return columns;
}

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
    () => data.activities.map(toLocalTransaction),
    [data.activities],
  );

  const [transactions, setTransactions] = useState<ImportLocalTransaction[]>(initialTransactions);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(
    data.activities[0]?.accountId ?? (data.availableAccounts.length === 1 ? data.availableAccounts[0].id : undefined)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const columns = useImportColumns(data.availableAccounts);

  const validCount = useMemo(() => transactions.filter(t => t.isValid).length, [transactions]);
  const errorCount = useMemo(() => transactions.filter(t => !t.isValid).length, [transactions]);
  const canSubmit = validCount > 0 && selectedAccountId;

  // Handle account change - update all transactions
  const handleAccountChange = useCallback((accountId: string) => {
    setSelectedAccountId(accountId);
    setTransactions(prev => prev.map(t => ({ ...t, accountId })));
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
      columnVisibility: {},
    },
  });

  const handleSubmit = useCallback(async () => {
    if (!selectedAccountId) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Filter out error rows and prepare payloads
      const validTransactions = transactions.filter(t => t.isValid);

      const creates = validTransactions.map(t => ({
        id: t.tempId,
        accountId: selectedAccountId,
        activityType: t.activityType ?? "BUY",
        activityDate: t.date?.toISOString() ?? new Date().toISOString(),
        asset: t.assetSymbol ? { symbol: t.assetSymbol, exchangeMic: t.exchangeMic } : undefined,
        quantity: t.quantity,
        unitPrice: t.unitPrice,
        amount: t.amount,
        fee: t.fee,
        currency: t.currency,
        comment: t.comment,
      }));

      const result = await saveActivities({
        creates,
        updates: [],
        deleteIds: [],
      });

      const createdIds = result.created?.map(c => c.id) ?? [];

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
            <Icons.FileSpreadsheet className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">CSV Import Preview</CardTitle>
            <ConfidenceBadge confidence={data.appliedPlan.confidence.overall} />
          </div>
          <ValidationSummaryBadges validation={data.validation} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cleaning actions and notes summary */}
        <CleaningActionsSummary actions={data.cleaningActions} plan={data.appliedPlan} />

        {/* Account selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Target account:</span>
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
          <div className="flex items-center gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-warning">
            <Icons.AlertTriangle className="h-4 w-4 shrink-0" />
            <span>CSV was truncated. Showing first {transactions.length} of {data.totalRows} rows.</span>
          </div>
        )}

        {/* DataGrid */}
        <div className="border rounded-md overflow-hidden">
          <DataGrid {...dataGrid} height={Math.min(400, 50 + transactions.length * 36)} stretchColumns />
        </div>

        {/* Error message */}
        {submitError && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <Icons.AlertCircle className="h-4 w-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-muted-foreground">
            {errorCount > 0 && (
              <span className="text-destructive">{errorCount} row{errorCount > 1 ? "s" : ""} with errors will be skipped</span>
            )}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !canSubmit}
          >
            {isSubmitting ? (
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Icons.Download className="mr-2 h-4 w-4" />
            )}
            Import {validCount} Activities
          </Button>
        </div>
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
          <Icons.AlertTriangle className="h-5 w-5 text-warning" />
          <CardTitle className="text-base">Manual Mapping Required</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          The AI was unable to confidently map the CSV columns. Please use the manual import flow or provide more context about your CSV format.
        </p>
        {globalErrors.length > 0 && (
          <ul className="text-sm text-muted-foreground list-disc list-inside">
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
          <p className="text-sm font-medium text-destructive">Failed to parse CSV</p>
          <p className="mt-1 text-xs text-muted-foreground">The request was interrupted or failed.</p>
        </CardContent>
      </Card>
    );
  }

  if (!parsed) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="py-4">
          <p className="text-sm font-medium text-destructive">No import data available</p>
        </CardContent>
      </Card>
    );
  }

  if (parsed.appliedPlan?.abstain) {
    return <AbstainState globalErrors={parsed.validation.globalErrors ?? []} />;
  }

  if (parsed.validation.globalErrors && parsed.validation.globalErrors.length > 0 && parsed.activities.length === 0) {
    return <AbstainState globalErrors={parsed.validation.globalErrors} />;
  }

  if (parsed.activities.length === 0) {
    return (
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="py-4">
          <p className="text-sm font-medium text-warning">No activities found in CSV</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The CSV file was parsed but no valid activity rows were detected.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (wasSubmitted) {
    return (
      <SuccessState
        activityCount={parsed.createdActivityIds?.length ?? successState.createdActivityIds?.length ?? parsed.activities.length}
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
