import { ActivityType, ActivityTypeNames } from "@/lib/constants";
import type { Account, ActivityDetails } from "@/lib/types";
import { formatDateTimeLocal } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox, worldCurrencies } from "@wealthfolio/ui";
import { useMemo } from "react";
import { ActivityOperations } from "../activity-operations";
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
              table.getIsAllRowsSelected() ||
              (table.getIsSomeRowsSelected() && "indeterminate")
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
        size: 44,
        enableSorting: false,
        enableResizing: false,
        enableHiding: false,
      },
      {
        accessorKey: "activityType",
        header: "Type",
        size: 170,
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
    [
      accountOptions,
      activityTypeOptions,
      currencyOptions,
      onDelete,
      onDuplicate,
      onEditActivity,
    ],
  );

  return columns;
}
