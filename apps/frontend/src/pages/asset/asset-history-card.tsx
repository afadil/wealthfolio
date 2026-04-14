import HistoryChart from "@/components/history-chart-symbol";
import { useBalancePrivacy } from "@/hooks/use-balance-privacy";
import { useSyncMarketDataMutation } from "@/hooks/use-sync-market-data";
import { buildIntervalButtonLabels, buildIntervalLabels } from "@/lib/interval-labels";
import { DateRange, Quote, TimePeriod } from "@/lib/types";
import {
  AmountDisplay,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Icons,
  IntervalSelector,
  formatPercent,
  getInitialIntervalData,
} from "@wealthfolio/ui";
import { format, subMonths } from "date-fns";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshQuotesConfirmDialog } from "./refresh-quotes-confirm-dialog";

interface AssetHistoryProps {
  marketPrice: number;
  totalGainAmount: number;
  totalGainPercent: number;
  currency: string;
  quoteHistory: Quote[];
  assetId: string;
  className?: string;
  /** When set, clicking the chart opens the quote table for that quote day. */
  onChartDayClick?: (quoteTimestampIso: string) => void;
  chartClickHint?: string;
}

const AssetHistoryCard: React.FC<AssetHistoryProps> = ({
  marketPrice,
  totalGainAmount,
  totalGainPercent,
  currency,
  quoteHistory,
  assetId,
  className,
  onChartDayClick,
  chartClickHint,
}) => {
  const { t } = useTranslation();
  const intervalLabels = useMemo(() => buildIntervalLabels(t), [t]);
  const intervalButtonLabels = useMemo(() => buildIntervalButtonLabels(t), [t]);
  const syncMarketDataMutation = useSyncMarketDataMutation(true);
  const { isBalanceHidden } = useBalancePrivacy();
  const [refreshConfirmOpen, setRefreshConfirmOpen] = useState(false);

  const handleRefreshQuotes = useCallback(() => {
    syncMarketDataMutation.mutate([assetId]);
  }, [syncMarketDataMutation, assetId]);

  const [selectedIntervalCode, setSelectedIntervalCode] = useState<TimePeriod>("3M");
  const selectedIntervalDesc = useMemo(
    () => getInitialIntervalData(selectedIntervalCode, intervalLabels).description,
    [selectedIntervalCode, intervalLabels],
  );
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subMonths(new Date(), 3),
    to: new Date(),
  });

  const filteredData = useMemo(() => {
    if (!quoteHistory) return [];

    // Sort quotes chronologically (oldest first) for proper chart display
    const sortedQuotes = [...quoteHistory].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    if (!dateRange?.from || !dateRange?.to || selectedIntervalCode === "ALL") {
      return sortedQuotes.map((quote) => ({
        timestamp: quote.timestamp,
        totalValue: quote.close,
        currency: quote.currency || currency,
      }));
    }

    return sortedQuotes
      .filter((quote) => {
        const quoteDate = new Date(quote.timestamp);
        return (
          dateRange.from && dateRange.to && quoteDate >= dateRange.from && quoteDate <= dateRange.to
        );
      })
      .map((quote) => ({
        timestamp: quote.timestamp,
        totalValue: quote.close,
        currency: quote.currency || currency,
      }));
  }, [dateRange, quoteHistory, currency, selectedIntervalCode]);

  const { ganAmount, percentage, calculatedAt } = useMemo(() => {
    const lastFilteredDate = filteredData.at(-1)?.timestamp;
    const startValue = filteredData[0]?.totalValue;
    const endValue = filteredData.at(-1)?.totalValue;
    const isValidStartValue = typeof startValue === "number" && startValue !== 0;

    if (selectedIntervalCode === "ALL") {
      if (typeof startValue === "number" && typeof endValue === "number") {
        return {
          ganAmount: endValue - startValue,
          percentage: isValidStartValue ? (endValue - startValue) / startValue : 0,
          calculatedAt: lastFilteredDate,
        };
      }

      const lastQuoteDate =
        quoteHistory.length > 0 ? quoteHistory[quoteHistory.length - 1].timestamp : undefined;
      return {
        ganAmount: totalGainAmount,
        percentage: totalGainPercent,
        calculatedAt: lastQuoteDate,
      };
    }

    return {
      ganAmount:
        typeof startValue === "number" && typeof endValue === "number" ? endValue - startValue : 0,
      percentage:
        isValidStartValue && typeof endValue === "number"
          ? (endValue - startValue) / startValue
          : 0,
      calculatedAt: lastFilteredDate,
    };
  }, [filteredData, selectedIntervalCode, quoteHistory, totalGainAmount, totalGainPercent]);

  const handleIntervalSelect = (code: TimePeriod, _description: string, range: DateRange | undefined) => {
    setSelectedIntervalCode(code);
    setDateRange(range);
  };

  return (
    <>
      <RefreshQuotesConfirmDialog
        open={refreshConfirmOpen}
        onOpenChange={setRefreshConfirmOpen}
        onConfirm={handleRefreshQuotes}
      />
      <Card className={`flex flex-col ${className}`}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-md">
            <HoverCard>
              <HoverCardTrigger asChild className="cursor-pointer">
                <div>
                  <p className="pt-3 text-xl font-bold">
                    <AmountDisplay
                      value={marketPrice}
                      currency={currency}
                      isHidden={isBalanceHidden}
                    />
                  </p>
                  <p className={`text-sm ${ganAmount > 0 ? "text-success" : "text-destructive"}`}>
                    <AmountDisplay
                      value={ganAmount}
                      currency={currency}
                      isHidden={isBalanceHidden}
                    />{" "}
                    ({formatPercent(percentage)}) {selectedIntervalDesc}
                  </p>
                </div>
              </HoverCardTrigger>
              <HoverCardContent align="start" className="w-80 shadow-none">
                <div className="flex flex-col space-y-4">
                  <div className="space-y-2">
                    <h4 className="flex text-sm font-light">
                      <Icons.Calendar className="mr-2 h-4 w-4" />
                      {t("shared.as_of")}{" "}
                      <Badge className="ml-1 font-medium" variant="secondary">
                        {calculatedAt ? `${format(new Date(calculatedAt), "PPpp")}` : "-"}
                      </Badge>
                    </h4>
                  </div>
                  <Button
                    onClick={() => setRefreshConfirmOpen(true)}
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    disabled={syncMarketDataMutation.isPending}
                  >
                    {syncMarketDataMutation.isPending ? (
                      <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Icons.Refresh className="mr-2 h-4 w-4" />
                    )}
                    {syncMarketDataMutation.isPending
                      ? t("asset.history.refreshing_quotes")
                      : t("asset.history.refresh_quotes")}
                  </Button>
                </div>
              </HoverCardContent>
            </HoverCard>
          </CardTitle>
        </CardHeader>
        <CardContent className="relative flex-1 p-0">
          <div className="pb-11">
            <HistoryChart data={filteredData} onPointClick={onChartDayClick} />
          </div>
          <div className="absolute bottom-1 left-0 right-0 z-20 flex flex-col items-center gap-0.5 px-2">
            {chartClickHint ? (
              <p className="text-muted-foreground max-w-full px-1 text-center text-[10px] leading-tight">
                {chartClickHint}
              </p>
            ) : null}
            <IntervalSelector
              onIntervalSelect={handleIntervalSelect}
              className="relative w-full min-w-0"
              isLoading={syncMarketDataMutation.isPending}
              defaultValue="3M"
              intervalLabels={intervalLabels}
              intervalButtonLabels={intervalButtonLabels}
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export default AssetHistoryCard;
