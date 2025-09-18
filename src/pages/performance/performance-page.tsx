import { BenchmarkSymbolSelector } from "@/components/benchmark-symbol-selector";
import { ApplicationHeader } from "@/components/header";
import {
  ANNUALIZED_RETURN_INFO as annualizedReturnInfo,
  MAX_DRAWDOWN_INFO as maxDrawdownInfo,
  MetricLabelWithInfo,
  TIME_WEIGHTED_RETURN_INFO as totalReturnInfo,
  VOLATILITY_INFO as volatilityInfo,
} from "@/components/metric-display";
import { PerformanceChart } from "@/components/performance-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyPlaceholder } from "@/components/ui/empty-placeholder";
import { Icons } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { DateRange, PerformanceMetrics, ReturnData, TrackedItem } from "@/lib/types";
import NumberFlow from "@number-flow/react";
import { AlertFeedback, ApplicationShell, DateRangeSelector, GainPercent } from "@wealthfolio/ui";
import { subMonths } from "date-fns";
import { useMemo } from "react";
import { AccountSelector } from "../../components/account-selector";
import { useCalculatePerformanceHistory } from "./hooks/use-performance-data";

const PORTFOLIO_TOTAL: TrackedItem = {
  id: PORTFOLIO_ACCOUNT_ID,
  type: "account",
  name: "All Portfolio",
};

// Define the type expected by the chart
interface ChartDataItem {
  id: string;
  name: string;
  returns: ReturnData[];
}

// Define the actual structure returned by the hook (assuming it includes name/type)
interface PerformanceDataFromHook extends PerformanceMetrics {
  name: string;
  type: "account" | "symbol";
}

