import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import type { AlternativeAssetHolding } from "@/lib/types";
import { ALTERNATIVE_ASSET_KIND_DISPLAY_NAMES } from "@/lib/types";
import { AmountDisplay, GainPercent, Separator } from "@wealthfolio/ui";
import { Card } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";

interface AlternativeHoldingsListMobileProps {
  holdings: AlternativeAssetHolding[];
  isLoading: boolean;
  onRowClick?: (holding: AlternativeAssetHolding) => void;
}

export function AlternativeHoldingsListMobile({
  holdings,
  isLoading,
  onRowClick,
}: AlternativeHoldingsListMobileProps) {
  const { isBalanceHidden } = useBalancePrivacy();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }

  if (!holdings || holdings.length === 0) {
    return null;
  }

  const sorted = [...holdings].sort(
    (a, b) => parseFloat(b.marketValue) - parseFloat(a.marketValue),
  );

  return (
    <div className="space-y-2">
      {sorted.map((holding) => {
        const kindDisplay =
          ALTERNATIVE_ASSET_KIND_DISPLAY_NAMES[
            holding.kind.toUpperCase() as keyof typeof ALTERNATIVE_ASSET_KIND_DISPLAY_NAMES
          ] ?? holding.kind;

        const gain = holding.unrealizedGain ? parseFloat(holding.unrealizedGain) : null;
        const gainPct = holding.unrealizedGainPct ? parseFloat(holding.unrealizedGainPct) : null;

        return (
          <Card
            key={holding.id}
            className="hover:bg-muted/50 cursor-pointer p-3 transition-colors"
            onClick={() => onRowClick?.(holding)}
          >
            <div className="flex items-center justify-between">
              <div className="flex flex-1 items-center gap-3 overflow-hidden">
                <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                  <AssetKindIcon kind={holding.kind} size={20} />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="truncate font-semibold">{holding.name}</p>
                  <p className="text-muted-foreground truncate text-sm">{kindDisplay}</p>
                </div>
              </div>
              <div className="ml-2 text-right">
                <AmountDisplay
                  value={parseFloat(holding.marketValue)}
                  currency={holding.currency}
                  isHidden={isBalanceHidden}
                  className="font-medium"
                />
                {gain !== null && gainPct !== null && (
                  <div className="flex items-center justify-end gap-1">
                    <AmountDisplay
                      value={gain}
                      currency={holding.currency}
                      isHidden={isBalanceHidden}
                      colorFormat
                      className="text-xs"
                    />
                    <Separator orientation="vertical" className="mx-1 h-4" />
                    <GainPercent value={gainPct} className="text-xs" />
                  </div>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function AssetKindIcon({ kind, size = 20 }: { kind: string; size?: number }) {
  switch (kind.toLowerCase()) {
    case "property":
      return <Icons.RealEstateDuotone size={size} />;
    case "vehicle":
      return <Icons.VehicleDuotone size={size} />;
    case "collectible":
      return <Icons.CollectibleDuotone size={size} />;
    case "precious":
      return <Icons.PreciousDuotone size={size} />;
    case "liability":
      return <Icons.LiabilityDuotone size={size} />;
    default:
      return <Icons.OtherAssetDuotone size={size} />;
  }
}
