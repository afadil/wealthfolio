import { createAsset, previewImportAssets } from "@/adapters";
import TickerSearchInput from "@/components/ticker-search";
import { TickerAvatar } from "@/components/ticker-avatar";
import { CreateSecurityDialog } from "@/pages/asset/create-security-dialog";
import type { ImportAssetPreviewItem, NewAsset, SymbolSearchResult } from "@/lib/types";
import { getExchangeDisplayName } from "@/lib/constants";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { ProgressIndicator } from "@wealthfolio/ui/components/ui/progress-indicator";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ImportAlert } from "../components/import-alert";
import { useImportContext, type DraftActivity, type PendingImportAsset } from "../context";
import {
  buildImportAssetCandidateFromDraft,
  buildNewAssetFromSearchResult,
} from "../utils/asset-review-utils";

interface AssetDialogState {
  open: boolean;
  key: string;
  symbol: string;
  mode: "create" | "edit";
  initialAsset?: Partial<NewAsset>;
}

function applyAssetResolution(
  drafts: DraftActivity[],
  key: string,
  draft: NewAsset,
  options: { assetId?: string; importAssetKey?: string },
): DraftActivity[] {
  return drafts.map((row) => {
    if (row.assetCandidateKey !== key) {
      return row;
    }

    return {
      ...row,
      symbol: draft.instrumentSymbol || draft.displayCode || row.symbol,
      symbolName: draft.name || row.symbolName,
      exchangeMic: draft.instrumentExchangeMic || undefined,
      quoteCcy: draft.quoteCcy || row.quoteCcy,
      instrumentType: draft.instrumentType || row.instrumentType,
      quoteMode: draft.quoteMode || row.quoteMode,
      assetId: options.assetId,
      importAssetKey: options.importAssetKey,
    };
  });
}

function buildEditableAssetDraft(
  item: ImportAssetPreviewItem,
  candidateDraft: DraftActivity | undefined,
  fallbackCurrency: string,
): NewAsset {
  return {
    kind: item.draft?.kind || "INVESTMENT",
    name:
      item.draft?.name ||
      candidateDraft?.symbolName ||
      item.draft?.displayCode ||
      item.draft?.instrumentSymbol ||
      candidateDraft?.symbol,
    displayCode: item.draft?.displayCode || item.draft?.instrumentSymbol || candidateDraft?.symbol,
    isActive: true,
    quoteMode:
      item.draft?.quoteMode ||
      candidateDraft?.quoteMode ||
      (item.status === "EXISTING_ASSET" ? "MARKET" : "MANUAL"),
    quoteCcy:
      item.draft?.quoteCcy ||
      candidateDraft?.quoteCcy ||
      candidateDraft?.currency ||
      fallbackCurrency,
    instrumentType: item.draft?.instrumentType || candidateDraft?.instrumentType || "EQUITY",
    instrumentSymbol:
      item.draft?.instrumentSymbol || item.draft?.displayCode || candidateDraft?.symbol,
    instrumentExchangeMic:
      item.draft?.instrumentExchangeMic || candidateDraft?.exchangeMic || undefined,
    notes: item.draft?.notes,
  };
}

// ─── Needs Fixing Item ────────────────────────────────────────────────────────

interface NeedsFixingRowProps {
  item: ImportAssetPreviewItem;
  symbol: string;
  symbolName?: string;
  count: number;
  onSearch: (item: ImportAssetPreviewItem, result?: SymbolSearchResult) => void;
  onCreateAsset: () => void;
}

// Errors that are self-evident from context (item is in "Needs Fixing") and add no info.
const REDUNDANT_ERROR_PATTERNS = [/could not find/i, /please search/i, /not found in market/i];

