import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { formatAmount } from "@wealthfolio/ui";
import { cn } from "@wealthfolio/ui/lib/utils";

import { useAllocationDeviations } from "@/hooks/use-portfolio-targets";
import { useSettingsContext } from "@/lib/settings-provider";

interface DeviationTableProps {
  targetId: string;
}

export function DeviationTable({ targetId }: DeviationTableProps) {
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";
  const { deviationReport, isLoading } = useAllocationDeviations(targetId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!deviationReport || deviationReport.deviations.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-center text-sm">
        Set target percentages above to see deviations.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[auto_1fr_70px_70px_70px_90px] items-center gap-x-3 text-xs font-medium text-muted-foreground">
        <div>Color</div>
        <div>Category</div>
        <div className="text-right">Target</div>
        <div className="text-right">Current</div>
        <div className="text-right">Deviation</div>
        <div className="text-right">Delta</div>
      </div>

      {deviationReport.deviations.map((d) => {
        const isOver = d.deviationPercent > 0;
        const isUnder = d.deviationPercent < 0;

        return (
          <div
            key={d.categoryId}
            className="grid grid-cols-[auto_1fr_70px_70px_70px_90px] items-center gap-x-3 py-1.5 text-sm"
          >
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: d.color }}
            />
            <div className="truncate">{d.categoryName}</div>
            <div className="text-right">{d.targetPercent.toFixed(2)}%</div>
            <div className="text-right">{d.currentPercent.toFixed(2)}%</div>
            <div
              className={cn(
                "text-right font-medium",
                isOver && "text-success",
                isUnder && "text-destructive",
              )}
            >
              {isOver ? "+" : ""}
              {d.deviationPercent.toFixed(2)}%
            </div>
            <div
              className={cn(
                "text-right text-xs",
                isOver && "text-success",
                isUnder && "text-destructive",
              )}
            >
              {d.valueDelta >= 0 ? "+" : ""}
              {formatAmount(d.valueDelta, baseCurrency)}
            </div>
          </div>
        );
      })}

      <div className="border-t pt-2 text-right text-sm font-medium">
        Total: {formatAmount(deviationReport.totalValue, baseCurrency)}
      </div>
    </div>
  );
}
