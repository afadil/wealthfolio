import { TickerAvatar } from "@/components/ticker-avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { Holding } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AmountDisplay, GainPercent, Separator } from "@wealthfolio/ui";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

interface HoldingsTableMobileProps {
  holdings: Holding[];
  isLoading: boolean;
}

export const HoldingsTableMobile = ({ holdings, isLoading }: HoldingsTableMobileProps) => {
  const { isBalanceHidden } = useBalancePrivacy();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const assetTypes = useMemo(() => {
    const uniqueTypes = new Set<string>();
    holdings.forEach((h) => {
      if (h.instrument?.assetSubclass) {
        uniqueTypes.add(h.instrument.assetSubclass);
      }
    });
    return Array.from(uniqueTypes).map((type) => ({
      label: type,
      value: type,
    }));
  }, [holdings]);

  const filteredHoldings = useMemo(() => {
    let result = holdings;

    if (selectedTypes.length > 0) {
      result = result.filter(
        (holding) =>
          holding.instrument?.assetSubclass &&
          selectedTypes.includes(holding.instrument.assetSubclass),
      );
    }

    if (searchQuery) {
      const lowercasedQuery = searchQuery.toLowerCase();
      result = result.filter((holding) => {
        const nameMatch = holding.instrument?.name?.toLowerCase().includes(lowercasedQuery);
        const symbolMatch = holding.instrument?.symbol?.toLowerCase().includes(lowercasedQuery);
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        return nameMatch || symbolMatch;
      });
    }

    return result;
  }, [holdings, selectedTypes, searchQuery]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }

  if (!holdings || holdings.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
        <h3 className="text-lg font-medium">No positions found</h3>
        <p className="text-muted-foreground text-sm">Add activities to see your positions here.</p>
      </div>
    );
  }

  const handleNavigate = (holding: Holding) => {
    const symbol = holding.instrument?.symbol;
    if (symbol && !symbol.startsWith("$CASH")) {
      navigate(`/holdings/${encodeURIComponent(symbol)}`, { state: { holding } });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 flex-1"
        />
        {assetTypes.length > 0 && (
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 flex-shrink-0">
                <Icons.ListFilter className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-lg">
              <SheetHeader className="text-left">
                <SheetTitle>Filter by Asset Type</SheetTitle>
              </SheetHeader>
              <div className="py-4">
                <ul className="space-y-1">
                  <li
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-md p-2 text-sm font-medium",
                      selectedTypes.length === 0 ? "bg-accent" : "hover:bg-accent/50",
                    )}
                    onClick={() => setSelectedTypes([])}
                  >
                    <span>All Types</span>
                    {selectedTypes.length === 0 && <Icons.Check className="h-4 w-4" />}
                  </li>
                  {assetTypes.map((type) => (
                    <li
                      key={type.value}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-md p-2 text-sm font-medium",
                        selectedTypes.includes(type.value) ? "bg-accent" : "hover:bg-accent/50",
                      )}
                      onClick={() => {
                        setSelectedTypes((prev) =>
                          prev.includes(type.value)
                            ? prev.filter((t) => t !== type.value)
                            : [...prev, type.value],
                        );
                      }}
                    >
                      <span>{type.label}</span>
                      {selectedTypes.includes(type.value) && <Icons.Check className="h-4 w-4" />}
                    </li>
                  ))}
                </ul>
              </div>
              <SheetFooter>
                <SheetClose asChild>
                  <Button className="w-full">Done</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        )}
      </div>
      <div className="space-y-2">
        {filteredHoldings.map((holding) => {
          const symbol = holding.instrument?.symbol ?? holding.id;
          const isCash = symbol.startsWith("$CASH");
          const avatarSymbol = isCash ? "$CASH" : symbol;
          const displaySymbol = isCash ? symbol.split("-")[0] : symbol;
          const isNavigable = !isCash && holding.instrument?.symbol;

          return (
            <Card
              key={holding.id}
              className={cn(
                "p-3",
                isNavigable && "hover:bg-muted/50 cursor-pointer transition-colors",
              )}
              onClick={() => isNavigable && handleNavigate(holding)}
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-1 items-center gap-3 overflow-hidden">
                  <TickerAvatar symbol={avatarSymbol} className="h-10 w-10" />
                  <div className="flex-1 overflow-hidden">
                    <p className="truncate font-semibold">{displaySymbol}</p>
                    <p className="text-muted-foreground truncate text-sm">
                      {holding.instrument?.name ?? "N/A"}
                    </p>
                  </div>
                </div>
                <div className="ml-2 text-right">
                  <AmountDisplay
                    value={holding.marketValue?.local ?? 0}
                    currency={holding.localCurrency}
                    isHidden={isBalanceHidden}
                    className="font-medium"
                  />
                  <div className="flex items-center justify-end gap-1">
                    <AmountDisplay
                      value={holding.totalGain?.local ?? 0}
                      currency={holding.localCurrency}
                      isHidden={isBalanceHidden}
                      colorFormat
                      className="text-xs"
                    />
                    <Separator orientation="vertical" className="mx-1 h-4" />
                    <GainPercent value={holding.totalGainPct ?? 0} className="text-xs" />
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
        {filteredHoldings.length === 0 && (
          <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
            <h3 className="text-lg font-medium">No positions found</h3>
            <p className="text-muted-foreground text-sm">
              Try adjusting your search or filter criteria.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HoldingsTableMobile;
