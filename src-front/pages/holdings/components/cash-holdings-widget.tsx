import { Card } from "@wealthfolio/ui/components/ui/card";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { useSettingsContext } from "@/lib/settings-provider";
import { Holding } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AmountDisplay } from "@wealthfolio/ui";
import { useMemo } from "react";

interface CashHoldingsWidgetProps {
  cashHoldings: Holding[];
  isLoading: boolean;
  className?: string;
}

export const CashHoldingsWidget = ({
  cashHoldings,
  isLoading,
  className,
}: CashHoldingsWidgetProps) => {
  const { isBalanceHidden } = useBalancePrivacy();
  const { settings } = useSettingsContext();

  const totalCashInBase = useMemo(() => {
    return cashHoldings.reduce((sum, holding) => {
      return sum + Number(holding.marketValue?.base ?? 0);
    }, 0);
  }, [cashHoldings]);

  if (isLoading) {
    return (
      <Card className={cn("p-3 sm:p-3.5", className)}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div>
              <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase sm:text-xs">
                Cash Balance
              </p>
              <Skeleton className="mt-0.5 h-5 w-24 sm:h-5 sm:w-24" />
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2.5">
            <Skeleton className="h-6 w-[120px] sm:h-9 sm:w-[70px]" />
            <div className="bg-border hidden h-9 w-px sm:block" />
            <Skeleton className="h-6 w-[120px] sm:h-9 sm:w-[70px]" />
          </div>
        </div>
      </Card>
    );
  }

  if (!cashHoldings.length) {
    return null;
  }

  return (
    <Card className={cn("p-3 sm:p-3.5", className)}>
      <div className="flex items-center justify-between gap-3">
        {/* Left: Total */}
        <div className="flex items-center gap-2.5">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase sm:text-xs">
              Cash Balance
            </p>
            <p className="text-foreground mt-0.5 text-base font-semibold tracking-tight sm:text-base">
              <AmountDisplay
                value={totalCashInBase}
                currency={settings?.baseCurrency ?? "USD"}
                isHidden={isBalanceHidden}
              />
            </p>
          </div>
        </div>

        {/* Right: Currency breakdown */}
        {cashHoldings.length > 1 && (
          <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2.5">
            {cashHoldings.map((holding, index) => (
              <div key={holding.id} className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase sm:text-[10px]">
                    {holding.localCurrency}
                  </span>
                  <span className="text-foreground text-sm sm:text-sm">
                    <AmountDisplay
                      value={holding.marketValue?.local ?? 0}
                      currency={holding.localCurrency}
                      isHidden={isBalanceHidden}
                    />
                  </span>
                </div>
                {index < cashHoldings.length - 1 && (
                  <div className="bg-border hidden h-9 w-px sm:block" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

export default CashHoldingsWidget;
