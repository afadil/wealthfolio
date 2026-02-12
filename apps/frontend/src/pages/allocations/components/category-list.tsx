import { cn } from "@wealthfolio/ui/lib/utils";
import type { AllocationDeviation } from "@/lib/types";

interface CategoryListProps {
  deviations: AllocationDeviation[];
  totalTargetPercent: number;
  onCategoryClick: (categoryId: string) => void;
}

export function CategoryList({
  deviations,
  totalTargetPercent,
  onCategoryClick,
}: CategoryListProps) {
  if (deviations.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Click a category to set a target percentage.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="text-muted-foreground grid grid-cols-[auto_1fr_60px_60px_70px] items-center gap-x-3 px-2 text-xs font-medium">
        <div className="w-3" />
        <div>Category</div>
        <div className="text-right">Target</div>
        <div className="text-right">Current</div>
        <div className="text-right">Deviation</div>
      </div>

      {/* Rows */}
      {deviations.map((d) => {
        const isOver = d.deviationPercent > 0;
        const isUnder = d.deviationPercent < 0;
        const targetPct = d.targetPercent;
        const currentPct = d.currentPercent;
        const maxPct = Math.max(targetPct, currentPct, 1);

        return (
          <button
            key={d.categoryId}
            type="button"
            onClick={() => onCategoryClick(d.categoryId)}
            className="hover:bg-muted/50 w-full rounded-md px-2 py-1.5 text-left transition-colors"
          >
            <div className="grid grid-cols-[auto_1fr_60px_60px_70px] items-center gap-x-3">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <div className="truncate text-sm">{d.categoryName}</div>
              <div className="text-right text-sm">{targetPct.toFixed(1)}%</div>
              <div className="text-right text-sm">{currentPct.toFixed(1)}%</div>
              <div
                className={cn(
                  "text-right text-sm font-medium",
                  isOver && "text-green-600 dark:text-green-400",
                  isUnder && "text-red-600 dark:text-red-400",
                )}
              >
                {isOver ? "+" : ""}
                {d.deviationPercent.toFixed(1)}%
              </div>
            </div>

            {/* Progress bar: target vs current */}
            <div className="mt-1 flex gap-1">
              <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full opacity-50"
                  style={{
                    width: `${(targetPct / maxPct) * 100}%`,
                    backgroundColor: d.color,
                  }}
                />
              </div>
              <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(currentPct / maxPct) * 100}%`,
                    backgroundColor: d.color,
                  }}
                />
              </div>
            </div>
          </button>
        );
      })}

      {/* Total */}
      <div className="border-t px-2 pt-2">
        <div className="grid grid-cols-[auto_1fr_60px_60px_70px] items-center gap-x-3">
          <div className="w-3" />
          <div className="text-sm font-medium">Total</div>
          <div
            className={cn(
              "text-right text-sm font-medium",
              totalTargetPercent > 100 && "text-red-600 dark:text-red-400",
            )}
          >
            {totalTargetPercent.toFixed(1)}%
          </div>
          <div />
          <div />
        </div>
      </div>
    </div>
  );
}
