import { BenchmarkSymbolSelector } from "@/components/benchmark-symbol-selector";
import {
  ANNUALIZED_RETURN_INFO as annualizedReturnInfo,
  MAX_DRAWDOWN_INFO as maxDrawdownInfo,
  MetricLabelWithInfo,
  TIME_WEIGHTED_RETURN_INFO as totalReturnInfo,
  VOLATILITY_INFO as volatilityInfo,
} from "@/components/metric-display";
import { Page, PageContent, PageHeader } from "@/components/page/page";
import { PerformanceChart } from "@/components/performance-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyPlaceholder } from "@/components/ui/empty-placeholder";
import { Icons } from "@/components/ui/icons";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { DateRange, PerformanceMetrics, ReturnData, TrackedItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import { AlertFeedback, DateRangeSelector, GainPercent } from "@wealthfolio/ui";
import { subMonths } from "date-fns";
import { useMemo, useState } from "react";
import { AccountSelector } from "../../components/account-selector";
import { AccountSelectorMobile } from "../../components/account-selector-mobile";
import { BenchmarkSymbolSelectorMobile } from "../../components/benchmark-symbol-selector-mobile";
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
              <Button size="sm" onClick={() => window.location.reload()} variant="default">
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
    <Badge
      className={cn(
        "text-foreground group relative cursor-pointer rounded-md px-2.5 py-1.5 shadow-sm transition-all sm:px-3",
        "hover:bg-accent/80 hover:shadow-md",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
        isSelected && "bg-warning/20 hover:bg-warning/30",
      )}
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
      <div className="flex items-center space-x-2 sm:space-x-3">
        <div
          className={cn(
            "h-3 w-1 rounded-full transition-colors sm:h-4",
            item.type === "account"
              ? "bg-muted-foreground group-hover:bg-foreground"
              : "bg-orange-500 group-hover:bg-orange-600 dark:bg-orange-400",
          )}
        />
        <span className="group-hover:text-foreground text-xs font-medium transition-colors sm:text-sm">
          {item.name}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "ml-2 h-5 w-5 transition-all duration-150",
          "hover:bg-destructive/10 hover:text-destructive hover:scale-110",
          "focus-visible:ring-destructive/50 focus-visible:ring-2",
        )}
        onClick={onDelete}
        aria-label={`Remove ${item.name}`}
      >
        <Icons.Close className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      </Button>
    </Badge>
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

  // State for mobile dropdown menu
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [benchmarkSheetOpen, setBenchmarkSheetOpen] = useState(false);

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
    const targetId = selectedItemId ?? performanceData.find((item) => item !== null)?.id; // Find first non-null item ID if none selected
    if (!targetId) return null;
    const found = performanceData.find((item) => item?.id === targetId);
    if (!found) return null;
    const name = selectedItems.find((item) => item.id === found.id)?.name ?? "Unknown";
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
    <Page>
      <PageHeader heading="Performance">
        <div className="flex items-center">
          <DateRangeSelector value={dateRange} onChange={setDateRange} />
        </div>
      </PageHeader>
      <PageContent>
        {/* Mobile: Carousel + Plus button in same row */}
        <div className="flex items-center gap-2 md:hidden">
          {/* Selected items badges carousel */}
          {selectedItems.length > 0 && (
            <ScrollArea className="scrollbar-hide flex-1 rounded-md whitespace-nowrap">
              <div className="flex items-center gap-2" style={{ scrollBehavior: "smooth" }}>
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
              <ScrollBar orientation="horizontal" className="hidden" />
            </ScrollArea>
          )}

          {/* Mobile: Plus button with dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="bg-secondary/30 hover:bg-muted/80 h-9 w-9 flex-shrink-0 rounded-md border-[1.5px] border-none"
                aria-label="Add item"
              >
                <Icons.Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => setAccountSheetOpen(true)}>
                <Icons.Briefcase className="mr-2 h-4 w-4" />
                Add Account
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setBenchmarkSheetOpen(true)}>
                <Icons.TrendingUp className="mr-2 h-4 w-4" />
                Add Benchmark
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Desktop: Full layout with separator */}
        <div className="hidden md:flex md:flex-row md:items-center">
          {/* Selected items badges - horizontal scroll carousel */}
          {selectedItems.length > 0 && (
            <div className="flex items-center gap-3">
              <ScrollArea className="scrollbar-hide w-full max-w-[calc(100vw-24rem)] rounded-md whitespace-nowrap md:max-w-[calc(100vw-28rem)]">
                <div className="flex items-center gap-2" style={{ scrollBehavior: "smooth" }}>
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
                <ScrollBar orientation="horizontal" className="hidden" />
              </ScrollArea>

              {/* Separator */}
              <Separator orientation="vertical" className="h-6 flex-shrink-0" />
            </div>
          )}

          {/* Desktop: Full text buttons */}
          <div className="flex flex-shrink-0 items-center gap-2">
            <AccountSelector
              setSelectedAccount={handleAccountSelect}
              variant="button"
              buttonText="Add account"
              includePortfolio={true}
            />
            <BenchmarkSymbolSelector onSelect={handleSymbolSelect} />
          </div>
        </div>

        {/* Mobile sheets controlled by dropdown - rendered but hidden by Sheet component */}
        <AccountSelectorMobile
          setSelectedAccount={(account) => {
            handleAccountSelect(account);
            setAccountSheetOpen(false);
          }}
          includePortfolio={true}
          open={accountSheetOpen}
          onOpenChange={setAccountSheetOpen}
          className="hidden"
        />
        <BenchmarkSymbolSelectorMobile
          onSelect={(symbol) => {
            handleSymbolSelect(symbol);
            setBenchmarkSheetOpen(false);
          }}
          open={benchmarkSheetOpen}
          onOpenChange={setBenchmarkSheetOpen}
          className="hidden"
        />

        <div className="flex h-[calc(100vh-19rem)] flex-col md:h-[calc(100vh-12rem)]">
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader className="pb-1">
              <div className="space-y-3 sm:space-y-4">
                <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                  <div>
                    <CardTitle className="text-lg sm:text-xl">Performance</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {displayDateRange}
                    </CardDescription>
                  </div>
                  {performanceData && performanceData.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 rounded-lg p-2 backdrop-blur-sm sm:gap-4 md:grid-cols-4 md:gap-6">
                      <div className="flex flex-col items-center space-y-0.5 sm:space-y-1">
                        <MetricLabelWithInfo label="Total Return" infoText={totalReturnInfo} />
                        <div className="flex items-baseline justify-center">
                          <span
                            className={`text-base sm:text-lg ${
                              selectedItemData && selectedItemData.totalReturn >= 0
                                ? "text-success"
                                : "text-destructive"
                            }`}
                          >
                            <GainPercent
                              value={selectedItemData?.totalReturn ?? 0}
                              animated={true}
                              className="text-base sm:text-lg"
                            />
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-center space-y-0.5 sm:space-y-1">
                        <MetricLabelWithInfo
                          label="Annualized Return"
                          infoText={annualizedReturnInfo}
                        />
                        <div className="flex items-baseline justify-center">
                          <span
                            className={`text-base sm:text-lg ${
                              selectedItemData && selectedItemData.annualizedReturn >= 0
                                ? "text-success"
                                : "text-destructive"
                            }`}
                          >
                            <GainPercent
                              value={selectedItemData?.annualizedReturn ?? 0}
                              animated={true}
                              className="text-base sm:text-lg"
                            />
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-center space-y-0.5 sm:space-y-1">
                        <MetricLabelWithInfo label="Volatility" infoText={volatilityInfo} />
                        <div className="flex items-baseline justify-center">
                          <span className="text-foreground text-base sm:text-lg">
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
                      </div>

                      <div className="flex flex-col items-center space-y-0.5 sm:space-y-1">
                        <MetricLabelWithInfo label="Max Drawdown" infoText={maxDrawdownInfo} />
                        <div className="flex items-baseline justify-center">
                          <span className="text-destructive text-base sm:text-lg">
                            <NumberFlow
                              value={(selectedItemData?.maxDrawdown ?? 0) * -1}
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
            <CardContent className="min-h-0 flex-1 p-3 sm:p-6">
              <PerformanceContent
                chartData={chartData}
                isLoading={isLoadingPerformance}
                hasErrors={hasErrors}
                errorMessages={errorMessages}
              />
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </Page>
  );
}
