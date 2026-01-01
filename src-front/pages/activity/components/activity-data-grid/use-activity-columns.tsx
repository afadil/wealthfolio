import { searchTicker } from "@/commands/market-data";
import { ActivityType, ActivityTypeNames, ActivityStatus, SUBTYPE_DISPLAY_NAMES } from "@/lib/constants";
import type { Account, ActivityDetails } from "@/lib/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, Checkbox, type SymbolSearchResult } from "@wealthfolio/ui";
import { useCallback, useMemo } from "react";
import { ActivityOperations } from "../activity-operations";
import { ActivityTypeBadge } from "../activity-type-badge";
import { StatusHeaderIndicator, StatusIndicator } from "./status-indicator";
import { isPendingReview, type LocalTransaction } from "./types";

// Status display names and colors
const STATUS_DISPLAY: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
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
}

/**
 * Hook to create column definitions for the activity data grid
 */
export function useActivityColumns({
  accounts,
  onEditActivity,
  onDuplicate,
  onDelete,
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
      score: result.score,
      dataSource: result.dataSource,
    }));
  }, []);

  const columns = useMemo<ColumnDef<LocalTransaction>[]>(
    () => [
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
          const displayInfo = STATUS_DISPLAY[status] || { label: status, variant: "default" as const };
          return (
            <Badge variant={displayInfo.variant} className="text-xs font-normal">
              {displayInfo.label}
            </Badge>
          );
        },
      },
      {
        id: "date",
        accessorKey: "date",
        header: "Date & Time",
        size: 180,
        meta: { cell: { variant: "datetime" } },
      },
      {
        accessorKey: "assetSymbol",
        header: "Symbol",
        size: 140,
        meta: { cell: { variant: "symbol", onSearch: handleSymbolSearch } },
      },
      {
        accessorKey: "quantity",
        header: "Quantity",
        size: 120,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001 } },
      },
      {
        accessorKey: "unitPrice",
        header: "Price",
        size: 120,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001 } },
      },
      {
        accessorKey: "amount",
        header: "Amount",
        size: 120,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001 } },
      },
      {
        accessorKey: "fee",
        header: "Fee",
        size: 100,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001 } },
      },
      {
        accessorKey: "fxRate",
        header: "FX Rate",
        size: 100,
        enableSorting: false,
        meta: { cell: { variant: "number", step: 0.000001 } },
      },
      {
        // Uses accountId for data but sorts by accountName on the API
        id: "accountName",
        accessorKey: "accountId",
        header: "Account",
        size: 180,
        meta: { cell: { variant: "select", options: accountOptions } },
      },
      {
        accessorKey: "currency",
        header: "Currency",
        size: 110,
        enableSorting: false,
        meta: { cell: { variant: "currency" } },
      },
      {
        accessorKey: "comment",
        header: "Comment",
        size: 260,
        enableSorting: false,
        meta: { cell: { variant: "long-text" } },
      },
      {
        id: "actions",
        size: 64,
        enableSorting: false,
        enableResizing: false,
        enableHiding: false,
        cell: ({ row }) => (
          <ActivityOperations
            activity={row.original}
            onEdit={onEditActivity}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
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
    ],
  );

  return columns;
}
