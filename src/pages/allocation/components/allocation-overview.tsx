import type { AssetClassTarget } from "@/lib/types";
import { formatAmount } from "@/lib/utils";
import { Button, Icons } from "@wealthfolio/ui";
import { useMemo } from "react";
import type { AssetClassAllocation } from "../hooks/use-current-allocation";

interface AllocationOverviewProps {
  currentAllocation: AssetClassAllocation[];
  targets: AssetClassTarget[];
  totalValue: number;
  baseCurrency: string;
  onEditTargets: () => void;
}

export function AllocationOverview({
  currentAllocation,
  targets,
  totalValue,
  baseCurrency,
  onEditTargets,
}: AllocationOverviewProps) {
  // Merge current and target data
  const comparisonData = useMemo(() => {
    const data = new Map<string, {
      assetClass: string;
      current: { value: number; percent: number };
      target: { value: number; percent: number };
      difference: { value: number; percent: number };
      status: "over" | "under" | "on-target";
    }>();

    // Add current allocations
    currentAllocation.forEach((allocation) => {
      data.set(allocation.assetClass, {
        assetClass: allocation.assetClass,
        current: {
          value: allocation.currentValue,
          percent: allocation.currentPercent,
        },
        target: { value: 0, percent: 0 },
        difference: { value: 0, percent: 0 },
        status: "on-target",
      });
    });

    // Add targets and calculate differences
    targets.forEach((target) => {
      const existing = data.get(target.assetClass);
      const targetValue = (totalValue * target.targetPercent) / 100;

      if (existing) {
        existing.target = {
          value: targetValue,
          percent: target.targetPercent,
        };
        existing.difference = {
          value: existing.current.value - targetValue,
          percent: existing.current.percent - target.targetPercent,
        };
        existing.status =
          Math.abs(existing.difference.percent) < 0.5 ? "on-target" :
          existing.difference.value > 0 ? "over" : "under";
      } else {
        // Target exists but no current holdings
        data.set(target.assetClass, {
          assetClass: target.assetClass,
          current: { value: 0, percent: 0 },
          target: { value: targetValue, percent: target.targetPercent },
          difference: { value: -targetValue, percent: -target.targetPercent },
          status: "under",
        });
      }
    });

    return Array.from(data.values()).sort((a, b) =>
      b.current.value - a.current.value
    );
  }, [currentAllocation, targets, totalValue]);

  // Calculate overall drift
  const totalDrift = useMemo(() => {
    return comparisonData.reduce((sum, item) => {
      return sum + Math.abs(item.difference.percent);
    }, 0) / 2; // Divide by 2 because over and under cancel out
  }, [comparisonData]);

  const hasTargets = targets.length > 0;

  if (!hasTargets) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border bg-card p-6">
          <div className="text-center">
            <Icons.Target className="text-muted-foreground mx-auto h-12 w-12 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Target Allocation Set</h3>
            <p className="text-muted-foreground mb-4">
              Set your target allocation to see how your portfolio compares and get rebalancing guidance.
            </p>
            <Button onClick={onEditTargets}>
              <Icons.Plus className="mr-2 h-4 w-4" />
              Set Target Allocation
            </Button>
          </div>
        </div>

        {/* Show current allocation anyway */}
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Current Allocation</h3>
          {currentAllocation.map((allocation) => (
            <CurrentOnlyCard
              key={allocation.assetClass}
              allocation={allocation}
              baseCurrency={baseCurrency}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Portfolio Value</h3>
            <p className="text-2xl font-bold">{formatAmount(totalValue, baseCurrency)}</p>
          </div>
          <div className="text-right">
            <h3 className="text-sm font-medium text-muted-foreground">Drift from Target</h3>
            <p className={`text-2xl font-bold ${
              totalDrift < 1 ? "text-green-600" :
              totalDrift < 5 ? "text-yellow-600" :
              "text-red-600"
            }`}>
              {totalDrift.toFixed(1)}%
              {totalDrift < 1 && " ✓"}
              {totalDrift >= 5 && " ⚠️"}
            </p>
          </div>
        </div>

        <Button onClick={onEditTargets} variant="outline" className="w-full">
          <Icons.Edit className="mr-2 h-4 w-4" />
          Edit Target Allocation
        </Button>
      </div>

      {/* Comparison Cards */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Asset Classes</h3>
        {comparisonData.map((item) => (
          <ComparisonCard
            key={item.assetClass}
            data={item}
            baseCurrency={baseCurrency}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Comparison Card
// ============================================================================

interface ComparisonCardProps {
  data: {
    assetClass: string;
    current: { value: number; percent: number };
    target: { value: number; percent: number };
    difference: { value: number; percent: number };
    status: "over" | "under" | "on-target";
  };
  baseCurrency: string;
}

function ComparisonCard({ data, baseCurrency }: ComparisonCardProps) {
  const statusColor = {
    "over": "text-blue-600",
    "under": "text-orange-600",
    "on-target": "text-green-600",
  }[data.status];

  const statusIcon = {
    "over": "↑",
    "under": "↓",
    "on-target": "✓",
  }[data.status];

  const statusText = {
    "over": "Overweight",
    "under": "Underweight",
    "on-target": "On Target",
  }[data.status];

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-lg">{data.assetClass}</h4>
        <span className={`text-sm font-medium ${statusColor}`}>
          {statusIcon} {statusText}
        </span>
      </div>

      {/* Current */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-muted-foreground">Current</span>
          <span className="font-medium">
            {formatAmount(data.current.value, baseCurrency)} ({data.current.percent.toFixed(1)}%)
          </span>
        </div>
        <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
          <div
            className="bg-blue-500 h-full transition-all"
            style={{ width: `${Math.min(data.current.percent, 100)}%` }}
          />
        </div>
      </div>

      {/* Target */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-muted-foreground">Target</span>
          <span className="font-medium">
            {formatAmount(data.target.value, baseCurrency)} ({data.target.percent.toFixed(1)}%)
          </span>
        </div>
        <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full transition-all"
            style={{ width: `${Math.min(data.target.percent, 100)}%` }}
          />
        </div>
      </div>

      {/* Difference */}
      {data.status !== "on-target" && (
        <div className={`text-sm p-2 rounded ${
          data.status === "over" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"
        }`}>
          {data.status === "over" ? "Over-allocated" : "Need to add"}:{" "}
          <span className="font-semibold">
            {formatAmount(Math.abs(data.difference.value), baseCurrency)}
          </span>
          {" "}({Math.abs(data.difference.percent).toFixed(1)}%)
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Current Only Card (when no targets set)
// ============================================================================

interface CurrentOnlyCardProps {
  allocation: AssetClassAllocation;
  baseCurrency: string;
}

function CurrentOnlyCard({ allocation, baseCurrency }: CurrentOnlyCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold">{allocation.assetClass}</h4>
        <span className="text-lg font-semibold">{allocation.currentPercent.toFixed(1)}%</span>
      </div>

      <div className="bg-muted h-3 w-full overflow-hidden rounded-full mb-2">
        <div
          className="bg-primary h-full transition-all"
          style={{ width: `${Math.min(allocation.currentPercent, 100)}%` }}
        />
      </div>

      <div className="text-muted-foreground text-sm">
        {formatAmount(allocation.currentValue, baseCurrency)}
      </div>
    </div>
  );
}
