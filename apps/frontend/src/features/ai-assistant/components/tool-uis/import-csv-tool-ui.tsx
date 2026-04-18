import { memo, useMemo, useRef } from "react";

import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { makeAssistantToolUI } from "@assistant-ui/react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@wealthfolio/ui";
import { Icons } from "@wealthfolio/ui/components/ui/icons";

import { logger } from "@/adapters";
import { Link } from "react-router-dom";
import { useSettingsContext } from "@/lib/settings-provider";

import { useRuntimeContext } from "../../hooks/use-runtime-context";
import { useChatImportSession } from "../../hooks/use-chat-import-session";
import type { ImportCsvArgs, ImportCsvMappingOutput } from "../../types";

import { ChatReviewGrid } from "./chat-review-grid";
import { MappingBadgeStrip } from "./mapping-badge-strip";

// ─────────────────────────────────────────────────────────────────────────────
// Result normalizer — accept both camelCase (serde) and snake_case fallbacks.
// ─────────────────────────────────────────────────────────────────────────────

type RawResult = Record<string, unknown> | string | null | undefined;

function pick<T>(obj: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const key of keys) {
    if (key in obj && obj[key] !== undefined) return obj[key] as T;
  }
  return undefined;
}

interface NormalizeResult {
  mapping: ImportCsvMappingOutput | null;
  errorMessage: string | null;
}

