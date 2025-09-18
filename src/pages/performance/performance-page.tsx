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
        <div className="min-h-0 w-full flex-1">
          <PerformanceChart data={chartData} />
        </div>
      )}

      {!chartData?.length && !isLoading && !hasErrors && (
        <EmptyPlaceholder
          className="mx-auto flex max-w-[420px] items-center justify-center"
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
          <div className="absolute right-4 bottom-4">
            <div className="bg-background/80 rounded-md border px-3 py-1.5 shadow-sm backdrop-blur-sm">
              <p className="text-muted-foreground flex items-center text-xs font-medium">
                <span className="bg-primary mr-2 inline-block h-2 w-2 animate-pulse rounded-full"></span>
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
    <div className="my-2 flex items-center">
      <Badge
        className={`rounded-md px-3 py-1 text-gray-800 shadow-sm dark:bg-zinc-800 dark:text-zinc-300 ${
          isSelected ? "ring-primary ring-2" : ""
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
        <div className="flex items-center space-x-3">
          <div
            className={`h-4 w-1 rounded-full ${
              item.type === "account"
                ? "bg-zinc-500 dark:bg-zinc-400"
                : "bg-orange-500 dark:bg-orange-400"
            }`}
          ></div>
          <span className="text-sm font-medium">{item.name}</span>
        </div>
        <button
          className="ml-3 text-gray-500 transition-all duration-150 hover:scale-110 hover:text-gray-800 dark:text-zinc-400 hover:dark:text-zinc-100"
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

      <div className="flex h-[calc(100vh-12rem)] flex-col space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          {selectedItems.map((item) => (
            <SelectedItemBadge
              key={item.id}
              item={item}
              isSelected={selectedItemId === item.id}
              onSelect={() => handleBadgeSelect(item)}
              onDelete={(e) => handleBadgeDelete(e, item)}
            />
          ))}
          {selectedItems.length > 0 && <Separator orientation="vertical" className="mx-2 h-6" />}

          <AccountSelector
            setSelectedAccount={handleAccountSelect}
            variant="button"
            buttonText="Add account"
            includePortfolio={true}
          />
          <BenchmarkSymbolSelector onSelect={handleSymbolSelect} />
        </div>

        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader className="pb-1">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">Performance</CardTitle>
                  <CardDescription>{displayDateRange}</CardDescription>
                </div>
                {performanceData && performanceData.length > 0 && (
                  <div className="grid grid-cols-2 gap-6 rounded-lg p-2 backdrop-blur-sm md:grid-cols-4">
                    <div className="flex flex-col items-center space-y-1">
                      <MetricLabelWithInfo label="Total Return" infoText={totalReturnInfo} />
                      <div className="flex items-baseline justify-center">
                        <span
                          className={`text-lg ${
                            selectedItemData && selectedItemData.totalReturn >= 0
                              ? "text-success"
                              : "text-destructive"
                          }`}
                        >
                          <GainPercent
                            value={selectedItemData?.totalReturn || 0}
                            animated={true}
                            className="text-lg"
                          />
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-center space-y-1">
                      <MetricLabelWithInfo
                        label="Annualized Return"
                        infoText={annualizedReturnInfo}
                      />
                      <div className="flex items-baseline justify-center">
                        <span
                          className={`text-lg ${
                            selectedItemData && selectedItemData.annualizedReturn >= 0
                              ? "text-success"
                              : "text-destructive"
                          }`}
                        >
                          <GainPercent
                            value={selectedItemData?.annualizedReturn || 0}
                            animated={true}
                            className="text-lg"
                          />
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-center space-y-1">
                      <MetricLabelWithInfo label="Volatility" infoText={volatilityInfo} />
                      <div className="flex items-baseline justify-center">
                        <span className="text-foreground text-lg">
                          <NumberFlow
                            value={selectedItemData?.volatility || 0}
                            animated={true}
                            format={{
                              style: "percent",
                              maximumFractionDigits: 2,
                            }}
                          />
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-center space-y-1">
                      <MetricLabelWithInfo label="Max Drawdown" infoText={maxDrawdownInfo} />
                      <div className="flex items-baseline justify-center">
                        <span className="text-destructive text-lg">
                          <NumberFlow
                            value={(selectedItemData?.maxDrawdown || 0) * -1}
                            animated={true}
                            format={{
                              style: "percent",
                              maximumFractionDigits: 2,
                            }}
                          />
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 p-6">
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
