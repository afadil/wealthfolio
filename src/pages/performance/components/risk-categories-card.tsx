import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyPlaceholder } from "@/components/ui/empty-placeholder";
import { Icons } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Holding } from "@/lib/types";
import { Badge, formatPercent, PrivacyAmount } from "@wealthfolio/ui";
import { useMemo } from "react";

interface RiskData {
  name: string;
  value: number;
  count: number;
}

function getRiskData(holdings: Holding[]): { data: RiskData[]; currency: string } {
  if (!holdings || holdings.length === 0) return { data: [], currency: "USD" };

  const baseCurrency = holdings[0]?.baseCurrency || "USD";

  const riskMap = holdings.reduce(
    (acc, holding) => {
      const risk = holding.instrument?.risk || "Unknown";
      const marketValue = Number(holding.marketValue?.base) || 0;

      if (!acc[risk]) {
        acc[risk] = { value: 0, count: 0 };
      }

      acc[risk].value += marketValue;
      acc[risk].count += 1;

      return acc;
    },
    {} as Record<string, { value: number; count: number }>,
  );

  const data = Object.entries(riskMap)
    .map(([name, data]) => ({ name, value: data.value, count: data.count }))
    .sort((a, b) => b.value - a.value);

  return { data, currency: baseCurrency };
}

interface RiskCategoriesCardProps {
  holdings: Holding[];
  isLoading?: boolean;
}

const riskColors: Record<string, string> = {
  Low: "bg-success text-success-foreground",
  Medium: "bg-warning text-warning-foreground",
  High: "bg-destructive text-destructive-foreground",
  Unknown: "bg-muted text-muted-foreground",
};

export function RiskCategoriesCard({ holdings, isLoading }: RiskCategoriesCardProps) {
  const { data: riskData, currency } = useMemo(() => getRiskData(holdings), [holdings]);
  const total = riskData.reduce((sum, r) => sum + r.value, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
            Risk Categories
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="relative w-full">
        <TooltipProvider>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : riskData.length > 0 ? (
            <div className="space-y-3">
              {riskData.map((risk) => {
                const percentage = total > 0 ? (risk.value / total) * 100 : 0;
                return (
                  <div key={risk.name} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={riskColors[risk.name] || riskColors.Unknown}
                        >
                          {risk.name}
                        </Badge>
                        <span className="text-muted-foreground text-xs">
                          ({risk.count} asset{risk.count !== 1 ? "s" : ""})
                        </span>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-2">
                            <PrivacyAmount
                              value={risk.value}
                              currency={currency}
                              className="text-sm font-medium"
                            />
                            <span className="text-muted-foreground text-xs">
                              ({formatPercent(percentage / 100)})
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-1">
                            <div className="text-xs">
                              <span className="font-medium">{risk.name} Risk:</span>{" "}
                              <PrivacyAmount value={risk.value} currency={currency} />
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatPercent(percentage / 100)} of total portfolio
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="bg-secondary h-2 w-full overflow-hidden rounded-full">
                      <div
                        className={`h-full rounded-full transition-all ${
                          risk.name === "Low"
                            ? "bg-success"
                            : risk.name === "Medium"
                              ? "bg-warning"
                              : risk.name === "High"
                                ? "bg-destructive"
                                : "bg-muted-foreground"
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyPlaceholder
              icon={<Icons.TrendingUp className="text-muted-foreground h-8 w-8" />}
              title="No risk data"
              description="Risk information will appear here when assets have risk classifications."
              className="py-8"
            />
          )}
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
