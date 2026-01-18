import { searchTicker } from "@/commands/market-data";
import {
  ActivityStatus,
  ActivityType,
  ActivityTypeNames,
  SUBTYPE_DISPLAY_NAMES,
} from "@/lib/constants";
import type { Account, ActivityDetails } from "@/lib/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, Checkbox, type SymbolSearchResult } from "@wealthfolio/ui";
import { useCallback, useMemo } from "react";
import { ActivityOperations } from "../activity-operations";
import { ActivityTypeBadge } from "../activity-type-badge";
import { StatusHeaderIndicator, StatusIndicator } from "./status-indicator";
import { isPendingReview, type LocalTransaction } from "./types";

// Status display names and colors
const STATUS_DISPLAY: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  [ActivityStatus.POSTED]: { label: "Posted", variant: "default" },
  [ActivityStatus.PENDING]: { label: "Pending", variant: "secondary" },
  [ActivityStatus.DRAFT]: { label: "Draft", variant: "outline" },
  [ActivityStatus.VOID]: { label: "Void", variant: "destructive" },
};

interface UseActivityColumnsOptions {
  accounts: Account[];
  onEditActivity: (activity: ActivityDetails) => void;
  onDuplicate: (activity: ActivityDetails) => void;
  onDelete: (activity: ActivityDetails) => void;
  /** Called when a symbol is selected from search, with the full result including exchangeMic */
  onSymbolSelect?: (rowIndex: number, result: SymbolSearchResult) => void;
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
}: UseActivityColumnsOptions) {
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
      score: result.score,
      dataSource: result.dataSource,
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
            aria-label="Select all rows"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
            aria-label="Select row"
          />
        ),
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
        header: "Date & Time",
        size: 180,
        meta: { cell: { variant: "datetime" } },
      },
      // 4. Account
      {
        id: "accountName",
        accessorKey: "accountId",
        header: "Account",
        size: 180,
        meta: { cell: { variant: "select", options: accountOptions } },
      },

      // === Identity / classification ===
      // 5. Type
      {
        accessorKey: "activityType",
        header: "Type",
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
      // 6. Subtype (hidden by default; show when type implies ambiguity)
      {
        id: "subtype",
        accessorKey: "subtype",
        header: "Subtype",
        size: 140,
        enableSorting: false,
        enableHiding: true,
        cell: ({ row }) => {
          const subtype = row.original.subtype;
          if (!subtype) return <span className="text-muted-foreground">—</span>;
          const displayName = SUBTYPE_DISPLAY_NAMES[subtype] || subtype;
          return <span className="text-xs">{displayName}</span>;
        },
      },
      // 7. Symbol
      {
        accessorKey: "assetSymbol",
        header: "Symbol",
        size: 140,
        meta: {
          cell: {
            variant: "symbol",
            onSearch: handleSymbolSearch,
            onSelect: onSymbolSelect
              ? (rowIndex: number, _symbol: string, result?: SymbolSearchResult) => {
                  if (result) {
                    onSymbolSelect(rowIndex, result);
                  }
                }
              : undefined,
          },
        },
      },

      // === Numbers (grouped, right-aligned) ===
      // 8. Quantity
      {
        accessorKey: "quantity",
        header: "Quantity",
        size: 120,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001 } },
      },
      // 9. Price
      {
        accessorKey: "unitPrice",
        header: "Price",
        size: 120,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001 } },
      },
      // 10. Amount (most important money column)
      {
        accessorKey: "amount",
        header: "Amount",
        size: 120,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001 } },
      },
      // 11. Currency
      {
        accessorKey: "currency",
        header: "Currency",
        size: 110,
        enableSorting: false,
        meta: { cell: { variant: "currency" } },
      },
      // 12. Fee
      {
        accessorKey: "fee",
        header: "Fee",
        size: 100,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001 } },
      },
      // 13. FX Rate (lowest priority; often hidden)
      {
        accessorKey: "fxRate",
        header: "FX Rate",
        size: 100,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001 } },
      },

      // === Notes + actions ===
      // 14. Comment
      {
        accessorKey: "comment",
        header: "Comment",
        size: 260,
        enableSorting: false,
        meta: { cell: { variant: "long-text" } },
      },
      // 15. Activity Status (badge)
      {
        id: "activityStatus",
        accessorKey: "status",
        header: "Status",
        size: 100,
        enableSorting: false,
        enableHiding: true,
        cell: ({ row }) => {
          const status = row.original.status;
          if (!status) return <span className="text-muted-foreground">—</span>;
          const displayInfo = STATUS_DISPLAY[status] || {
            label: status,
            variant: "default" as const,
          };
          return (
            <Badge variant={displayInfo.variant} className="text-xs font-normal">
              {displayInfo.label}
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
      accountOptions,
      activityTypeOptions,
      handleSymbolSearch,
      onDelete,
      onDuplicate,
      onEditActivity,
      onSymbolSelect,
    ],
  );

  return columns;
}