function PerformanceContent({
  chartData,
  isLoading,
  hasErrors,
  errorMessages,
}: {
  chartData: ChartDataItem[] | undefined;
  isLoading: boolean;
  hasErrors: boolean;
  errorMessages: string[];
}) {
  return (
    <div className="relative flex h-full w-full flex-col">
      {chartData && chartData.length > 0 && (
        <div className="min-h-[260px] w-full flex-1 sm:min-h-[320px]">
          <PerformanceChart data={chartData} />
        </div>
      )}

      {!chartData?.length && !isLoading && !hasErrors && (
        <EmptyPlaceholder
          className="mx-auto flex max-w-[420px] flex-col items-center justify-center gap-2 px-4 text-center"
          icon={<Icons.BarChart className="h-10 w-10" />}
          title="No performance data"
          description="Select accounts to compare their performance over time."
        />
      )}

      {/* Modern horizontal loader with improved UX */}
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="animate-subtle-pulse absolute inset-0 border-2 border-transparent">
            <div className="animate-progress-border bg-primary absolute top-0 left-0 h-[2px]"></div>
          </div>
          <div className="absolute bottom-3 left-1/2 w-full max-w-[220px] -translate-x-1/2 px-4 sm:bottom-4 sm:left-auto sm:max-w-none sm:translate-x-0 sm:px-0">
            <div className="bg-background/90 rounded-md border px-3 py-1.5 text-center shadow-sm backdrop-blur-sm">
              <p className="text-muted-foreground flex items-center justify-center gap-2 text-xs font-medium sm:justify-start">
                <span className="bg-primary inline-block h-2 w-2 animate-pulse rounded-full"></span>
                Calculating...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error display using AlertFeedback component */}
      {hasErrors && (
        <div className="w-full">
          <AlertFeedback title="Error calculating performance data" variant="error">
            <div>
              {errorMessages.map((error, index) => (
                <p key={index} className="text-sm">
                  {error}
                </p>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                size="sm"
                onClick={() => window.location.reload()}
                variant="default"
                className="bg-black text-white hover:bg-gray-800"
              >
                Retry
              </Button>
            </div>
          </AlertFeedback>
        </div>
      )}
    </div>
  );
}

const SelectedItemBadge = ({
  item,
  isSelected,
  onSelect,
  onDelete,
}: {
  item: TrackedItem;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) => {
  return (
    <div className="flex flex-shrink-0 items-center py-1">
      <Badge
        className={`rounded-md px-0 shadow-sm transition-all ${
          isSelected ? "ring-primary ring-2" : "ring-transparent ring-1"
        }`}
        onClick={onSelect}
        role="button"
        variant="secondary"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        aria-pressed={isSelected}
      >
        <div className="flex items-center gap-3 px-3 py-1">
          <div
            className={`h-4 w-1 rounded-full ${
              item.type === "account"
                ? "bg-zinc-500 dark:bg-zinc-400"
                : "bg-orange-500 dark:bg-orange-400"
            }`}
          ></div>
          <span className="text-sm font-medium leading-none">{item.name}</span>
        </div>
        <button
          type="button"
          className="pr-2 text-gray-500 transition-transform duration-150 hover:scale-110 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:text-zinc-400 hover:dark:text-zinc-100"
          onClick={onDelete}
          aria-label={`Remove ${item.name}`}
        >
          <Icons.Close size={18} />
        </button>
      </Badge>
    </div>
  );
};

export default function PerformancePage() {
  const [selectedItems, setSelectedItems] = usePersistentState<TrackedItem[]>(
    "performance:selectedItems",
    [PORTFOLIO_TOTAL],
  );
  const [selectedItemId, setSelectedItemId] = usePersistentState<string | null>(
    "performance:selectedItemId",
    null,
  );
  const [dateRange, setDateRange] = usePersistentState<DateRange | undefined>(
    "performance:dateRange",
    {
      from: subMonths(new Date(), 12),
      to: new Date(),
    },
  );

  // Helper function to sort comparison items (accounts first, then symbols)
  const sortComparisonItems = (items: TrackedItem[]): TrackedItem[] => {
    return [...items].sort((a, b) => {
      // Sort by type first (accounts before symbols)
      if (a.type !== b.type) {
        return a.type === "account" ? -1 : 1;
      }
      // If same type, maintain original order
      return 0;
    });
  };

  // Use the custom hook for parallel data fetching with effective date calculation
  const {
    data: performanceData,
    isLoading: isLoadingPerformance,
    hasErrors,
    errorMessages,
    displayDateRange,
  } = useCalculatePerformanceHistory({
    selectedItems,
    dateRange,
  });

  // Calculate derived chart data
  const chartData = useMemo(() => {
    if (!performanceData || !selectedItems) return [];

    return (
      performanceData
        // Update type predicate to use the more accurate type
        .filter(
          (item): item is PerformanceDataFromHook =>
            item !== null && typeof item.id === "string" && Array.isArray(item.returns),
        )
        .map(
          (perfItem): ChartDataItem => ({
            id: perfItem.id,
            name: perfItem.name, // Can now safely access name from perfItem
            returns: perfItem.returns,
          }),
        )
    );
  }, [performanceData, selectedItems]);

  // Calculate selected item data
  const selectedItemData = useMemo(() => {
    if (!performanceData?.length || !selectedItems) return null;
    const targetId = selectedItemId || performanceData.find((item) => item !== null)?.id; // Find first non-null item ID if none selected
    if (!targetId) return null;
    const found = performanceData.find((item) => item?.id === targetId);
    if (!found) return null;
    const name = selectedItems.find((item) => item.id === found.id)?.name || "Unknown";
    return {
      id: found.id,
      name: name,
      totalReturn: Number(found.cumulativeTwr),
      annualizedReturn: Number(found.annualizedTwr),
      volatility: Number(found.volatility),
      maxDrawdown: Number(found.maxDrawdown),
    };
  }, [selectedItemId, performanceData, selectedItems]);

  const handleAccountSelect = (account: { id: string; name: string }) => {
    setSelectedItems((prev) => {
      const exists = prev.some((item) => item.id === account.id);
      if (exists) {
        return sortComparisonItems(prev.filter((item) => item.id !== account.id));
      }

      // Create a proper ComparisonItem
      const newItem: TrackedItem = {
        id: account.id,
        type: "account",
        name: account.name,
      };

      return sortComparisonItems([...prev, newItem]);
    });
  };

  const handleSymbolSelect = (symbol: { id: string; name: string }) => {
    setSelectedItems((prev) => {
      const exists = prev.some((item) => item.id === symbol.id);
      if (exists) return sortComparisonItems(prev);

      const newSymbol: TrackedItem = {
        id: symbol.id,
        type: "symbol",
        name: symbol.name,
      };

      return sortComparisonItems([...prev, newSymbol]);
    });
  };

  const handleBadgeSelect = (item: TrackedItem) => {
    setSelectedItemId(selectedItemId === item.id ? null : item.id);
  };

  const handleBadgeDelete = (e: React.MouseEvent, item: TrackedItem) => {
    e.stopPropagation();
    if (item.type === "account") {
      handleAccountSelect({ id: item.id, name: item.name });
    } else {
      setSelectedItems((prev) => sortComparisonItems(prev.filter((i) => i.id !== item.id)));
    }
    if (selectedItemId === item.id) {
      setSelectedItemId(null);
    }
  };

  return (
    <ApplicationShell>
      <ApplicationHeader
        heading="Performance"
        className="flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="w-full sm:w-auto">
          <DateRangeSelector value={dateRange} onChange={setDateRange} />
        </div>
      </ApplicationHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-5 lg:gap-6">
        <div className="flex flex-col gap-3">
          <div className="-mx-2 flex gap-2 overflow-x-auto pb-1 pl-2 pr-4 sm:m-0 sm:flex-wrap sm:overflow-visible sm:p-0">
            {selectedItems.map((item) => (
              <SelectedItemBadge
                key={item.id}
                item={item}
                isSelected={selectedItemId === item.id}
                onSelect={() => handleBadgeSelect(item)}
                onDelete={(e) => handleBadgeDelete(e, item)}
              />
            ))}
          </div>
          {selectedItems.length > 0 && <Separator className="hidden sm:block" />}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="w-full sm:w-auto">
              <AccountSelector
                setSelectedAccount={handleAccountSelect}
                variant="button"
                buttonText="Add account"
                includePortfolio={true}
                className="w-full sm:w-auto"
              />
            </div>
            <BenchmarkSymbolSelector
              onSelect={handleSymbolSelect}
              className="w-full sm:w-auto"
            />
          </div>
        </div>

        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader className="space-y-4 pb-3 sm:pb-2">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-xl">Performance</CardTitle>
                <CardDescription>{displayDateRange}</CardDescription>
                {selectedItemData && (
                  <span className="text-xs font-medium text-muted-foreground">
                    Viewing <span className="text-foreground">{selectedItemData.name}</span>
                  </span>
                )}
              </div>
              {performanceData && performanceData.length > 0 && (
                <div className="grid w-full gap-3 rounded-lg border border-border/40 bg-muted/40 p-3 sm:grid-cols-2 md:w-auto md:grid-cols-4 md:gap-4 md:p-4">
                  <div className="flex flex-col gap-1 text-left">
                    <MetricLabelWithInfo
                      label="Total Return"
                      infoText={totalReturnInfo}
                      className="justify-start"
                    />
                    <GainPercent
                      value={selectedItemData?.totalReturn ?? 0}
                      animated={true}
                      className="text-base font-semibold sm:text-lg"
                    />
                  </div>

                  <div className="flex flex-col gap-1 text-left">
                    <MetricLabelWithInfo
                      label="Annualized Return"
                      infoText={annualizedReturnInfo}
                      className="justify-start"
                    />
                    <GainPercent
                      value={selectedItemData?.annualizedReturn ?? 0}
                      animated={true}
                      className="text-base font-semibold sm:text-lg"
                    />
                  </div>

                  <div className="flex flex-col gap-1 text-left">
                    <MetricLabelWithInfo
                      label="Volatility"
                      infoText={volatilityInfo}
                      className="justify-start"
                    />
                    <span className="text-base font-semibold text-foreground sm:text-lg">
                      <NumberFlow
                        value={selectedItemData?.volatility ?? 0}
                        animated={true}
                        format={{
                          style: "percent",
                          maximumFractionDigits: 2,
                        }}
                      />
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 text-left">
                    <MetricLabelWithInfo
                      label="Max Drawdown"
                      infoText={maxDrawdownInfo}
                      className="justify-start"
                    />
                    <span className="text-base font-semibold text-destructive sm:text-lg">
                      <NumberFlow
                        value={selectedItemData?.maxDrawdown ?? 0}
                        animated={true}
                        format={{
                          style: "percent",
                          maximumFractionDigits: 2,
                        }}
                      />
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 px-3 pb-4 pt-2 sm:px-6 sm:pb-6 sm:pt-6">
            <PerformanceContent
              chartData={chartData}
              isLoading={isLoadingPerformance}
              hasErrors={hasErrors}
              errorMessages={errorMessages}
            />
          </CardContent>
        </Card>
      </div>
    </ApplicationShell>
  );
}
