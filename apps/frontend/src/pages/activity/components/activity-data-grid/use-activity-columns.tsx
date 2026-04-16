import { searchTicker } from "@/adapters";
import { isCashActivity, isSymbolRequired } from "@/lib/activity-utils";
import {
  ActivityStatus,
  ActivityType,
  INSTRUMENT_TYPE_OPTIONS,
  getExchangeDisplayName,
  SUBTYPE_DISPLAY_NAMES,
  SUBTYPES_BY_ACTIVITY_TYPE,
} from "@/lib/constants";
import { parseOccSymbol } from "@/lib/occ-symbol";
import type { Account, ActivityDetails } from "@/lib/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, Checkbox, type SymbolSearchResult } from "@wealthfolio/ui";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ActivityOperations } from "../activity-operations";
import { ActivityTypeBadge } from "../activity-type-badge";
import { StatusHeaderIndicator, StatusIndicator } from "./status-indicator";
import { isPendingReview, type LocalTransaction } from "./types";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  [ActivityStatus.POSTED]: "default",
  [ActivityStatus.PENDING]: "secondary",
  [ActivityStatus.DRAFT]: "outline",
  [ActivityStatus.VOID]: "destructive",
};

const isTransferActivity = (activityType: string | undefined): boolean => {
  return activityType === ActivityType.TRANSFER_IN || activityType === ActivityType.TRANSFER_OUT;
};

interface UseActivityColumnsOptions {
  accounts: Account[];
  onEditActivity: (activity: ActivityDetails) => void;
  onDuplicate: (activity: ActivityDetails) => void;
  onDelete: (activity: ActivityDetails) => void;
  /** Called when a symbol is selected from search, with the full result including exchangeMic */
  onSymbolSelect?: (rowIndex: number, result: SymbolSearchResult) => void;
  /** Called when user wants to create a custom asset. Opens a dialog to collect asset metadata. */
  onCreateCustomAsset?: (rowIndex: number, symbol: string) => void;
}

/**
 * Hook to create column definitions for the activity data grid
 */
