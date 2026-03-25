import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { TickerAvatar } from "@/components/ticker-avatar";
import { DataTableColumnHeader } from "@/components/ui/data-table/data-table-column-header";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icons } from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  calculateActivityValue,
  isCashActivity,
  isCashTransfer,
  isFeeActivity,
  isIncomeActivity,
  isSplitActivity,
} from "@/lib/activity-utils";
import { ActivityType } from "@/lib/constants";
import { ActivityDetails } from "@/lib/types";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import {
  type OnChangeFn,
  type VisibilityState,
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Button, formatAmount } from "@wealthvn/ui";
import { Link } from "react-router-dom";
import { useActivityMutations } from "../../hooks/use-activity-mutations";
import { ActivityOperations } from "../activity-operations";
import { ActivityTypeBadge } from "../activity-type-badge";

interface ActivityTableProps {
  activities: ActivityDetails[];
  isLoading: boolean;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  handleEdit: (activity?: ActivityDetails) => void;
  handleDelete: (activity: ActivityDetails) => void;
}

export const ActivityTable = ({
  activities,
  isLoading,
  sorting,
  onSortingChange,
  handleEdit,
  handleDelete,
}: ActivityTableProps) => {
  const { t } = useTranslation(["activity"]);
  const { formatDateTimeDisplay } = useDateFormatter();
  const { duplicateActivityMutation } = useActivityMutations();

  const handleDuplicate = React.useCallback(
    async (activity: ActivityDetails) => duplicateActivityMutation.mutateAsync(activity),
    [duplicateActivityMutation],
  );

  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({
    accountId: false,
    accountCurrency: false,
    assetName: false,
    currency: false,
  });

  // Phase 5: State for expanded transfers
  const [expandedTransferIds, setExpandedTransferIds] = useState<Set<string>>(new Set());

  // Phase 5: Process activities to group TRANSFER_IN as subRows of TRANSFER_OUT
  const processedActivities = useMemo(() => {
    const transferInByLinkId = new Map<string, ActivityDetails>();
    const transferInIds = new Set<string>();

    // First pass: collect all TRANSFER_IN activities by their transferLinkId
    // Handle both camelCase (transferLinkId) and snake_case (transfer_link_id) from backend
    for (const activity of activities) {
      const linkId = activity.transferLinkId ?? (activity as any).transfer_link_id;
      if (activity.activityType === ActivityType.TRANSFER_IN && linkId) {
        transferInByLinkId.set(linkId, activity);
        transferInIds.add(activity.id);
      }
    }

    // Second pass: build result array in original order
    const result: ActivityDetails[] = [];
    for (const activity of activities) {
      const linkId = activity.transferLinkId ?? (activity as any).transfer_link_id;

      // Skip TRANSFER_IN that have been paired - they'll be shown as subRows
      if (activity.activityType === ActivityType.TRANSFER_IN && linkId && transferInByLinkId.has(linkId)) {
        continue;
      }

      // TRANSFER_OUT with linkId - add with subRows if paired TRANSFER_IN exists
      if (activity.activityType === ActivityType.TRANSFER_OUT && linkId) {
        const transferIn = transferInByLinkId.get(linkId);
        result.push({
          ...activity,
          subRows: transferIn ? [transferIn] : undefined,
        });
      } else {
        // All other activities (including transfers without linkId)
        result.push(activity);
      }
    }

    return result;
  }, [activities]);

  // Phase 6: Toggle function for expanded transfers
  const toggleTransferExpanded = (transferLinkId: string) => {
    setExpandedTransferIds((prev) => {
      const next = new Set(prev);
      if (next.has(transferLinkId)) {
        next.delete(transferLinkId);
      } else {
        next.add(transferLinkId);
      }
      return next;
    });
  };

  const columns: ColumnDef<ActivityDetails>[] = React.useMemo(
    () => [
      {
        id: "activityType",
        accessorKey: "activityType",
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("activity:table.type")} />
        ),
        cell: ({ row }) => {
          const activityType = row.getValue("activityType");
          return (
            <div className="flex items-center justify-center text-sm">
              <ActivityTypeBadge
                type={activityType as ActivityType}
                className="text-xs font-normal whitespace-nowrap"
              />
            </div>
          );
        },
        filterFn: (row, id, value: string) => {
          const cellValue = row.getValue(id);
          if (!cellValue) {
            return false;
          }

          return value.includes(cellValue as string);
        },
      },
      {
        id: "date",
        accessorKey: "date",
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("activity:table.date")} />
        ),
        cell: ({ row }) => {
          const dateVal = row.getValue("date");
          const formattedDateTime = formatDateTimeDisplay(
            typeof dateVal === "string" || dateVal instanceof Date ? dateVal : String(dateVal),
          );
          return (
            <div className="ml-2 flex flex-col">
              <span>{formattedDateTime}</span>
            </div>
          );
        },
      },
      {
        id: "assetSymbol",
        accessorKey: "assetSymbol",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("activity:table.symbol")} />
        ),
        cell: ({ row }) => {
          const symbol = String(row.getValue("assetSymbol"));
          const displaySymbol = symbol.startsWith("$CASH") ? symbol.split("-")[0] : symbol;
          const avatarSymbol = symbol.startsWith("$CASH") ? "$CASH" : symbol;

          const isCash = symbol.startsWith("$CASH");
          const assetName = row.getValue("assetName");
          const currency = row.getValue("currency");

          const content = (
            <div className="flex max-w-[200px] items-center gap-2">
              <TickerAvatar symbol={avatarSymbol} className="h-8 w-8 shrink-0" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{displaySymbol}</span>
                <span className="text-muted-foreground truncate text-xs font-light">
                  {isCash ? String(currency) : String(assetName)}
                </span>
              </div>
            </div>
          );

          if (isCash) {
            return content;
          }

          return (
            <Link to={`/holdings/${encodeURIComponent(symbol)}`} className="-m-1 block p-1">
              {content}
            </Link>
          );
        },
        enableHiding: false,
      },
      {
        id: "quantity",
        accessorKey: "quantity",
        enableHiding: true,
        enableSorting: false,
        meta: {
          label: t("activity:table.quantity"),
        },
        header: ({ column }) => (
          <DataTableColumnHeader
            className="justify-end text-right"
            column={column}
            title={t("activity:table.quantity")}
          />
        ),
        cell: ({ row }) => {
          const activityType = String(row.getValue("activityType"));
          const quantity = row.getValue("quantity");
          const activity = row.original;
          const linkId = activity.transferLinkId ?? (activity as any).transfer_link_id;
          const isExpanded = expandedTransferIds.has(linkId || "");
          const hasSubRows = activity.subRows && activity.subRows.length > 0;

          // Show expander button for TRANSFER_OUT with transfer link
          if (activityType === ActivityType.TRANSFER_OUT && linkId) {
            return (
              <div className="flex justify-center pr-4">
                <button
                  onClick={() => toggleTransferExpanded(linkId!)}
                  className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted transition-colors"
                  aria-label={isExpanded ? "Collapse transfer details" : "Expand transfer details"}
                  title={isExpanded ? "Hide transfer details" : "Show transfer details"}
                >
                  {isExpanded ? (
                    <Icons.ChevronUp className="h-4 w-4 transition-transform duration-200 text-muted-foreground" />
                  ) : (
                    <Icons.ChevronDown className="h-4 w-4 transition-transform duration-200 text-muted-foreground" />
                  )}
                </button>
              </div>
            );
          }

          if (
            isCashActivity(activityType) ||
            isIncomeActivity(activityType) ||
            isSplitActivity(activityType) ||
            isFeeActivity(activityType)
          ) {
            return <div className="pr-4 text-center">-</div>;
          }

          return <div className="pr-4 text-center">{String(quantity)}</div>;
        },
      },
      {
        id: "unitPrice",
        accessorKey: "unitPrice",
        enableSorting: false,
        enableHiding: true,
        meta: {
          label: t("activity:table.priceAmount"),
        },
        header: ({ column }) => (
          <DataTableColumnHeader
            className="justify-end text-right"
            column={column}
            title={t("activity:table.priceAmount")}
          />
        ),
        cell: ({ row }) => {
          const activityType = String(row.getValue("activityType"));
          const unitPrice = Number(row.getValue("unitPrice"));
          const amount = row.original.amount;
          const currencyVal = row.getValue("currency");
          const currency = typeof currencyVal === "string" ? currencyVal : "USD";
          const assetSymbol = String(row.getValue("assetSymbol"));

          if (activityType === "FEE") {
            return <div className="pr-4 text-right">-</div>;
          }
          if (activityType === "SPLIT") {
            return <div className="text-right">{Number(amount).toFixed(0)} : 1</div>;
          }
          if (
            isCashActivity(activityType) ||
            isCashTransfer(activityType, assetSymbol) ||
            isIncomeActivity(activityType)
          ) {
            return <div className="text-right">{formatAmount(amount, currency)}</div>;
          }

          return <div className="text-right">{formatAmount(unitPrice, currency)}</div>;
        },
      },
      {
        id: "fee",
        accessorKey: "fee",
        enableHiding: true,
        enableSorting: false,
        meta: {
          label: t("activity:table.fee"),
        },
        header: ({ column }) => (
          <DataTableColumnHeader
            className="justify-end text-right"
            column={column}
            title={t("activity:table.fee")}
          />
        ),
        cell: ({ row }) => {
          const activityType = String(row.getValue("activityType"));
          const fee = Number(row.getValue("fee"));
          const currencyVal = row.getValue("currency");
          const currency = typeof currencyVal === "string" ? currencyVal : "USD";

          return (
            <div className="text-right">
              {activityType === "SPLIT" ? "-" : formatAmount(fee, currency)}
            </div>
          );
        },
      },
      {
        id: "value",
        accessorKey: "value",
        enableSorting: false,
        enableHiding: true,
        meta: {
          label: t("activity:table.total"),
        },
        header: ({ column }) => (
          <DataTableColumnHeader
            className="justify-end text-right"
            column={column}
            title={t("activity:table.total")}
          />
        ),
        cell: ({ row }) => {
          const activity = row.original;
          const activityType = activity.activityType;
          const currency = activity.currency || "USD";

          if (activityType === "SPLIT") {
            return <div className="pr-4 text-right">-</div>;
          }

          const displayValue = calculateActivityValue(activity);
          return <div className="pr-4 text-right">{formatAmount(displayValue, currency)}</div>;
        },
      },
      {
        id: "account",
        accessorKey: "accountName",
        enableSorting: false,
        enableHiding: true,
        meta: {
          label: t("activity:table.account"),
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("activity:table.account")} />
        ),
        cell: ({ row }) => {
          const accountName = row.getValue("account");
          const accountCurrency = row.getValue("accountCurrency");
          return (
            <div className="ml-2 flex min-w-[150px] flex-col">
              <span>{String(accountName)}</span>
              <span className="text-muted-foreground text-xs font-light">
                {String(accountCurrency)}
              </span>
            </div>
          );
        },
      },
      {
        id: "currency",
        accessorKey: "currency",
        enableSorting: false,
        enableHiding: true,
        meta: {
          label: t("activity:table.currency"),
        },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t("activity:table.currency")} />
        ),
        cell: ({ row }) => <div>{row.getValue("currency")}</div>,
      },
      {
        id: "assetName",
        accessorKey: "assetName",
        enableHiding: false,
      },
      {
        id: "accountCurrency",
        accessorKey: "accountCurrency",
        enableHiding: false,
      },
      {
        id: "accountId",
        accessorKey: "accountId",
        filterFn: (row, id, value: string) => {
          const cellValue = row.getValue(id);
          if (!cellValue) {
            return false;
          }

          return value.includes(cellValue as string);
        },
        enableHiding: false,
      },
      {
        id: "actions",
        header: ({ table }) => {
          const hideableColumns = table.getAllColumns().filter((column) => column.getCanHide());
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    title={t("activity:table.toggleColumns")}
                  >
                    <Icons.ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {hideableColumns.map((column) => {
                    const meta = column.columnDef.meta as { label?: string } | undefined;
                    return (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        className="capitalize"
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) => column.toggleVisibility(!!value)}
                      >
                        {meta?.label ?? column.id}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
        cell: ({ row }) => {
          return (
            <ActivityOperations
              row={row}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
            />
          );
        },
        enableHiding: false,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleEdit, handleDelete, handleDuplicate],
  );

  const handleSortingChange = React.useCallback<OnChangeFn<SortingState>>(
    (updaterOrValue) => {
      const nextSorting =
        typeof updaterOrValue === "function" ? updaterOrValue(sorting) : updaterOrValue;
      onSortingChange(nextSorting);
    },
    [onSortingChange, sorting],
  );

  const table = useReactTable({
    data: processedActivities,
    columns,
    manualSorting: true,
    onSortingChange: handleSortingChange,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnVisibility,
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    debugTable: true,
  });

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        {t("activity:controls.loading")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader className="bg-muted-foreground/5 sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows?.length > 0 ? (
              table.getRowModel().rows.map((row) => {
                const activity = row.original;
                const linkId = activity.transferLinkId ?? (activity as any).transfer_link_id;
                const isExpanded = expandedTransferIds.has(linkId || "");
                const subRows = activity.subRows || [];

                return (
                  <React.Fragment key={row.id}>
                    <TableRow className={subRows.length > 0 ? "group/row" : undefined}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                    {/* Render subRows for transfer pairing */}
                    {isExpanded && subRows.length > 0 && subRows.map((subRowActivity, index) => (
                      <TableRow key={`${row.id}-sub-${index}`} className="bg-muted/30">
                        {row.getVisibleCells().map((cell) => {
                          const columnId = cell.column.id;
                          // Create sub-row cell content
                          let subCellContent: React.ReactNode;

                          switch (columnId) {
                            case "activityType":
                              subCellContent = (
                                <div className="flex items-center justify-center text-sm">
                                  <ActivityTypeBadge
                                    type={subRowActivity.activityType as ActivityType}
                                    className="text-xs font-normal whitespace-nowrap"
                                  />
                                </div>
                              );
                              break;
                            case "date":
                              const subDate = formatDateTimeDisplay(subRowActivity.date);
                              subCellContent = (
                                <div className="ml-2 flex flex-col">
                                  <span>{subDate}</span>
                                </div>
                              );
                              break;
                            case "assetSymbol":
                              subCellContent = (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Icons.ArrowRight className="h-3 w-3" />
                                    {t("activity:table.to")}: {subRowActivity.accountName}
                                  </span>
                                </div>
                              );
                              break;
                            case "quantity":
                              // Show indicator for transfer destination row
                              subCellContent = (
                                <div className="flex justify-center pr-4">
                                  <Icons.ArrowRight className="h-4 w-4 text-muted-foreground" />
                                </div>
                              );
                              break;
                            case "unitPrice":
                            case "fee":
                              subCellContent = <div className="text-right">-</div>;
                              break;
                            case "value":
                              const subValue = calculateActivityValue(subRowActivity);
                              subCellContent = (
                                <div className="pr-4 text-right text-green-600">
                                  +{formatAmount(subValue, subRowActivity.currency || "USD")}
                                </div>
                              );
                              break;
                            case "account":
                              subCellContent = (
                                <div className="ml-2 flex min-w-[150px] flex-col">
                                  <span>{subRowActivity.accountName}</span>
                                  <span className="text-muted-foreground text-xs font-light">
                                    {subRowActivity.accountCurrency}
                                  </span>
                                </div>
                              );
                              break;
                            case "currency":
                              subCellContent = <div>{subRowActivity.currency}</div>;
                              break;
                            case "actions":
                              subCellContent = (
                                <ActivityOperations
                                  activity={subRowActivity}
                                  onEdit={handleEdit}
                                  onDelete={handleDelete}
                                  onDuplicate={handleDuplicate}
                                />
                              );
                              break;
                            default:
                              subCellContent = null;
                          }

                          return (
                            <TableCell key={`${row.id}-sub-${index}-${columnId}`}>
                              {subCellContent}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </React.Fragment>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  {t("activity:table.noActivityFound")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ActivityTable;