function normalizeMappingResult(raw: RawResult): NormalizeResult {
  if (!raw) return { mapping: null, errorMessage: null };

  // Rig wraps tool errors as plain strings — surface them directly.
  if (typeof raw === "string") {
    try {
      return normalizeMappingResult(JSON.parse(raw));
    } catch {
      return { mapping: null, errorMessage: raw };
    }
  }
  if (typeof raw !== "object") {
    return { mapping: null, errorMessage: String(raw) };
  }

  const obj = raw as Record<string, unknown>;

  // Check for error envelope: { error: "..." }
  if ("error" in obj && typeof obj.error === "string") {
    return { mapping: null, errorMessage: obj.error };
  }

  // Unwrap { data: ... } envelope if present.
  if ("data" in obj && typeof obj.data === "object" && obj.data !== null) {
    return normalizeMappingResult(obj.data as Record<string, unknown>);
  }

  const csvContent = pick<string>(obj, "csvContent", "csv_content") ?? "";
  const appliedMapping = pick<Record<string, unknown>>(obj, "appliedMapping", "applied_mapping");
  const parseConfig = pick<Record<string, unknown>>(obj, "parseConfig", "parse_config");
  if (!appliedMapping) {
    return { mapping: null, errorMessage: null };
  }

  return {
    errorMessage: null,
    mapping: {
      csvContent,
      appliedMapping: appliedMapping as ImportCsvMappingOutput["appliedMapping"],
      parseConfig: (parseConfig ?? {}) as ImportCsvMappingOutput["parseConfig"],
      accountId: pick<string>(obj, "accountId", "account_id") ?? null,
      detectedHeaders: pick<string[]>(obj, "detectedHeaders", "detected_headers") ?? [],
      sampleRows: pick<string[][]>(obj, "sampleRows", "sample_rows") ?? [],
      totalRows: pick<number>(obj, "totalRows", "total_rows") ?? 0,
      mappingConfidence:
        pick<ImportCsvMappingOutput["mappingConfidence"]>(
          obj,
          "mappingConfidence",
          "mapping_confidence",
        ) ?? "MEDIUM",
      availableAccounts:
        pick<ImportCsvMappingOutput["availableAccounts"]>(
          obj,
          "availableAccounts",
          "available_accounts",
        ) ?? [],
      usedSavedProfile: pick<boolean>(obj, "usedSavedProfile", "used_saved_profile") ?? false,
      submitted: pick<boolean>(obj, "submitted"),
      importedCount: pick<number>(obj, "importedCount", "imported_count"),
      importRunId: pick<string>(obj, "importRunId", "import_run_id"),
      submittedAt: pick<string>(obj, "submittedAt", "submitted_at"),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading / Success / Error shells
// ─────────────────────────────────────────────────────────────────────────────

function LoadingCard() {
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
      </CardContent>
    </Card>
  );
}

function SuccessCard({ count }: { count: number }) {
  return (
    <Card className="bg-muted/40 border-success/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Icons.CheckCircle className="text-success h-5 w-5" />
          <CardTitle className="text-base">Import complete</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Imported <span className="text-foreground font-medium">{count}</span> activit
          {count === 1 ? "y" : "ies"}. The mapping was saved as this account's template so the next
          import from the same broker will skip the AI step.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/activities">
            <Icons.ExternalLink className="mr-2 h-4 w-4" />
            View activities
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="py-4">
        <p className="text-destructive text-sm font-medium">CSV import failed</p>
        <p className="text-muted-foreground mt-1 text-xs">{message}</p>
      </CardContent>
    </Card>
  );
}

function StaleImportCard({ mapping }: { mapping: ImportCsvMappingOutput }) {
  const fieldCount = Object.keys(mapping.appliedMapping?.fieldMappings ?? {}).length;
  return (
    <Card className="bg-muted/40 border-muted-foreground/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Icons.FileSpreadsheet className="text-muted-foreground h-5 w-5" />
          <CardTitle className="text-muted-foreground text-base">
            CSV import · {mapping.totalRows} row{mapping.totalRows === 1 ? "" : "s"}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          {fieldCount > 0 ? `Mapped ${fieldCount} columns. ` : ""}
          This import was not completed. Attach the CSV again to start a new import.
        </p>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

type ImportCsvToolUIContentProps = ToolCallMessagePartProps<ImportCsvArgs, unknown>;

function ImportCsvToolUIContentImpl({ result, status, toolCallId }: ImportCsvToolUIContentProps) {
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  const runtime = useRuntimeContext();
  const threadId = runtime.currentThreadId;

  // Track whether this component ever saw the tool in "running" state.
  // If it didn't, the tool result was loaded from a saved thread — we
  // should show a lightweight static card instead of re-initializing the
  // full import session (re-parsing CSV, calling backend validation, etc).
  const wasRunningRef = useRef(status?.type === "running");
  if (status?.type === "running") wasRunningRef.current = true;
  const isLiveToolCall = wasRunningRef.current;

  const { mapping, errorMessage: normalizeError } = useMemo(() => {
    const normalized = normalizeMappingResult(result as RawResult);
    if (!normalized.mapping && result && status?.type !== "running") {
      logger.warn(
        "[ImportCsvToolUI] Failed to normalize result:",
        JSON.stringify(result).slice(0, 500),
      );
    }
    return normalized;
  }, [result, status?.type]);

  // Only create the full interactive session for live tool calls (current
  // conversation) or submitted results (just need the success card).
  // For stale/reloaded threads, skip the expensive init entirely.
  const shouldInitSession = isLiveToolCall || mapping?.submitted;

  const session = useChatImportSession({
    mapping: shouldInitSession ? mapping : null,
    threadId,
    toolCallId,
    submittedFromResult: mapping?.submitted ?? false,
    submittedCountFromResult: mapping?.importedCount,
  });

  if (!result || (!mapping && status?.type === "running")) {
    return <LoadingCard />;
  }
  if (status?.type === "incomplete") {
    return <ErrorCard message="The CSV import request was interrupted." />;
  }
  if (!mapping) {
    return (
      <ErrorCard message={normalizeError || "No import mapping was returned by the AI tool."} />
    );
  }
  // Submitted imports — always show success, whether live or reloaded.
  if (mapping.submitted || session.submitted) {
    return <SuccessCard count={session.importedCount || mapping.importedCount || 0} />;
  }
  // Stale (reloaded) non-submitted import — show static summary instead
  // of trying to re-parse the CSV and reinitialize the full session.
  if (!isLiveToolCall) {
    return <StaleImportCard mapping={mapping} />;
  }
  if (session.status === "initializing") {
    return <LoadingCard />;
  }
  if (session.status === "error" && session.error && session.drafts.length === 0) {
    return <ErrorCard message={session.error} />;
  }

  return (
    <Card className="bg-muted/40 border-primary/10">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icons.FileSpreadsheet className="text-primary h-5 w-5" />
            <CardTitle className="text-base">
              CSV import · {mapping.totalRows} row{mapping.totalRows === 1 ? "" : "s"}
            </CardTitle>
          </div>
          <Select value={session.accountId || ""} onValueChange={session.setAccountId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select target account" />
            </SelectTrigger>
            <SelectContent>
              {mapping.availableAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name} ({account.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <MappingBadgeStrip mapping={mapping} baseCurrency={baseCurrency} />

        {session.error && session.drafts.length > 0 && (
          <div className="border-destructive/50 bg-destructive/10 text-destructive flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <Icons.AlertCircle className="h-4 w-4 shrink-0" />
            <span>{session.error}</span>
          </div>
        )}

        <ChatReviewGrid
          filteredDrafts={session.filteredDrafts}
          stats={session.stats}
          filter={session.filter}
          onFilterChange={session.setFilter}
          onDraftUpdate={session.editDraft}
          onBulkSkip={session.bulkSkip}
          onBulkUnskip={session.bulkUnskip}
          onBulkForceImport={session.bulkForceImport}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="text-muted-foreground text-xs">
            {session.stats.valid} valid · {session.stats.warning} warnings · {session.stats.errors}{" "}
            errors · {session.stats.duplicates} duplicates
          </div>
          <div className="flex items-center gap-2">
            {session.status === "ready" && session.error && (
              <Button variant="outline" size="sm" onClick={session.revalidate}>
                Revalidate
              </Button>
            )}
            <Button
              onClick={session.confirm}
              disabled={!session.canConfirm || session.isSubmitting}
            >
              {session.isSubmitting ? (
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Icons.Download className="mr-2 h-4 w-4" />
              )}
              Import {session.stats.toImport} activit
              {session.stats.toImport === 1 ? "y" : "ies"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const ImportCsvToolUIContent = memo(ImportCsvToolUIContentImpl);

export const ImportCsvToolUI = makeAssistantToolUI<ImportCsvArgs, unknown>({
  toolName: "import_csv",
  render: (props) => {
    // Key on toolCallId so React unmounts/remounts when switching threads.
    // Without this, refs (wasRunningRef, initializedRef) carry stale state
    // from the previous thread's tool call.
    return <ImportCsvToolUIContent key={props.toolCallId} {...props} />;
  },
});