function NeedsFixingRow({
  item,
  symbol,
  symbolName,
  count,
  onSearch,
  onCreateAsset,
}: NeedsFixingRowProps) {
  const meaningfulErrors = Object.values(item.errors ?? {})
    .flat()
    .filter((msg) => !REDUNDANT_ERROR_PATTERNS.some((re) => re.test(msg)));

  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 px-3 py-3 sm:grid-cols-[12rem_1fr_auto] sm:px-4 sm:py-3.5">
      {/* Col 1: avatar + symbol + count */}
      <div className="flex items-center gap-2.5">
        <TickerAvatar symbol={symbol} className="size-7 shrink-0" />
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-bold tracking-tight">{symbol}</span>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              {count}×
            </span>
          </div>
          {symbolName && (
            <span className="text-muted-foreground truncate text-[11px]">{symbolName}</span>
          )}
        </div>
        <Icons.ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-amber-400" />
      </div>

      {/* Col 2: search input */}
      <TickerSearchInput
        defaultValue={symbol}
        placeholder="Search ticker to map to…"
        onSelectResult={(_sym, result) => onSearch(item, result)}
        className="h-8 w-full py-1 text-xs"
      />

      {/* Col 3: "or" separator + Create manually */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex flex-col items-center gap-0.5">
          <div className="h-3 w-px bg-amber-300" />
          <span className="text-[10px] font-medium leading-none text-amber-400">or</span>
          <div className="h-3 w-px bg-amber-300" />
        </div>
        <button
          type="button"
          onClick={onCreateAsset}
          className="text-muted-foreground whitespace-nowrap text-[11px] transition-colors hover:text-amber-700"
        >
          Create<span className="hidden sm:inline"> manually</span>
        </button>
      </div>

      {/* Errors span all 3 columns */}
      {meaningfulErrors.length > 0 && (
        <p className="col-span-3 flex items-start gap-1.5 text-[11px] text-red-600">
          <Icons.AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          {meaningfulErrors.join(" ")}
        </p>
      )}
    </div>
  );
}

// ─── Ready Asset Row ──────────────────────────────────────────────────────────

interface ReadyAssetRowProps {
  item: ImportAssetPreviewItem;
  symbol: string;
  count: number;
  isSearchOpen: boolean;
  onToggleSearch: () => void;
  onSearch: (item: ImportAssetPreviewItem, result?: SymbolSearchResult) => void;
  onEdit: () => void;
}

