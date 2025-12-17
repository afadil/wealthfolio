import { ActivityType, ActivityTypeNames } from "@/lib/constants";
import type { Account, ActivityDetails } from "@/lib/types";
import { formatDateTimeLocal } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Checkbox,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  worldCurrencies,
} from "@wealthfolio/ui";
import { useMemo } from "react";
import { ActivityOperations } from "../activity-operations";
import { ActivityTypeBadge } from "../activity-type-badge";
import type { LocalTransaction } from "./types";

interface UseActivityColumnsOptions {
  accounts: Account[];
  localTransactions: LocalTransaction[];
  onEditActivity: (activity: ActivityDetails) => void;
  onDuplicate: (activity: ActivityDetails) => void;
  onDelete: (activity: ActivityDetails) => void;
}

/**
 * Hook to create column definitions for the activity data grid
 */
export function useActivityColumns({
  accounts,
  localTransactions,
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

  const currencyOptions = useMemo(() => {
    const entries = new Set<string>();

    // Add all world currencies
    worldCurrencies.forEach(({ value }) => entries.add(value));

    // Add account currencies
    accounts.forEach((account) => {
      if (account.currency) entries.add(account.currency);
    });

    // Add currencies from local transactions
    localTransactions.forEach((transaction) => {
      if (transaction.currency) entries.add(transaction.currency);
    });

    return Array.from(entries)
      .sort()
      .map((value) => ({ value, label: value }));
  }, [accounts, localTransactions]);

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
        header: () => (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-destructive w-full cursor-help text-center">●</div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Newly imported &</p>
                <p>Pending verification</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ),
        size: 32,
        minSize: 32,
        maxSize: 32,
        enableResizing: false,
        enableSorting: false,
        enableHiding: false,
        enablePinning: false,
        cell: ({ row }) => {
          const isDraft = row.original.isDraft;
          const isNew = row.original.isNew;

          // Show indicator for synced activities that need review (isDraft=true and not a locally created new row)
          const needsReview = isDraft === true && isNew !== true;

          if (!needsReview) {
            return null;
          }

          return (
            <div className="flex h-full w-full items-center justify-center">
              <div className="text-destructive w-full cursor-help text-center">●</div>
            </div>
          );
        },
      },
      {
        accessorKey: "activityType",
        header: "Type",
        size: 150,
        enablePinning: false,
        cell: ({ row }) => {
          const type = row.original.activityType as ActivityType;
          return <ActivityTypeBadge type={type} className="text-xs font-normal" />;
        },
        meta: { cell: { variant: "select", options: activityTypeOptions } },
      },
      {
        id: "date",
        header: "Date & Time",
        size: 180,
        accessorFn: (row) => formatDateTimeLocal(row.date),
        meta: { cell: { variant: "short-text" } },
      },
      {
        accessorKey: "assetSymbol",
        header: "Symbol",
        size: 140,
        meta: { cell: { variant: "short-text" } },
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
        header: "Unit Price",
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
        meta: { cell: { variant: "select", options: currencyOptions } },
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
    [accountOptions, activityTypeOptions, currencyOptions, onDelete, onDuplicate, onEditActivity],
  );

  return columns;
}
