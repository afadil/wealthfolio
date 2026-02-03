import { TickerAvatar } from "@/components/ticker-avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { HoldingType, isAlternativeAssetId } from "@/lib/constants";
import { Holding } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AmountDisplay, Button, GainAmount, GainPercent, Icons } from "@wealthfolio/ui";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";

const MAX_DISPLAYED_HOLDINGS = 5;
const MAX_STACKED_AVATARS = 5;

interface TopHoldingsProps {
  holdings: Holding[];
  isLoading: boolean;
  baseCurrency: string;
}

interface HoldingRowProps {
  holding: Holding;
  baseCurrency: string;
  isHidden?: boolean;
  onClick?: () => void;
}

function HoldingRow({ holding, baseCurrency, isHidden, onClick }: HoldingRowProps) {
  const symbol = holding.instrument?.symbol ?? holding.id;
  const displayName = symbol.split(".")[0];
  const marketValue = holding.marketValue?.base ?? 0;
  const gainAmount = holding.unrealizedGain?.base ?? 0;
  const gainPercent = holding.unrealizedGainPct ?? 0;
  const shares = holding.quantity ?? 0;

  return (
    <div
      className="group border-border hover:bg-muted/30 flex cursor-pointer items-center justify-between border-b py-3 transition-colors last:border-0"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      <div className="flex items-center gap-3">
        <TickerAvatar symbol={symbol} className="size-9" />
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{displayName}</span>
          <span className="text-muted-foreground text-xs">
            {shares.toLocaleString(undefined, { maximumFractionDigits: 3 })} shares
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <AmountDisplay
          value={marketValue}
          currency={baseCurrency}
          isHidden={isHidden}
          className="text-sm font-semibold"
        />
        <div className="flex items-center gap-2">
          <GainAmount
            value={gainAmount}
            currency={baseCurrency}
            displayCurrency={false}
            className="text-xs"
          />
          <GainPercent
            value={gainPercent}
            variant="badge"
            className="min-w-[60px] justify-center text-xs"
          />
        </div>
      </div>
    </div>
  );
}

interface StackedAvatarsProps {
  holdings: Holding[];
  totalRemaining: number;
  onClick?: () => void;
}

function StackedAvatars({ holdings, totalRemaining, onClick }: StackedAvatarsProps) {
  const displayedHoldings = holdings.slice(0, MAX_STACKED_AVATARS);
  const extraCount = totalRemaining - displayedHoldings.length;

  return (
    <div
      className="hover:bg-muted/50 border-border flex cursor-pointer items-center gap-2 border-t py-3 transition-colors"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
    >
      <div className="flex items-center">
        {displayedHoldings.map((holding, index) => {
          const symbol = holding.instrument?.symbol ?? holding.id;
          return (
            <div
              key={holding.id}
              className={cn("relative", index > 0 && "-ml-2")}
              style={{ zIndex: displayedHoldings.length - index }}
            >
              <TickerAvatar symbol={symbol} className="ring-background size-8 ring-2" />
            </div>
          );
        })}
      </div>
      <span className="text-muted-foreground text-xs">
        {extraCount > 0 ? `+${totalRemaining} more holdings` : `+${totalRemaining} more`}
      </span>
      <Icons.ChevronRight className="text-muted-foreground ml-auto h-3 w-3" />
    </div>
  );
}

function TopHoldingsSkeleton() {
  return (
    <Card className="w-full border-0 bg-transparent shadow-none">
      <CardHeader className="py-2">
        <CardTitle className="text-md">Top Holdings</CardTitle>
      </CardHeader>
      <CardContent>
        <Card className="w-full shadow-xs">
          <CardContent className="px-4 pt-4 pb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border-border border-b py-3 last:border-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-12" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-5 w-[60px] rounded-md" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}

function TopHoldingsEmptyState() {
  return (
    <Card className="w-full border-0 bg-transparent p-0 shadow-none">
      <CardHeader className="px-0 py-2">
        <CardTitle className="text-md">Top Holdings</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Card className="border-border/50 bg-success/10 w-full shadow-xs">
          <CardContent className="px-4 py-6">
            <div className="text-center">
              <p className="text-sm">No holdings yet.</p>
              <Link
                to="/activities/manage"
                className="text-muted-foreground hover:text-foreground mt-2 inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
              >
                Add your first transaction
                <Icons.ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}

export function TopHoldings({ holdings, isLoading, baseCurrency }: TopHoldingsProps) {
  const navigate = useNavigate();
  const { isBalanceHidden } = useBalancePrivacy();

  // Filter out cash holdings and alternative assets, then sort by market value
  // Dashboard shows only investment holdings (securities, crypto, etc.)
  const sortedHoldings = useMemo(() => {
    return holdings
      .filter((h) => {
        // Exclude cash holdings
        if (h.holdingType === HoldingType.CASH) return false;
        // Exclude alternative assets (properties, vehicles, liabilities, etc.)
        const symbol = h.instrument?.symbol ?? h.id;
        if (isAlternativeAssetId(symbol)) return false;
        return true;
      })
      .sort((a, b) => (b.marketValue?.base ?? 0) - (a.marketValue?.base ?? 0));
  }, [holdings]);

  const topHoldings = sortedHoldings.slice(0, MAX_DISPLAYED_HOLDINGS);
  const remainingHoldings = sortedHoldings.slice(MAX_DISPLAYED_HOLDINGS);
  const hasRemainingHoldings = remainingHoldings.length > 0;

  if (isLoading) {
    return <TopHoldingsSkeleton />;
  }

  if (sortedHoldings.length === 0) {
    return <TopHoldingsEmptyState />;
  }

  return (
    <Card className="w-full border-0 bg-transparent p-0 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between px-0 py-2">
        <CardTitle className="text-md">Holdings</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:bg-success/10 text-xs"
          onClick={() => navigate("/holdings")}
        >
          View All
          <Icons.ChevronRight className="ml-1 h-3 w-3" />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Card className="w-full shadow-xs">
          <CardContent className="px-4 pt-4 pb-2">
            {topHoldings.map((holding) => {
              const assetId = holding.instrument?.id ?? holding.id;
              return (
                <HoldingRow
                  key={holding.id}
                  holding={holding}
                  baseCurrency={baseCurrency}
                  isHidden={isBalanceHidden}
                  onClick={() => navigate(`/holdings/${encodeURIComponent(assetId)}`)}
                />
              );
            })}
            {hasRemainingHoldings && (
              <StackedAvatars
                holdings={remainingHoldings}
                totalRemaining={remainingHoldings.length}
                onClick={() => navigate("/holdings")}
              />
            )}
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}

export default TopHoldings;