function ReadyAssetRow({
  item,
  symbol,
  count,
  isSearchOpen,
  onToggleSearch,
  onSearch,
  onEdit,
}: ReadyAssetRowProps) {
  const asset = item.draft;
  const isExisting = item.status === "EXISTING_ASSET";
  // Only show name when it differs from the symbol (avoid redundant "AAPL → AAPL")
  const assetName =
    asset?.name && asset.name.toUpperCase() !== symbol.toUpperCase() ? asset.name : undefined;
  const exchangeDisplay = asset?.instrumentExchangeMic
    ? getExchangeDisplayName(asset.instrumentExchangeMic)
    : undefined;
  const metaParts = [asset?.instrumentType, asset?.quoteCcy, exchangeDisplay].filter(Boolean);

  return (
    <div className="group">
      {/* Main row */}
      <div className="hover:bg-muted/30 flex items-center gap-3 px-3 py-2.5 transition-colors sm:px-4">
        {/* Avatar */}
        <TickerAvatar symbol={symbol} className="size-7 shrink-0" />

        {/* Symbol + name + meta */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 font-mono text-sm font-semibold">{symbol}</span>
            {isExisting ? (
              <span className="shrink-0 rounded border px-1 py-px text-[10px] text-blue-600 dark:text-blue-400">
                Existing
              </span>
            ) : (
              <span className="shrink-0 rounded bg-emerald-100 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                New
              </span>
            )}
          </div>
          {assetName && (
            <span className="text-muted-foreground truncate text-[11px]">{assetName}</span>
          )}
          {metaParts.length > 0 && (
            <span className="text-muted-foreground truncate text-[11px]">
              {metaParts.join(" · ")}
            </span>
          )}
        </div>

        {/* Row count + actions */}
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-muted-foreground w-8 text-right text-[11px] sm:w-12">{count}×</span>

          <Button
            size="sm"
            variant={isSearchOpen ? "secondary" : "ghost"}
            className="h-6 gap-1 px-2 text-[11px] transition-opacity data-[active=true]:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            data-active={isSearchOpen}
            onClick={onToggleSearch}
          >
            <Icons.Search className="h-3 w-3" />
            <span className="hidden sm:inline">Remap</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[11px] transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
            onClick={onEdit}
          >
            <Icons.Pencil className="h-3 w-3" />
            <span className="hidden sm:inline">Edit</span>
          </Button>
        </div>
      </div>

      {/* Expandable search panel */}
      {isSearchOpen && (
        <div className="bg-muted/20 mx-4 mb-1 rounded-md border border-dashed px-3 py-2.5">
          <p className="text-muted-foreground mb-2 text-[11px]">
            Search for a different asset to remap these rows
          </p>
          <TickerSearchInput
            defaultValue={asset?.instrumentSymbol || asset?.displayCode || symbol}
            placeholder="Search for a different asset…"
            onSelectResult={(_sym, result) => onSearch(item, result)}
          />
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AssetReviewStep() {
  const { state, dispatch } = useImportContext();
  const { draftActivities, assetPreviewItems, isPreviewingAssets } = state;
  const [activeSearchKey, setActiveSearchKey] = useState<string | null>(null);
  const [assetDialog, setAssetDialog] = useState<AssetDialogState>({
    open: false,
    key: "",
    symbol: "",
    mode: "create",
  });

  const candidateMap = useMemo(() => {
    const next = new Map<string, { count: number; draft: DraftActivity }>();
    for (const draft of draftActivities) {
      const candidate = buildImportAssetCandidateFromDraft(draft);
      if (!candidate) continue;
      const existing = next.get(candidate.key);
      if (existing) {
        existing.count += 1;
      } else {
        next.set(candidate.key, { count: 1, draft });
      }
    }
    return next;
  }, [draftActivities]);

  const loadPreview = useCallback(async () => {
    const candidates = Array.from(candidateMap.values())
      .map(({ draft }) => buildImportAssetCandidateFromDraft(draft))
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

    dispatch({ type: "SET_IS_PREVIEWING_ASSETS", payload: true });
    dispatch({ type: "SET_ASSET_PREVIEW_ERROR", payload: null });
    try {
      const preview = await previewImportAssets({ candidates });
      dispatch({ type: "SET_ASSET_PREVIEW_ITEMS", payload: preview });
      dispatch({ type: "CLEAR_PENDING_IMPORT_ASSETS" });

      let nextDrafts = draftActivities;
      for (const item of preview) {
        if (!item.draft) continue;
        if (item.status === "EXISTING_ASSET") {
          nextDrafts = applyAssetResolution(nextDrafts, item.key, item.draft, {
            assetId: item.assetId,
          });
        }
        if (item.status === "AUTO_RESOLVED_NEW_ASSET") {
          nextDrafts = applyAssetResolution(nextDrafts, item.key, item.draft, {
            importAssetKey: item.key,
          });
          dispatch({
            type: "SET_PENDING_IMPORT_ASSET",
            payload: {
              key: item.key,
              draft: item.draft,
              source: "auto",
            } satisfies PendingImportAsset,
          });
        }
      }
      dispatch({ type: "SET_DRAFT_ACTIVITIES", payload: nextDrafts });
    } catch (error) {
      dispatch({
        type: "SET_ASSET_PREVIEW_ERROR",
        payload: error instanceof Error ? error.message : "Failed to preview import assets.",
      });
    } finally {
      dispatch({ type: "SET_IS_PREVIEWING_ASSETS", payload: false });
    }
  }, [candidateMap, dispatch, draftActivities]);

  useEffect(() => {
    if (candidateMap.size === 0 || assetPreviewItems.length > 0 || isPreviewingAssets) {
      return;
    }
    void loadPreview();
  }, [assetPreviewItems.length, candidateMap.size, isPreviewingAssets, loadPreview]);

  const updatePreviewItem = useCallback(
    (key: string, update: Partial<ImportAssetPreviewItem>) => {
      dispatch({
        type: "SET_ASSET_PREVIEW_ITEMS",
        payload: assetPreviewItems.map((item) =>
          item.key === key ? { ...item, ...update } : item,
        ),
      });
    },
    [assetPreviewItems, dispatch],
  );

  const handleSearchSelection = useCallback(
    (item: ImportAssetPreviewItem, result?: SymbolSearchResult) => {
      if (!result) return;

      const fallbackCurrency =
        candidateMap.get(item.key)?.draft.currency || state.parseConfig.defaultCurrency;
      const assetDraft = buildNewAssetFromSearchResult(result, fallbackCurrency);

      let nextDrafts = draftActivities;
      if (result.isExisting && result.existingAssetId) {
        nextDrafts = applyAssetResolution(nextDrafts, item.key, assetDraft, {
          assetId: result.existingAssetId,
        });
        dispatch({ type: "REMOVE_PENDING_IMPORT_ASSET", payload: item.key });
        updatePreviewItem(item.key, {
          status: "EXISTING_ASSET",
          resolutionSource: "manual_search_existing",
          assetId: result.existingAssetId,
          draft: { ...assetDraft, id: result.existingAssetId },
          errors: undefined,
        });
      } else {
        nextDrafts = applyAssetResolution(nextDrafts, item.key, assetDraft, {
          importAssetKey: item.key,
        });
        dispatch({
          type: "SET_PENDING_IMPORT_ASSET",
          payload: { key: item.key, draft: assetDraft, source: "auto" },
        });
        updatePreviewItem(item.key, {
          status: "AUTO_RESOLVED_NEW_ASSET",
          resolutionSource: "manual_search_new",
          assetId: undefined,
          draft: assetDraft,
          errors: undefined,
        });
      }
      dispatch({ type: "SET_DRAFT_ACTIVITIES", payload: nextDrafts });
      setActiveSearchKey(null);
    },
    [candidateMap, dispatch, draftActivities, state.parseConfig.defaultCurrency, updatePreviewItem],
  );

  const handleManualCreate = useCallback(
    async (payload: NewAsset) => {
      const created = await createAsset(payload);
      const assetDraft: NewAsset = {
        ...payload,
        id: created.id,
        name: created.name || payload.name,
        displayCode: created.displayCode || payload.displayCode,
        quoteCcy: created.quoteCcy || payload.quoteCcy,
        instrumentType: created.instrumentType || payload.instrumentType,
        instrumentSymbol: created.instrumentSymbol || payload.instrumentSymbol,
        instrumentExchangeMic: created.instrumentExchangeMic || payload.instrumentExchangeMic,
      };

      const nextDrafts = applyAssetResolution(draftActivities, assetDialog.key, assetDraft, {
        assetId: created.id,
      });
      dispatch({ type: "SET_DRAFT_ACTIVITIES", payload: nextDrafts });
      dispatch({ type: "REMOVE_PENDING_IMPORT_ASSET", payload: assetDialog.key });
      updatePreviewItem(assetDialog.key, {
        status: "EXISTING_ASSET",
        resolutionSource: "manual_created",
        assetId: created.id,
        draft: assetDraft,
        errors: undefined,
      });
      setActiveSearchKey(null);
      setAssetDialog({ open: false, key: "", symbol: "", mode: "create" });
    },
    [assetDialog.key, dispatch, draftActivities, updatePreviewItem],
  );

  const handleManualEdit = useCallback(
    (payload: NewAsset) => {
      const nextDrafts = applyAssetResolution(draftActivities, assetDialog.key, payload, {
        importAssetKey: assetDialog.key,
      });

      dispatch({ type: "SET_DRAFT_ACTIVITIES", payload: nextDrafts });
      dispatch({
        type: "SET_PENDING_IMPORT_ASSET",
        payload: { key: assetDialog.key, draft: payload, source: "manual" },
      });
      updatePreviewItem(assetDialog.key, {
        status: "AUTO_RESOLVED_NEW_ASSET",
        resolutionSource: "manual_edit",
        assetId: undefined,
        draft: payload,
        errors: undefined,
      });
      setActiveSearchKey(null);
      setAssetDialog({ open: false, key: "", symbol: "", mode: "create" });
    },
    [assetDialog.key, dispatch, draftActivities, updatePreviewItem],
  );

  const needsFixing = assetPreviewItems.filter((item) => item.status === "NEEDS_FIXING");
  const readyItems = assetPreviewItems.filter((item) => item.status !== "NEEDS_FIXING");

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (candidateMap.size === 0) {
    return (
      <ImportAlert
        variant="success"
        title="No assets require review"
        description="This import only contains cash-style activities — you can continue to activity review."
      />
    );
  }

  // ── Loading state ────────────────────────────────────────────────────────────
  if (isPreviewingAssets || (assetPreviewItems.length === 0 && !state.assetPreviewError)) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <ProgressIndicator
          message="Resolving assets and matching symbols…"
          description="This may take a few minutes."
          className="border-none shadow-none"
        />
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────────
  if (state.assetPreviewError) {
    return (
      <ImportAlert
        variant="destructive"
        title="Asset preview failed"
        description={state.assetPreviewError}
      >
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={() => void loadPreview()}>
            Retry
          </Button>
        </div>
      </ImportAlert>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Summary banner (success only) ─────────────────────────────────── */}
      {needsFixing.length === 0 && (
        <ImportAlert
          variant="success"
          title="All assets resolved"
          description="Ready to continue. You can still remap or edit any asset before confirming."
        />
      )}

      {/* ── Needs Fixing section ──────────────────────────────────────────── */}
      {needsFixing.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40">
          {/* Section header */}
          <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50/60 px-4 py-2.5">
            <Icons.AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                Needs Fixing
              </span>
              <p className="mt-0.5 text-[11px] text-amber-700/80">
                Search for the correct ticker or create a custom asset for each symbol.
              </p>
            </div>
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
              {needsFixing.length}
            </span>
          </div>

          {/* Items */}
          <div className="divide-y divide-amber-100">
            {needsFixing.map((item) => {
              const candidate = candidateMap.get(item.key);
              const symbol = candidate?.draft.symbol || item.key;
              const symbolName = item.draft?.name || candidate?.draft.symbolName;
              const count = candidate?.count ?? 0;
              return (
                <NeedsFixingRow
                  key={item.key}
                  item={item}
                  symbol={symbol}
                  symbolName={symbolName}
                  count={count}
                  onSearch={handleSearchSelection}
                  onCreateAsset={() =>
                    setAssetDialog({
                      open: true,
                      key: item.key,
                      symbol,
                      mode: "create",
                    })
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Ready Assets section ──────────────────────────────────────────── */}
      {readyItems.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          {/* Section header */}
          <div className="bg-muted/40 flex items-center gap-2 border-b px-4 py-2.5">
            <Icons.CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              Ready Assets
            </span>
            <span className="bg-muted text-muted-foreground ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold">
              {readyItems.length}
            </span>
          </div>

          {/* Items */}
          <div className="divide-y">
            {readyItems.map((item) => {
              const candidate = candidateMap.get(item.key);
              const symbol =
                item.draft?.displayCode ||
                item.draft?.instrumentSymbol ||
                candidate?.draft.symbol ||
                item.key;
              const count = candidate?.count ?? 0;
              return (
                <ReadyAssetRow
                  key={item.key}
                  item={item}
                  symbol={symbol}
                  count={count}
                  isSearchOpen={activeSearchKey === item.key}
                  onToggleSearch={() =>
                    setActiveSearchKey((cur) => (cur === item.key ? null : item.key))
                  }
                  onSearch={(i, result) => {
                    handleSearchSelection(i, result);
                  }}
                  onEdit={() =>
                    setAssetDialog({
                      open: true,
                      key: item.key,
                      symbol: item.draft?.instrumentSymbol || item.draft?.displayCode || "",
                      mode: "edit",
                      initialAsset: buildEditableAssetDraft(
                        item,
                        candidate?.draft,
                        state.parseConfig.defaultCurrency,
                      ),
                    })
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Asset dialog ─────────────────────────────────────────────────── */}
      <CreateSecurityDialog
        open={assetDialog.open}
        onOpenChange={(open) => setAssetDialog((current) => ({ ...current, open }))}
        title={assetDialog.mode === "edit" ? "Edit Asset Resolution" : "Create Asset"}
        description={
          assetDialog.mode === "edit"
            ? "Adjust the resolved asset details. Edits apply only to this import."
            : "Create a new asset and link these rows to it immediately."
        }
        submitLabel={assetDialog.mode === "edit" ? "Use Edited Asset" : "Create Asset"}
        initialAsset={assetDialog.initialAsset}
        onSubmit={(payload) =>
          void (assetDialog.mode === "edit"
            ? handleManualEdit(payload)
            : handleManualCreate(payload))
        }
      />
    </div>
  );
}

export default AssetReviewStep;
