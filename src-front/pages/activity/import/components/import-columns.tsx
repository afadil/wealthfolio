import { useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox, type SymbolSearchResult } from "@wealthfolio/ui";
import { ActivityType, ActivityTypeNames, SUBTYPES_BY_ACTIVITY_TYPE, SUBTYPE_DISPLAY_NAMES } from "@/lib/constants";
import { ActivityTypeBadge } from "../../components/activity-type-badge";

// ─────────────────────────────────────────────────────────────────────────────
// Shared Import Row Type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Common fields for import row data across different import grids.
 * Both DraftActivity and AI import transactions should conform to this interface.
 */
export interface ImportRowData {
  // Identity
  rowIndex?: number;
  sourceRow?: number;

  // Core fields
  activityDate?: string | Date;
  activityType?: string;
  subtype?: string;
  isExternal?: boolean;
  symbol?: string;
  assetSymbol?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  currency?: string;
  fee?: number;
  fxRate?: number;
  accountId?: string;
  comment?: string;

  // Validation (optional - not all grids use these)
  status?: string;
  isValid?: boolean;
  errors?: Record<string, string[]> | string[];
  warnings?: Record<string, string[]> | string[];
  skipReason?: string;
  duplicateOfId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Column Options
// ─────────────────────────────────────────────────────────────────────────────

export interface UseImportColumnsOptions<T extends ImportRowData> {
  accounts: { id: string; name: string }[];
  onSymbolSearch: (query: string) => Promise<SymbolSearchResult[]>;
  onSymbolSelect?: (rowIndex: number, symbol: string, result?: SymbolSearchResult) => void;
  onCreateCustomAsset?: (rowIndex: number, symbol: string) => void;
  /** Whether to include selection column */
  enableSelection?: boolean;
  /** Whether to include row status column */
  enableStatusColumn?: boolean;
  /** Custom status cell renderer */
  renderStatusCell?: (row: T) => React.ReactNode;
  /** Field name for the symbol (default: "symbol") */
  symbolField?: "symbol" | "assetSymbol";
  /** Field name for the date (default: "activityDate") */
  dateField?: "activityDate" | "date";
}

// ─────────────────────────────────────────────────────────────────────────────
// Column Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useImportColumns<T extends ImportRowData>({
  accounts,
  onSymbolSearch,
  onSymbolSelect,
  onCreateCustomAsset,
  enableSelection = true,
  enableStatusColumn = true,
  renderStatusCell,
  symbolField = "symbol",
  dateField = "activityDate",
}: UseImportColumnsOptions<T>): ColumnDef<T>[] {
  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        value: account.id,
        label: account.name,
      })),
    [accounts]
  );

  const activityTypeOptions = useMemo(
    () =>
      Object.values(ActivityType).map((type) => ({
        value: type,
        label: ActivityTypeNames[type],
      })),
    []
  );

  // Dynamic subtype options based on activity type
  const getSubtypeOptions = useCallback((rowData: unknown) => {
    const row = rowData as ImportRowData;
    const activityType = row.activityType?.toUpperCase();
    if (!activityType) return [];

    const allowedSubtypes = SUBTYPES_BY_ACTIVITY_TYPE[activityType] || [];
    return allowedSubtypes.map((subtype) => ({
      value: subtype,
      label: SUBTYPE_DISPLAY_NAMES[subtype] || subtype,
    }));
  }, []);

  return useMemo<ColumnDef<T>[]>(() => {
    const columns: ColumnDef<T>[] = [];

    // 1. Select column (optional)
    if (enableSelection) {
      columns.push({
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
      });
    }

    // 2. Status column (optional)
    if (enableStatusColumn) {
      columns.push({
        id: "status",
        header: "#",
        cell: ({ row }) => {
          if (renderStatusCell) {
            return renderStatusCell(row.original);
          }
          const rowNum = row.original.rowIndex ?? row.original.sourceRow ?? row.index;
          return <span className="text-muted-foreground text-xs">{rowNum + 1}</span>;
        },
        size: 70,
        minSize: 70,
        maxSize: 70,
        enableSorting: false,
        enableResizing: false,
        enableHiding: false,
        enablePinning: false,
      });
    }

    // 3. Date & Time
    columns.push({
      id: "activityDate",
      accessorKey: dateField,
      header: "Date & Time",
      size: 180,
      meta: { cell: { variant: "datetime" } },
    });

    // 4. Account
    columns.push({
      id: "accountId",
      accessorKey: "accountId",
      header: "Account",
      size: 180,
      meta: { cell: { variant: "select", options: accountOptions } },
    });

    // 5. Type
    columns.push({
      id: "activityType",
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
    });

    // 6. Subtype
    columns.push({
      id: "subtype",
      accessorKey: "subtype",
      header: "Subtype",
      size: 180,
      enableSorting: false,
      enableHiding: true,
      meta: {
        cell: {
          variant: "select",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          options: getSubtypeOptions as any,
          allowEmpty: true,
          emptyLabel: "None",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      },
    });

    // 7. External (checkbox for TRANSFER_IN/TRANSFER_OUT only)
    columns.push({
      id: "isExternal",
      accessorKey: "isExternal",
      header: "External",
      size: 80,
      enableSorting: false,
      enableHiding: true,
      meta: {
        cell: {
          variant: "checkbox",
          isDisabled: (rowData: unknown) => {
            const row = rowData as ImportRowData;
            const activityType = row.activityType?.toUpperCase();
            return (
              activityType !== ActivityType.TRANSFER_IN &&
              activityType !== ActivityType.TRANSFER_OUT
            );
          },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      },
    });

    // 8. Symbol
    columns.push({
      id: "symbol",
      accessorKey: symbolField,
      header: "Symbol",
      size: 140,
      meta: {
        cell: {
          variant: "symbol",
          onSearch: onSymbolSearch,
          onSelect: onSymbolSelect,
          onCreateCustomAsset,
        },
      },
    });

    // 9. Quantity
    columns.push({
      id: "quantity",
      accessorKey: "quantity",
      header: "Quantity",
      size: 120,
      enableSorting: false,
      meta: { cell: { variant: "number", step: 0.000001 } },
    });

    // 10. Price
    columns.push({
      id: "unitPrice",
      accessorKey: "unitPrice",
      header: "Price",
      size: 120,
      enableSorting: false,
      meta: { cell: { variant: "number", step: 0.000001 } },
    });

    // 11. Amount
    columns.push({
      id: "amount",
      accessorKey: "amount",
      header: "Amount",
      size: 120,
      enableSorting: false,
      meta: { cell: { variant: "number", step: 0.000001 } },
    });

    // 12. Currency
    columns.push({
      id: "currency",
      accessorKey: "currency",
      header: "Currency",
      size: 110,
      enableSorting: false,
      meta: { cell: { variant: "currency" } },
    });

    // 13. Fee
    columns.push({
      id: "fee",
      accessorKey: "fee",
      header: "Fee",
      size: 100,
      enableSorting: false,
      meta: { cell: { variant: "number", step: 0.000001 } },
    });

    // 14. FX Rate
    columns.push({
      id: "fxRate",
      accessorKey: "fxRate",
      header: "FX Rate",
      size: 100,
      enableSorting: false,
      meta: { cell: { variant: "number", step: 0.000001 } },
    });

    // 15. Comment
    columns.push({
      id: "comment",
      accessorKey: "comment",
      header: "Comment",
      size: 260,
      enableSorting: false,
      meta: { cell: { variant: "long-text" } },
    });

    return columns;
  }, [
    enableSelection,
    enableStatusColumn,
    renderStatusCell,
    dateField,
    accountOptions,
    activityTypeOptions,
    getSubtypeOptions,
    symbolField,
    onSymbolSearch,
    onSymbolSelect,
    onCreateCustomAsset,
  ]);
}
