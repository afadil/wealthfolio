import { BenchmarkSymbolSelector } from "@/components/benchmark-symbol-selector";
import { MetricLabelWithInfo } from "@/components/metric-display";
import { PerformanceChart } from "@/components/performance-chart";

import { PERFORMANCE_CHART_COLORS } from "@/components/performance-chart-colors";
import { EmptyPlaceholder } from "@/components/ui/empty-placeholder";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { PORTFOLIO_ACCOUNT_ID } from "@/lib/constants";
import { DateRange, PerformanceMetrics, ReturnData, TrackedItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import {
  AlertFeedback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Carousel,
  CarouselContent,
  CarouselItem,
  DateRangeSelector,
  GainPercent,
  Icons,
  Page,
  PageContent,
  PageHeader,
  Separator,
} from "@wealthvn/ui";
import { subMonths } from "date-fns";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AccountSelector } from "../../components/account-selector";
import { useCalculatePerformanceHistory } from "./hooks/use-performance-data";

// Define the type expected by the chart
interface ChartDataItem {
  id: string;
  name: string;
  returns: ReturnData[];
}

// Define the actual structure returned by the hook
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
  const { t } = useTranslation("performance");

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
          title={t("empty.title")}
          description={t("empty.description")}
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
                {t("calculating")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error display using AlertFeedback component */}
      {hasErrors && (
        <div className="w-full">
          <AlertFeedback title={t("error.title")} variant="error">
            <div>
              {errorMessages.map((error, index) => (
                <p key={index} className="text-sm">
                  {error}
                </p>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={() => window.location.reload()} variant="default">
                {t("actions.retry")}
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
  color,
}: {
  item: TrackedItem;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  color?: string;
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
            "h-3 w-1 rounded-full sm:h-4",
            color
              ? "transition-opacity group-hover:opacity-80"
              : item.type === "account"
                ? "bg-muted-foreground group-hover:bg-foreground transition-colors"
                : "bg-orange-500 transition-colors group-hover:bg-orange-600 dark:bg-orange-400",
          )}
          style={color ? { backgroundColor: color } : undefined}
        />
        <span className="group-hover:text-foreground text-xs font-medium transition-colors sm:text-sm">
          {item.name}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className={cn(
          "ml-2 size-5 transition-all duration-150",
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
  const { t } = useTranslation("performance");
  const [selectedItems, setSelectedItems] = usePersistentState<TrackedItem[]>(
    "performance:selectedItems",
    [
      {
        id: PORTFOLIO_ACCOUNT_ID,
        type: "account",
        name: t("allPortfolio"),
      },
    ],
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

  const chartColorMap = useMemo(() => {
    const map = new Map<string, string>();
    chartData.forEach((series, index) => {
      map.set(series.id, PERFORMANCE_CHART_COLORS[index % PERFORMANCE_CHART_COLORS.length]);
    });
    return map;
  }, [chartData]);

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
      <PageHeader
        heading={t("title")}
        actions={<DateRangeSelector value={dateRange} onChange={setDateRange} />}
      />
      <PageContent>
        {/* Full layout with separator */}
        <div className="flex flex-row items-center">
          {/* Selected items badges - horizontal scroll carousel */}
          {selectedItems.length > 0 && (
            <div className="flex items-center gap-3">
              <Carousel
                opts={{
                  align: "start",
                  loop: false,
                }}
                className="w-full max-w-[calc(100vw-24rem)] md:max-w-[calc(100vw-28rem)]"
              >
                <CarouselContent className="-ml-2">
                  {selectedItems.map((item) => (
                    <CarouselItem key={item.id} className="basis-auto pl-2">
                      <SelectedItemBadge
                        item={item}
                        isSelected={selectedItemId === item.id}
                        onSelect={() => handleBadgeSelect(item)}
                        onDelete={(e) => handleBadgeDelete(e, item)}
                        color={chartColorMap.get(item.id)}
                      />
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </Carousel>

              {/* Separator */}
              <Separator orientation="vertical" className="h-6 flex-shrink-0" />
            </div>
          )}

          {/* Full text buttons */}
          <div className="flex flex-shrink-0 items-center gap-2">
            <AccountSelector
              setSelectedAccount={handleAccountSelect}
              variant="button"
              buttonText={t("actions.addAccount")}
              includePortfolio={true}
            />
            <BenchmarkSymbolSelector onSelect={handleSymbolSelect} />
          </div>
        </div>

        <div className="flex h-[calc(100vh-12rem)] flex-col">
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader className="pb-2">
              <div className="space-y-3 sm:space-y-4">
                <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                  <div>
                    <CardTitle className="text-lg sm:text-xl">
                      {t("title")}
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {displayDateRange}
                    </CardDescription>
                  </div>
                  {performanceData && performanceData.length > 0 && (
                    <>
                      {/* Desktop metrics */}
                      <div className="grid grid-cols-2 gap-3 rounded-lg p-2 backdrop-blur-sm sm:gap-4 md:grid-cols-4 md:gap-6">
                        <div className="flex flex-col items-center space-y-0.5 sm:space-y-1">
                          <MetricLabelWithInfo
                            label={t("metrics.totalReturn")}
                            infoText={t("infoTexts.timeWeightedReturn")}
                          />
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
                            label={t("metrics.annualizedReturn")}
                            infoText={t("infoTexts.annualizedReturn")}
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
                          <MetricLabelWithInfo
                            label={t("metrics.volatility")}
                            infoText={t("infoTexts.volatility")}
                          />
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
                          <MetricLabelWithInfo
                            label={t("metrics.maxDrawdown")}
                            infoText={t("infoTexts.maxDrawdown")}
                          />
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
                    </>
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