export function useActivityColumns({
  accounts,
  onEditActivity,
  onDuplicate,
  onDelete,
  onSymbolSelect,
  onCreateCustomAsset,
}: UseActivityColumnsOptions) {
  const { t, i18n } = useTranslation("common");

  const activityTypeOptions = useMemo(
    () =>
      (Object.values(ActivityType) as ActivityType[]).map((type) => ({
        value: type,
        label: t(`activity.types.${type}`),
      })),
    [t],
  );

  const instrumentTypeOptions = useMemo(
    () =>
      INSTRUMENT_TYPE_OPTIONS.map((opt) => ({
        value: opt.value,
        label: t(`activity.instrument.${opt.value}`),
      })),
    [t],
  );

  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        value: account.id,
        label: account.name,
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
      currencySource: result.currencySource,
      quoteType: result.quoteType,
      score: result.score,
      dataSource: result.dataSource,
      assetKind: result.assetKind,
    }));
  }, []);

  const columns = useMemo<ColumnDef<LocalTransaction>[]>(
    () => [
      // === Pinned left (always visible) ===
      // 1. Select
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllRowsSelected() || (table.getIsSomeRowsSelected() && "indeterminate")
            }
            onCheckedChange={(checked) => table.toggleAllRowsSelected(Boolean(checked))}
            aria-label={t("activity.data_grid.aria.select_all_rows")}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
            aria-label={t("activity.data_grid.aria.select_row")}
          />
        ),
        meta: { label: t("activity.data_grid.col.select") },
        size: 40,
        minSize: 40,
        maxSize: 40,
        enableSorting: false,
        enableResizing: false,
        enableHiding: false,
        enablePinning: false,
      },
      // 2. Status indicator
      {
        id: "status",
        header: ({ table }) => {
          const hasRowsToReview = table
            .getRowModel()
            .rows.some((row) => isPendingReview(row.original));
          return <StatusHeaderIndicator hasRowsToReview={hasRowsToReview} />;
        },
        size: 32,
        minSize: 32,
        maxSize: 32,
        enableResizing: false,
        enableSorting: false,
        enableHiding: false,
        enablePinning: false,
        cell: ({ row }) => <StatusIndicator transaction={row.original} />,
      },
      // 3. Date & Time (primary sort key)
      {
        id: "date",
        accessorKey: "date",
        header: t("activity.data_grid.col.date"),
        size: 180,
        meta: { cell: { variant: "datetime" } },
      },
      // 4. Account
      {
        id: "accountName",
        accessorKey: "accountId",
        header: t("activity.data_grid.col.accountName"),
        size: 180,
        meta: { cell: { variant: "select", options: accountOptions } },
      },

      // === Identity / classification ===
      // 5. Type
      {
        accessorKey: "activityType",
        header: t("activity.data_grid.col.activityType"),
        size: 150,
        enablePinning: false,
        meta: {
          cell: {
            variant: "select",
            options: activityTypeOptions,
            valueRenderer: (value: string) => (
              <ActivityTypeBadge type={value as ActivityType} className="text-xs font-normal" />
            ),
          },
        },
      },
      // 6. Subtype (hidden by default; dynamic options based on activity type)
      {
        id: "subtype",
        accessorKey: "subtype",
        header: t("activity.data_grid.col.subtype"),
        size: 160,
        enableSorting: false,
        enableHiding: true,
        meta: {
          cell: {
            variant: "select",
            // Dynamic options based on activity type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            options: ((rowData: any) => {
              const activityType = rowData?.activityType?.toUpperCase();
              if (!activityType) return [];
              const allowedSubtypes = SUBTYPES_BY_ACTIVITY_TYPE[activityType] || [];
              return allowedSubtypes.map((subtype) => ({
                value: subtype,
                label: t(`activity.subtype.${subtype}`, {
                  defaultValue: SUBTYPE_DISPLAY_NAMES[subtype] || subtype,
                }),
              }));
            }) as any,
            allowEmpty: true,
            emptyLabel: t("activity.form.subtype_none"),
          },
        },
      },
      // 7. External (checkbox for TRANSFER_IN/TRANSFER_OUT only)
      {
        id: "isExternal",
        accessorKey: "isExternal",
        header: t("activity.data_grid.col.external"),
        size: 80,
        enableSorting: false,
        enableHiding: true,
        meta: {
          cell: {
            variant: "checkbox",
            // Only enabled for transfer types
            isDisabled: (rowData: unknown) => {
              const row = rowData as LocalTransaction;
              const activityType = row.activityType?.toUpperCase();
              return (
                activityType !== ActivityType.TRANSFER_IN &&
                activityType !== ActivityType.TRANSFER_OUT
              );
            },
          },
        },
      },
      // 8. Symbol
      {
        accessorKey: "assetSymbol",
        header: t("activity.data_grid.col.assetSymbol"),
        size: 160,
        meta: {
          cell: {
            variant: "symbol",
            isDisabled: (rowData: unknown) => {
              const row = rowData as LocalTransaction;
              return (
                isCashActivity(row.activityType ?? "") && !isTransferActivity(row.activityType)
              );
            },
            getDisplayContext: (rowData: unknown) => {
              const row = rowData as LocalTransaction;
              const symbol = (row.assetSymbol ?? "").trim().toUpperCase();
              if (!symbol || symbol === "CASH" || symbol.startsWith("$CASH")) {
                return undefined;
              }
              // Show contract description for options
              const parsed = row.instrumentType === "OPTION" ? parseOccSymbol(symbol) : null;
              if (parsed) {
                const localeTag = i18n.language?.startsWith("de") ? "de-DE" : "en-US";
                const expDisplay = new Date(parsed.expiration + "T12:00:00").toLocaleDateString(
                  localeTag,
                  { month: "short", day: "numeric" },
                );
                return `${expDisplay} $${parsed.strikePrice} ${parsed.optionType}`;
              }
              return getExchangeDisplayName(row.exchangeMic);
            },
            isClearable: (rowData: unknown) => {
              const row = rowData as LocalTransaction;
              return !isSymbolRequired(row.activityType ?? "");
            },
            onSearch: handleSymbolSearch,
            onSelect: onSymbolSelect
              ? (rowIndex: number, _symbol: string, result?: SymbolSearchResult) => {
                  if (result) {
                    onSymbolSelect(rowIndex, result);
                  }
                }
              : undefined,
            onCreateCustomAsset,
          },
        },
      },

      // 9. Instrument Type (hidden by default, editable select)
      {
        id: "instrumentType",
        accessorKey: "instrumentType",
        header: t("activity.data_grid.col.instrumentType"),
        size: 120,
        enableSorting: false,
        enableHiding: true,
        meta: {
          cell: {
            variant: "select",
            options: instrumentTypeOptions,
            allowEmpty: true,
            emptyLabel: t("settings.securities.table.auto"),
          },
        },
      },

      // === Numbers (grouped, right-aligned) ===
      // 10. Quantity
      {
        accessorKey: "quantity",
        header: t("activity.data_grid.col.quantity"),
        size: 120,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001, valueType: "string" } },
      },
      // 9. Price
      {
        accessorKey: "unitPrice",
        header: t("activity.data_grid.col.unitPrice"),
        size: 120,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001, valueType: "string" } },
      },
      // 10. Amount (most important money column)
      {
        accessorKey: "amount",
        header: t("activity.data_grid.col.amount"),
        size: 120,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001, valueType: "string" } },
      },
      // 11. Currency
      {
        accessorKey: "currency",
        header: t("activity.data_grid.col.currency"),
        size: 110,
        enableSorting: false,
        meta: { cell: { variant: "currency" } },
      },
      // 12. Fee
      {
        accessorKey: "fee",
        header: t("activity.data_grid.col.fee"),
        size: 100,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001, valueType: "string" } },
      },
      // 13. FX Rate (lowest priority; often hidden)
      {
        accessorKey: "fxRate",
        header: t("activity.data_grid.col.fxRate"),
        size: 100,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001, valueType: "string" } },
      },

      // === Notes + actions ===
      // 14. Comment
      {
        accessorKey: "comment",
        header: t("activity.data_grid.col.comment"),
        size: 260,
        enableSorting: false,
        meta: { cell: { variant: "long-text" } },
      },
      // 15. Activity Status (badge)
      {
        id: "activityStatus",
        accessorKey: "status",
        header: t("activity.data_grid.col.activityStatus"),
        size: 100,
        enableSorting: false,
        enableHiding: true,
        cell: ({ row }) => {
          const status = row.original.status;
          if (!status) return <span className="text-muted-foreground">—</span>;
          const variant = STATUS_VARIANT[status] ?? "default";
          const label = t(`activity.data_grid.status.${status}`, { defaultValue: status });
          return (
            <Badge variant={variant} className="text-xs font-normal">
              {label}
            </Badge>
          );
        },
      },
      // 16. Actions
      {
        id: "actions",
        header: () => null,
        size: 64,
        enableSorting: false,
        enableResizing: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex size-full items-center justify-center">
            <ActivityOperations
              activity={row.original}
              onEdit={onEditActivity}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          </div>
        ),
      },
    ],
    [
      t,
      i18n.language,
      accountOptions,
      activityTypeOptions,
      instrumentTypeOptions,
      handleSymbolSearch,
      onCreateCustomAsset,
      onDelete,
      onDuplicate,
      onEditActivity,
      onSymbolSelect,
    ],
  );

  return columns;
}
