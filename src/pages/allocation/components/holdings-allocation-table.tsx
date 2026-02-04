import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table/data-table-column-header";
import { TickerAvatar } from "@/components/ticker-avatar";
import { Button } from "@/components/ui/button";
import type {
  AssetClassTarget,
  CurrentAllocation,
  Holding,
  HoldingTarget,
} from "@/lib/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Lock } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

// Type for the flattened holding data with allocation info
export interface HoldingWithAllocation {
  id: string;
  symbol: string;
  name: string;
  assetClass: string;
  assetSubclass: string;
  currentValue: number;
  currentPortfolioPercent: number;
  targetPercentOfClass: number | null;
  targetPortfolioPercent: number | null;
  deviation: number | null;
  isLocked: boolean;
  holdingTarget: HoldingTarget | null;
  holding: Holding;
}

interface HoldingsAllocationTableProps {
  currentAllocation: CurrentAllocation;
  assetClassTargets: AssetClassTarget[];
  holdingTargets: HoldingTarget[];
  onNavigateToOverview: () => void;
}

// Calculate cascaded portfolio percent from holding target and asset class target
function calculateCascadedPercent(
  holdingTarget: HoldingTarget | undefined,
  assetClassTarget: AssetClassTarget | undefined,
): number | null {
  if (!holdingTarget || !assetClassTarget) return null;
  return (holdingTarget.targetPercentOfClass / 100) * assetClassTarget.targetPercent;
}

// Transform holdings data to flat table format with allocation info
function transformHoldingsToTableData(
  currentAllocation: CurrentAllocation,
  assetClassTargets: AssetClassTarget[],
  holdingTargets: HoldingTarget[],
): HoldingWithAllocation[] {
  const result: HoldingWithAllocation[] = [];

  for (const assetClass of currentAllocation.assetClasses) {
    const assetClassTarget = assetClassTargets.find(
      (t) => t.assetClass === assetClass.assetClass,
    );

    for (const subClass of assetClass.subClasses) {
      for (const holding of subClass.holdings) {
        const assetId = holding.instrument?.id || "";
        const holdingTarget = holdingTargets.find((t) => t.assetId === assetId);

        const targetPortfolioPercent = calculateCascadedPercent(
          holdingTarget,
          assetClassTarget,
        );

        const currentPercent =
          currentAllocation.totalValue > 0
            ? ((holding.marketValue?.base || 0) / currentAllocation.totalValue) * 100
            : 0;

        const deviation =
          targetPortfolioPercent !== null ? currentPercent - targetPortfolioPercent : null;

        result.push({
          id: holding.id,
          symbol: holding.instrument?.symbol || "$CASH",
          name: holding.instrument?.name || holding.instrument?.symbol || "Cash",
          assetClass: assetClass.assetClass,
          assetSubclass: holding.instrument?.assetSubclass || subClass.subClass,
          currentValue: holding.marketValue?.base || 0,
          currentPortfolioPercent: currentPercent,
          targetPercentOfClass: holdingTarget?.targetPercentOfClass ?? null,
          targetPortfolioPercent,
          deviation,
          isLocked: holdingTarget?.isLocked ?? false,
          holdingTarget: holdingTarget ?? null,
          holding,
        });
      }
    }
  }

  return result.sort((a, b) => b.currentValue - a.currentValue);
}

