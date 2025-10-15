import { HistoryChart } from "@/components/history-chart";
import { Page, PageContent, PageHeader } from "@/components/page/page";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  GainAmount,
  GainPercent,
  IntervalSelector,
  PrivacyAmount,
} from "@wealthfolio/ui";
import { useMemo, useState } from "react";

import { PrivacyToggle } from "@/components/privacy-toggle";
import { useAccounts } from "@/hooks/use-accounts";
import { useValuationHistory } from "@/hooks/use-valuation-history";
import { AccountValuation, DateRange, TimePeriod, TrackedItem } from "@/lib/types";
import { calculatePerformanceMetrics } from "@/lib/utils";
import { PortfolioUpdateTrigger } from "@/pages/dashboard/portfolio-update-trigger";
import { useCalculatePerformanceHistory } from "@/pages/performance/hooks/use-performance-data";
import { subMonths } from "date-fns";
import { useParams } from "react-router-dom";
import { AccountContributionLimit } from "./account-contribution-limit";
import AccountHoldings from "./account-holdings";
import AccountMetrics from "./account-metrics";

interface HistoryChartData {
  date: string;
  totalValue: number;
  netContribution: number;
  currency: string;
}

// Helper function to get the initial date range (copied from dashboard)
const getInitialDateRange = (): DateRange => ({
  from: subMonths(new Date(), 3),
  to: new Date(),
});

// Define the initial interval code (consistent with other pages)
const INITIAL_INTERVAL_CODE: TimePeriod = "3M";

const AccountPage = () => {
  const { id = "" } = useParams<{ id: string }>();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getInitialDateRange());
  const [selectedIntervalCode, setSelectedIntervalCode] =
    useState<TimePeriod>(INITIAL_INTERVAL_CODE);

  const { accounts, isLoading: isAccountsLoading } = useAccounts();
  const account = useMemo(() => accounts?.find((acc) => acc.id === id), [accounts, id]);

  const accountTrackedItem: TrackedItem | undefined = useMemo(() => {
    if (account) {
      return { id: account.id, type: "account", name: account.name };
    }
    return undefined;
  }, [account]);

  const { data: performanceResponse, isLoading: isPerformanceHistoryLoading } =
    useCalculatePerformanceHistory({
      selectedItems: accountTrackedItem ? [accountTrackedItem] : [],
      dateRange: dateRange,
    });

  const accountPerformance = performanceResponse?.[0] || null;

  const { valuationHistory, isLoading: isValuationHistoryLoading } = useValuationHistory(
    dateRange,
    id,
  );

  // Calculate gainLossAmount and simpleReturn from valuationHistory
  const { gainLossAmount: frontendGainLossAmount, simpleReturn: frontendSimpleReturn } =
    useMemo(() => {
      return calculatePerformanceMetrics(valuationHistory, false);
    }, [valuationHistory, id]);

  const chartData: HistoryChartData[] = useMemo(() => {
    if (!valuationHistory) return [];
    return valuationHistory.map((valuation: AccountValuation) => ({
      date: valuation.valuationDate,
      totalValue: valuation.totalValue,
      netContribution: valuation.netContribution,
      currency: valuation.accountCurrency,
    }));
  }, [valuationHistory]);

  const currentValuation = valuationHistory?.[valuationHistory.length - 1];

  const isLoading = isAccountsLoading || isValuationHistoryLoading;
  const isDetailsLoading = isLoading || isPerformanceHistoryLoading;

  // Callback for IntervalSelector
  const handleIntervalSelect = (
    code: TimePeriod,
    _description: string,
    range: DateRange | undefined,
  ) => {
    setSelectedIntervalCode(code);
    setDateRange(range);
  };

  const percentageToDisplay = useMemo(() => {
    if (selectedIntervalCode === "ALL") {
      return frontendSimpleReturn;
    }
    // For other intervals, if accountPerformance is available, use cumulativeMwr
    if (accountPerformance) {
      return accountPerformance.cumulativeMwr ?? 0;
    }
    return 0; // Default if no specific logic matches or data is unavailable
  }, [accountPerformance, selectedIntervalCode, frontendSimpleReturn]);

  return (
    <Page>
      <PageHeader
        heading={account?.name ?? "Account"}
        headingPrefix={account?.group ?? account?.currency}
        displayBack={true}
      />
      <PageContent>
        <div className="grid grid-cols-1 gap-4 pt-0 md:grid-cols-3">
          <Card className="col-span-1 md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-md">
                <PortfolioUpdateTrigger lastCalculatedAt={currentValuation?.calculatedAt}>
                  <div className="flex items-start gap-2">
                    <div>
                      <p className="pt-3 text-xl font-bold">
                        <PrivacyAmount
                          value={currentValuation?.totalValue ?? 0}
                          currency={account?.currency ?? "USD"}
                        />
                      </p>
                      <div className="flex space-x-3 text-sm">
                        <GainAmount
                          className="text-sm font-light"
                          value={frontendGainLossAmount}
                          currency={account?.currency ?? "USD"}
                          displayCurrency={false}
                        />
                        <div className="border-muted-foreground my-1 border-r pr-2" />
                        <GainPercent
                          className="text-sm font-light"
                          value={percentageToDisplay}
                          animated={true}
                        />
                      </div>
                    </div>
                    <PrivacyToggle className="mt-3" />
                  </div>
                </PortfolioUpdateTrigger>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="w-full p-0">
                <div className="flex w-full flex-col">
                  <div className="h-[480px] w-full">
                    <HistoryChart data={chartData} isLoading={false} />
                    <IntervalSelector
                      className="relative right-0 bottom-10 left-0 z-10"
                      onIntervalSelect={handleIntervalSelect}
                      isLoading={isValuationHistoryLoading}
                      initialSelection={INITIAL_INTERVAL_CODE}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col space-y-4">
            <AccountMetrics
              valuation={currentValuation}
              performance={accountPerformance}
              className="grow"
              isLoading={isDetailsLoading || isPerformanceHistoryLoading}
            />
            <AccountContributionLimit accountId={id} />
          </div>
        </div>

        <AccountHoldings accountId={id} />
      </PageContent>
    </Page>
  );
};

export default AccountPage;
