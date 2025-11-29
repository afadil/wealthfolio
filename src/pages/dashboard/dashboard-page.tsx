import { HistoryChart } from "@/components/history-chart";
import { PrivacyToggle } from "@/components/privacy-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { useHoldings } from "@/hooks/use-holdings";
import { useValuationHistory } from "@/hooks/use-valuation-history";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { useSettingsContext } from "@/lib/settings-provider";
import { DateRange, TimePeriod } from "@/lib/types";
import { calculatePerformanceMetrics } from "@/lib/utils";
import { PortfolioUpdateTrigger } from "@/pages/dashboard/portfolio-update-trigger";
import { GainAmount, GainPercent, IntervalSelector, Page } from "@wealthfolio/ui";
import { subMonths } from "date-fns";
import { useMemo, useState } from "react";
import { AccountsSummary } from "./accounts-summary";
import Balance from "./balance";
import SavingGoals from "./goals";
import TopHoldings from "./top-holdings";



// Helper function to get the initial date range for 3M
const getInitialDateRange = (): DateRange => ({
  from: subMonths(new Date(), 3),
  to: new Date(),
});

const INITIAL_INTERVAL_CODE: TimePeriod = "3M";

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getInitialDateRange());
  const [selectedIntervalDescription, setSelectedIntervalDescription] =
    useState<string>("Last 3 months");
  const [isAllTime, setIsAllTime] = useState<boolean>(false);

  const { holdings, isLoading: isHoldingsLoading } = useHoldings(PORTFOLIO_ACCOUNT_ID);

  const totalValue = useMemo(() => {
    return holdings?.reduce((acc, holding) => acc + (holding.marketValue?.base ?? 0), 0) ?? 0;
  }, [holdings]);

  const { valuationHistory, isLoading: isValuationHistoryLoading } = useValuationHistory(dateRange);

  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  // Calculate gainLossAmount and simpleReturn from valuationHistory
  const { gainLossAmount, simpleReturn } = useMemo(() => {
    return calculatePerformanceMetrics(valuationHistory, isAllTime);
  }, [valuationHistory, isAllTime]);

  const currentValuation = useMemo(() => {
    return valuationHistory && valuationHistory.length > 0
      ? valuationHistory[valuationHistory.length - 1]
      : null;
  }, [valuationHistory]);

  const chartData = useMemo(() => {
    return (
      valuationHistory?.map((item) => ({
        date: item.valuationDate,
        totalValue: item.totalValue,
        netContribution: item.netContribution,
        currency: item.baseCurrency ?? baseCurrency,
      })) ?? []
    );
  }, [valuationHistory, baseCurrency]);

  // Callback for IntervalSelector
  const handleIntervalSelect = (
    code: TimePeriod,
    description: string,
    range: DateRange | undefined,
  ) => {
    setSelectedIntervalDescription(description);
    setDateRange(range);
    setIsAllTime(code === "ALL");
  };

  return (
    <Page className="flex flex-col">
      <div data-ptr-content className="flex min-h-screen flex-col">
        <div className="px-4 pt-22 pb-6 md:px-6 md:pt-10 md:pb-8 lg:px-8 lg:pt-12">
          <PortfolioUpdateTrigger lastCalculatedAt={currentValuation?.calculatedAt}>
            <div className="flex items-start gap-2">
              <div className="min-h-[4.5rem]">
                <div className="flex items-center gap-3">
                  <Balance
                    isLoading={isHoldingsLoading}
                    targetValue={totalValue}
                    currency={baseCurrency}
                    displayCurrency={true}
                  />
                  <PrivacyToggle />
                </div>
                <div className="text-md flex space-x-3">
                  {isValuationHistoryLoading && !valuationHistory ? (
                    <div className="flex items-center gap-3 pt-1">
                      <Skeleton className="h-4 w-24" />
                      <div className="border-secondary my-1 border-r pr-2" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ) : (
                    <>
                      <GainAmount
                        className="lg:text-md text-sm font-light"
                        value={gainLossAmount}
                        currency={baseCurrency}
                        displayCurrency={false}
                      ></GainAmount>
                      <div className="border-secondary my-1 border-r pr-2" />
                      <GainPercent
                        className="lg:text-md text-sm font-light"
                        value={simpleReturn}
                        animated={true}
                      ></GainPercent>
                    </>
                  )}
                  {selectedIntervalDescription && (
                    <span className="lg:text-md text-muted-foreground ml-1 text-sm font-light">
                      {selectedIntervalDescription}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </PortfolioUpdateTrigger>
        </div>

        <div className="h-[300px]">
          <HistoryChart data={chartData} isLoading={isValuationHistoryLoading} />
          {valuationHistory && chartData.length > 0 && (
            <div className="flex w-full justify-center">
              <IntervalSelector
                className="pointer-events-auto relative z-20 w-full max-w-screen-sm sm:max-w-screen-md md:max-w-2xl lg:max-w-3xl"
                onIntervalSelect={handleIntervalSelect}
                isLoading={isValuationHistoryLoading}
                initialSelection={INITIAL_INTERVAL_CODE}
              />
            </div>
          )}
        </div>

        <div className="from-success/30 via-success/15 to-success/10 grow bg-linear-to-t px-4 pt-12 md:px-6 md:pt-12 lg:px-10 lg:pt-20">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-20">
            <div className="lg:col-span-2">
              <AccountsSummary />
            </div>
            <div className="space-y-6 lg:col-span-1">
              <TopHoldings
                holdings={holdings}
                isLoading={isHoldingsLoading}
                baseCurrency={baseCurrency}
              />
              <SavingGoals />
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
