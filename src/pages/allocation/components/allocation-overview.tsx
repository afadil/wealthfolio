import type { AssetClassTarget } from "@/lib/types";
import { formatAmount } from "@/lib/utils";
import { Button, Icons } from "@wealthfolio/ui";
import { useMemo } from "react";
import type { AssetClassComposition } from "../hooks/use-current-allocation";

interface AllocationOverviewProps {
  currentAllocation: AssetClassComposition[];
  targets: AssetClassTarget[];
  totalValue: number;
  baseCurrency: string;
  onEditTargets: () => void;
  onDeleteTarget?: (assetClass: string) => Promise<void>;
  accountId?: string;
}

export function AllocationOverview({
  currentAllocation,
  targets,
  totalValue,
  baseCurrency,
  onEditTargets,
  onDeleteTarget,
  accountId = '',
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
          percent: allocation.actualPercent, // ← CHANGED: currentPercent → actualPercent
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
            onDelete={onDeleteTarget}
            accountId={accountId}
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
  onDelete?: (assetClass: string) => Promise<void>;
  accountId?: string;
}

function ComparisonCard({ data, baseCurrency, onDelete, accountId = '' }: ComparisonCardProps) {
  const { useState } = require('react');
  const [isLocked, setIsLocked] = useState(() => {
    const lockKey = `allocation-lock-${accountId}-${data.assetClass}`;
    return localStorage.getItem(lockKey) === 'true';
  });

  const handleToggleLock = () => {
    const newLockedState = !isLocked;
    const lockKey = `allocation-lock-${accountId}-${data.assetClass}`;
    setIsLocked(newLockedState);
    if (newLockedState) {
      localStorage.setItem(lockKey, 'true');
    } else {
      localStorage.removeItem(lockKey);
    }
  };

  const handleDelete = async () => {
    if (isLocked) {
      alert(`Cannot delete locked target: ${data.assetClass}. Unlock it first to delete.`);
      return;
    }
    if (onDelete && confirm(`Delete ${data.assetClass} allocation target?`)) {
      await onDelete(data.assetClass);
    }
  };

  const statusColor = {
    "over": "text-blue-600 dark:text-blue-400",
    "under": "text-orange-600 dark:text-orange-400",
    "on-target": "text-green-600 dark:text-green-400",
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
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-lg">{data.assetClass}</h4>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${statusColor}`}>
            {statusIcon} {statusText}
          </span>
          {onDelete && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isLocked}
                className={`h-7 w-7 p-0 ${
                  isLocked
                    ? 'text-muted-foreground/50 cursor-not-allowed hover:bg-transparent'
                    : ''
                }`}
                title={isLocked ? 'Cannot delete locked target' : 'Delete target'}
              >
                ✕
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleLock}
                className={`h-7 w-7 p-0 ${
                  isLocked
                    ? 'text-white bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-800'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title={isLocked ? 'Unlock target' : 'Lock target'}
              >
                {isLocked ? '🔒' : '🔓'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Top Row: Current vs Target vs Drift */}
      <div className="flex items-center justify-between text-sm mb-4">
        <div>
          <p className="text-muted-foreground text-xs">Current</p>
          <p className="font-semibold">{data.current.percent.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Target</p>
          <p className="font-semibold">{data.target.percent.toFixed(1)}%</p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">Drift</p>
          <p className={`font-semibold ${statusColor}`}>
            {data.difference.percent > 0 ? "+" : ""}{data.difference.percent.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Current Bar */}
      <div className="mb-3">
        <div className="bg-secondary relative h-4 flex-1 overflow-hidden rounded">
          <div
            className="bg-chart-2 absolute top-0 left-0 h-full rounded transition-all"
            style={{ width: `${Math.min(data.current.percent, 100)}%` }}
          />
          <div className="text-background absolute top-0 left-0 flex h-full items-center px-2 text-xs font-medium">
            <span className="whitespace-nowrap">{data.current.percent.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Target Bar */}
      <div className="mb-4">
        <div className="bg-secondary relative h-4 flex-1 overflow-hidden rounded">
          <div
            className="bg-chart-2 absolute top-0 left-0 h-full rounded transition-all"
            style={{ width: `${Math.min(data.target.percent, 100)}%` }}
          />
          <div className="text-background absolute top-0 left-0 flex h-full items-center px-2 text-xs font-medium">
            <span className="whitespace-nowrap">{data.target.percent.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Difference Alert */}
      {data.status !== "on-target" && (
        <div className={`text-sm p-2 rounded ${
          data.status === "over" ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400" : "bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-400"
        }`}>
          {data.status === "over" ? "Over-allocated" : "Need to add"}:{" "}
          <span className="font-semibold">
            {formatAmount(Math.abs(data.difference.value), baseCurrency)}
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Current Only Card (when no targets set)
// ============================================================================

interface CurrentOnlyCardProps {
  allocation: AssetClassComposition;
  baseCurrency: string;
}

function CurrentOnlyCard({ allocation, baseCurrency }: CurrentOnlyCardProps) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold">{allocation.assetClass}</h4>
        <span className="text-lg font-semibold">{allocation.actualPercent.toFixed(1)}%</span>
      </div>

      <div className="bg-muted h-3 w-full overflow-hidden rounded-full mb-2">
        <div
          className="bg-primary h-full transition-all"
          style={{ width: `${Math.min(allocation.actualPercent, 100)}%` }}
        />
      </div>

      <div className="text-muted-foreground text-sm">
        {formatAmount(allocation.currentValue, baseCurrency)}
      </div>
    </div>
  );
}