// Column definitions for the holdings allocation table
function getColumns(
  navigate: ReturnType<typeof useNavigate>,
): ColumnDef<HoldingWithAllocation>[] {
  return [
    {
      id: "symbol",
      accessorKey: "symbol",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Symbol" />
      ),
      cell: ({ row }) => {
        const symbol = row.original.symbol;
        const displaySymbol = symbol.startsWith("$CASH")
          ? symbol.split("-")[0]
          : symbol;
        const avatarSymbol = symbol.startsWith("$CASH") ? "$CASH" : symbol;

        return (
          <div className="flex items-center gap-2">
            <TickerAvatar symbol={avatarSymbol} className="h-8 w-8" />
            <span className="font-medium">{displaySymbol}</span>
          </div>
        );
      },
      filterFn: (row, _columnId, filterValue) => {
        const searchTerm = (filterValue as string).toLowerCase();
        const symbol = row.original.symbol.toLowerCase();
        const name = row.original.name.toLowerCase();
        return symbol.includes(searchTerm) || name.includes(searchTerm);
      },
      enableHiding: false,
    },
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="max-w-[200px] truncate text-sm text-muted-foreground">
          {row.original.name}
        </div>
      ),
    },
    {
      id: "assetClass",
      accessorKey: "assetClass",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Asset Class" />
      ),
      cell: ({ row }) => (
        <span className="text-sm">{row.original.assetClass}</span>
      ),
      filterFn: (row, _id, value) => {
        return (value as string[]).includes(row.getValue("assetClass") as string);
      },
    },
    {
      id: "assetSubclass",
      accessorKey: "assetSubclass",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Type" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.assetSubclass}
        </span>
      ),
      filterFn: (row, _id, value) => {
        return (value as string[]).includes(row.getValue("assetSubclass") as string);
      },
    },
    {
      id: "currentValue",
      accessorKey: "currentValue",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Value"
          className="justify-end text-right"
        />
      ),
      cell: ({ row }) => (
        <div className="text-right font-medium">
          {row.original.currentValue.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}
        </div>
      ),
    },
    {
      id: "targetPercentOfClass",
      accessorFn: (row) => row.targetPercentOfClass,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Target % (Class)"
          className="justify-end text-right"
        />
      ),
      cell: ({ row }) => {
        const target = row.original.targetPercentOfClass;
        return (
          <div className="text-right">
            {target !== null ? `${target.toFixed(1)}%` : "-"}
          </div>
        );
      },
    },
    {
      id: "targetPortfolioPercent",
      accessorFn: (row) => row.targetPortfolioPercent,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Target % (Total)"
          className="justify-end text-right"
        />
      ),
      cell: ({ row }) => {
        const cascaded = row.original.targetPortfolioPercent;
        return (
          <div className="text-right">
            {cascaded !== null ? `${cascaded.toFixed(1)}%` : "-"}
          </div>
        );
      },
    },
    {
      id: "currentPortfolioPercent",
      accessorKey: "currentPortfolioPercent",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Current %"
          className="justify-end text-right"
        />
      ),
      cell: ({ row }) => (
        <div className="text-right">
          {row.original.currentPortfolioPercent.toFixed(1)}%
        </div>
      ),
    },
    {
      id: "deviation",
      accessorFn: (row) => row.deviation,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Deviation"
          className="justify-end text-right"
        />
      ),
      cell: ({ row }) => {
        const deviation = row.original.deviation;
        if (deviation === null) {
          return <div className="text-right text-muted-foreground">-</div>;
        }

        const absDeviation = Math.abs(deviation);
        let colorClass = "text-muted-foreground"; // On target (within ±0.5%)

        if (absDeviation >= 0.5) {
          if (deviation < 0) {
            // Under-allocated (current < target)
            colorClass = "text-red-600 dark:text-red-400";
          } else {
            // Over-allocated (current > target)
            colorClass = "text-green-600 dark:text-green-400";
          }
        }

        return (
          <div className={`text-right font-medium ${colorClass}`}>
            {deviation > 0 ? "+" : ""}
            {deviation.toFixed(1)}%
          </div>
        );
      },
    },
    {
      id: "locked",
      accessorFn: (row) => row.isLocked,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Locked"
          className="justify-center"
        />
      ),
      cell: ({ row }) => {
        const isLocked = row.original.isLocked;
        return (
          <div className="flex justify-center">
            {isLocked ? (
              <Lock className="h-4 w-4 text-muted-foreground" />
            ) : null}
          </div>
        );
      },
      filterFn: (row, _id, value) => {
        const isLocked = row.original.isLocked;
        if ((value as string[]).includes("locked") && isLocked) return true;
        if ((value as string[]).includes("unlocked") && !isLocked) return true;
        return false;
      },
    },
    {
      id: "actions",
      enableHiding: false,
      header: () => null,
      cell: ({ row }) => {
        const symbol = row.original.symbol;
        const isCash = symbol.startsWith("$CASH");

        if (isCash) return null;

        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate(`/holdings/${encodeURIComponent(symbol)}`, {
                state: { holding: row.original.holding },
              })
            }
          >
            View
          </Button>
        );
      },
    },
  ];
}

export function HoldingsAllocationTable({
  currentAllocation,
  assetClassTargets,
  holdingTargets,
  onNavigateToOverview,
}: HoldingsAllocationTableProps) {
  const navigate = useNavigate();

  const tableData = useMemo(
    () =>
      transformHoldingsToTableData(
        currentAllocation,
        assetClassTargets,
        holdingTargets,
      ),
    [currentAllocation, assetClassTargets, holdingTargets],
  );

  const columns = useMemo(() => getColumns(navigate), [navigate]);

  // Build filter options from data
  const assetClassOptions = useMemo(() => {
    const uniqueClasses = new Set(tableData.map((h) => h.assetClass));
    return Array.from(uniqueClasses).map((c) => ({
      label: c,
      value: c,
    }));
  }, [tableData]);

  const typeOptions = useMemo(() => {
    const uniqueTypes = new Set(tableData.map((h) => h.assetSubclass));
    return Array.from(uniqueTypes).map((t) => ({
      label: t,
      value: t,
    }));
  }, [tableData]);

  const lockStatusOptions = [
    { label: "Locked", value: "locked" },
    { label: "Unlocked", value: "unlocked" },
  ];

  const filters = [
    {
      id: "assetClass",
      title: "Asset Class",
      options: assetClassOptions,
    },
    {
      id: "assetSubclass",
      title: "Type",
      options: typeOptions,
    },
    {
      id: "locked",
      title: "Lock Status",
      options: lockStatusOptions,
    },
  ];

  // Empty state
  if (tableData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
        <p className="text-muted-foreground mb-4 text-sm">
          No holdings found. Add holdings to your portfolio to see allocation data.
        </p>
        <Button variant="outline" onClick={onNavigateToOverview}>
          Go to Allocation Overview
        </Button>
      </div>
    );
  }

  return (
    <DataTable
      data={tableData}
      columns={columns}
      searchBy="symbol"
      filters={filters}
      showColumnToggle={true}
      storageKey="allocation-holdings-table"
      defaultColumnVisibility={{
        name: false,
        targetPercentOfClass: false,
      }}
      defaultSorting={[{ id: "currentValue", desc: true }]}
      scrollable={true}
    />
  );
}

export default HoldingsAllocationTable;
