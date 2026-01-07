import { getSpendingTrends } from "@/commands/activity";
import { getCategoriesHierarchical } from "@/commands/category";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { formatAmount, MonthYearPicker } from "@wealthfolio/ui";
import { Line, LineChart, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import type { SpendingTrendsResponse, CategoryWithChildren } from "@/lib/types";
import { DataTableFacetedFilter } from "@/pages/activity/components/activity-datagrid/data-table-faceted-filter";
import { Eye, EyeOff, ChevronDown } from "lucide-react";
import { format, subMonths, parse } from "date-fns";

interface SpendingTrendsChartProps {
  /** Currently selected month (YYYY-MM) */
  selectedMonth: string;
  /** Base currency for display */
  currency: string;
  /** Whether to hide amounts */
  isHidden: boolean;
  /** Event IDs to include (page-wide filter) */
  includeEventIds?: string[];
  /** Whether to include all events (page-wide filter) */
  includeAllEvents?: boolean;
}

// Line configuration for the chart
interface LineConfig {
  key: string;
  name: string;
  color: string;
  strokeWidth: number;
  strokeDasharray?: string;
}

const LINE_CONFIGS: LineConfig[] = [
  { key: "current", name: "Current Month", color: "var(--primary)", strokeWidth: 2 },
  {
    key: "overlay",
    name: "Compare Month",
    color: "#a855f7",
    strokeWidth: 2,
    strokeDasharray: "6 3",
  },
  { key: "avg3", name: "3 Month Avg", color: "#22c55e", strokeWidth: 1.5, strokeDasharray: "4 4" },
  { key: "avg6", name: "6 Month Avg", color: "#eab308", strokeWidth: 1.5, strokeDasharray: "4 4" },
  { key: "avg9", name: "9 Month Avg", color: "#f97316", strokeWidth: 1.5, strokeDasharray: "4 4" },
];

export function SpendingTrendsChart({
  selectedMonth,
  currency,
  isHidden,
  includeEventIds,
  includeAllEvents = false,
}: SpendingTrendsChartProps) {
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [selectedSubcategoryIds, setSelectedSubcategoryIds] = useState<Set<string>>(new Set());

  // Overlay month for comparison (defaults to previous month)
  const [overlayMonth, setOverlayMonth] = useState<string | null>(null);
  const [overlayPickerOpen, setOverlayPickerOpen] = useState(false);

  // Line visibility states
  const [visibleLines, setVisibleLines] = useState<Set<string>>(
    new Set(LINE_CONFIGS.map((l) => l.key)),
  );

  // Set default overlay month to previous month when selectedMonth changes
  useEffect(() => {
    if (selectedMonth) {
      const currentDate = parse(selectedMonth, "yyyy-MM", new Date());
      const prevMonth = format(subMonths(currentDate, 1), "yyyy-MM");
      setOverlayMonth(prevMonth);
    }
  }, [selectedMonth]);

  const toggleLineVisibility = (lineKey: string) => {
    setVisibleLines((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(lineKey)) {
        newSet.delete(lineKey);
      } else {
        newSet.add(lineKey);
      }
      return newSet;
    });
  };

  // Fetch categories for filter
  const { data: categories = [] } = useQuery<CategoryWithChildren[], Error>({
    queryKey: [QueryKeys.CATEGORIES_HIERARCHICAL],
    queryFn: getCategoriesHierarchical,
  });

  // Build category options
  const categoryOptions = useMemo(() => {
    return categories.map((category) => ({
      value: category.id,
      label: category.name,
      color: category.color,
    }));
  }, [categories]);

  // Build subcategory options based on selected categories
  const subcategoryOptions = useMemo(() => {
    const options: { value: string; label: string; color?: string }[] = [];
    const selectedParents = categories.filter((cat) => selectedCategoryIds.has(cat.id));

    selectedParents.forEach((category) => {
      if (category.children && category.children.length > 0) {
        category.children.forEach((sub) => {
          options.push({
            value: sub.id,
            label: sub.name,
            color: category.color,
          });
        });
      }
    });

    return options;
  }, [categories, selectedCategoryIds]);

  const categoryIdsArray = useMemo(
    () => (selectedCategoryIds.size > 0 ? Array.from(selectedCategoryIds) : undefined),
    [selectedCategoryIds],
  );
  const subcategoryIdsArray = useMemo(
    () => (selectedSubcategoryIds.size > 0 ? Array.from(selectedSubcategoryIds) : undefined),
    [selectedSubcategoryIds],
  );

  const { data: trendsData, isLoading } = useQuery<SpendingTrendsResponse>({
    queryKey: [
      "spending-trends",
      selectedMonth,
      categoryIdsArray,
      subcategoryIdsArray,
      includeEventIds,
      includeAllEvents,
    ],
    queryFn: () =>
      getSpendingTrends(
        selectedMonth,
        categoryIdsArray,
        subcategoryIdsArray,
        includeEventIds,
        includeAllEvents,
      ),
    enabled: !!selectedMonth,
  });

  // Fetch overlay month data for comparison
  const { data: overlayTrendsData } = useQuery<SpendingTrendsResponse>({
    queryKey: [
      "spending-trends-overlay",
      overlayMonth,
      categoryIdsArray,
      subcategoryIdsArray,
      includeEventIds,
      includeAllEvents,
    ],
    queryFn: () =>
      getSpendingTrends(
        overlayMonth!,
        categoryIdsArray,
        subcategoryIdsArray,
        includeEventIds,
        includeAllEvents,
      ),
    enabled: !!overlayMonth && visibleLines.has("overlay"),
  });

  const chartData = useMemo(() => {
    if (!trendsData) return [];

    const currentCumulative = trendsData.currentMonth.cumulative || [];
    const avg3Cumulative = trendsData.avg3Month.cumulative || [];
    const avg6Cumulative = trendsData.avg6Month.cumulative || [];
    const avg9Cumulative = trendsData.avg9Month.cumulative || [];
    const overlayCumulative = overlayTrendsData?.currentMonth.cumulative || [];

    const maxDays = Math.max(
      currentCumulative.length,
      avg3Cumulative.length,
      avg6Cumulative.length,
      avg9Cumulative.length,
      overlayCumulative.length,
    );

    return Array.from({ length: maxDays }, (_, i) => ({
      day: i + 1,
      current: currentCumulative[i] ?? null,
      overlay: overlayCumulative[i] ?? null,
      avg3: avg3Cumulative[i] ?? null,
      avg6: avg6Cumulative[i] ?? null,
      avg9: avg9Cumulative[i] ?? null,
    }));
  }, [trendsData, overlayTrendsData]);

  const maxValue = useMemo(() => {
    if (!chartData.length) return 0;
    return Math.max(
      ...chartData.map((d) =>
        Math.max(d.current ?? 0, d.overlay ?? 0, d.avg3 ?? 0, d.avg6 ?? 0, d.avg9 ?? 0),
      ),
    );
  }, [chartData]);

  // Get overlay month label for display
  const overlayMonthLabel = useMemo(() => {
    if (!overlayMonth) return "";
    const date = parse(overlayMonth, "yyyy-MM", new Date());
    return format(date, "MMM yyyy");
  }, [overlayMonth]);

  // Handle category filter change - clear subcategories if parent is removed
  const handleCategoryChange = (values: Set<string>) => {
    setSelectedCategoryIds(values);
    // Clear subcategories that no longer have their parent selected
    if (values.size === 0) {
      setSelectedSubcategoryIds(new Set());
    } else {
      const validSubcategories = new Set<string>();
      selectedSubcategoryIds.forEach((subId) => {
        const parentStillSelected = categories.some(
          (cat) => values.has(cat.id) && cat.children?.some((child) => child.id === subId),
        );
        if (parentStillSelected) {
          validSubcategories.add(subId);
        }
      });
      setSelectedSubcategoryIds(validSubcategories);
    }
  };

  const hasActiveFilters =
    selectedCategoryIds.size > 0 || selectedSubcategoryIds.size > 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Spending Trends (Day-by-Day)</CardTitle>
          <Icons.TrendingUp className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[320px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!trendsData || chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Spending Trends (Day-by-Day)</CardTitle>
          <Icons.TrendingUp className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent className="flex h-[320px] items-center justify-center">
          <p className="text-muted-foreground text-sm">No spending data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Spending Trends (Day-by-Day)</CardTitle>
        <Icons.TrendingUp className="text-muted-foreground h-4 w-4" />
      </CardHeader>
      <CardContent>
        {/* Filters row (category/subcategory only - events filter is page-wide) */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <DataTableFacetedFilter
            title="Category"
            options={categoryOptions}
            selectedValues={selectedCategoryIds}
            onFilterChange={handleCategoryChange}
          />

          <DataTableFacetedFilter
            title="Subcategory"
            options={subcategoryOptions}
            selectedValues={selectedSubcategoryIds}
            onFilterChange={setSelectedSubcategoryIds}
            disabled={selectedCategoryIds.size === 0}
          />

          {hasActiveFilters && (
            <button
              onClick={() => {
                setSelectedCategoryIds(new Set());
                setSelectedSubcategoryIds(new Set());
              }}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            >
              Reset
              <Icons.Close className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Custom legend with eye icons and overlay month selector */}
        <div className="mb-2 flex flex-wrap items-center justify-end gap-3">
          {LINE_CONFIGS.map((config) => {
            const isVisible = visibleLines.has(config.key);
            // For overlay, show the month dropdown instead of just label
            if (config.key === "overlay") {
              return (
                <div key={config.key} className="flex items-center gap-1.5">
                  <button
                    onClick={() => toggleLineVisibility(config.key)}
                    className={`flex items-center gap-1.5 text-xs transition-opacity ${
                      isVisible ? "opacity-100" : "opacity-40"
                    }`}
                  >
                    {isVisible ? (
                      <Eye className="text-muted-foreground h-3 w-3" />
                    ) : (
                      <EyeOff className="text-muted-foreground h-3 w-3" />
                    )}
                    <div
                      className="h-0.5 w-4"
                      style={{
                        backgroundColor: config.color,
                        backgroundImage: `repeating-linear-gradient(90deg, ${config.color} 0, ${config.color} 4px, transparent 4px, transparent 8px)`,
                      }}
                    />
                  </button>
                  <Popover open={overlayPickerOpen} onOpenChange={setOverlayPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        className={`h-6 px-2 text-xs font-normal ${!isVisible ? "line-through opacity-40" : ""}`}
                      >
                        {overlayMonthLabel || "Compare..."}
                        <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <MonthYearPicker
                        value={overlayMonth ?? undefined}
                        onChange={(month: string) => {
                          setOverlayMonth(month);
                          setOverlayPickerOpen(false);
                        }}
                        maxDate={
                          selectedMonth
                            ? format(
                                subMonths(parse(selectedMonth, "yyyy-MM", new Date()), 1),
                                "yyyy-MM",
                              )
                            : undefined
                        }
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              );
            }
            return (
              <button
                key={config.key}
                onClick={() => toggleLineVisibility(config.key)}
                className={`flex items-center gap-1.5 text-xs transition-opacity ${
                  isVisible ? "opacity-100" : "opacity-40"
                }`}
              >
                {isVisible ? (
                  <Eye className="text-muted-foreground h-3 w-3" />
                ) : (
                  <EyeOff className="text-muted-foreground h-3 w-3" />
                )}
                <div
                  className="h-0.5 w-4"
                  style={{
                    backgroundColor: config.color,
                    ...(config.strokeDasharray && {
                      backgroundImage: `repeating-linear-gradient(90deg, ${config.color} 0, ${config.color} 4px, transparent 4px, transparent 8px)`,
                      backgroundColor: "transparent",
                    }),
                  }}
                />
                <span className={isVisible ? "" : "line-through"}>{config.name}</span>
              </button>
            );
          })}
        </div>

        <ChartContainer config={{}} className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                interval="preserveStartEnd"
                tickFormatter={(day) => `${day}`}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickFormatter={(value) => {
                  if (isHidden) return "****";
                  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                  return value.toFixed(0);
                }}
                width={45}
                domain={[0, maxValue * 1.1]}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="bg-background rounded-lg border p-2 shadow-sm">
                      <div className="font-medium">Day {data.day}</div>
                      {data.current !== null && visibleLines.has("current") && (
                        <div className="flex items-center gap-2 text-sm">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: "var(--primary)" }}
                          />
                          <span className="text-muted-foreground">Current:</span>
                          <span>{isHidden ? "****" : formatAmount(data.current, currency)}</span>
                        </div>
                      )}
                      {data.overlay !== null && visibleLines.has("overlay") && (
                        <div className="flex items-center gap-2 text-sm">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: "#a855f7" }}
                          />
                          <span className="text-muted-foreground">{overlayMonthLabel}:</span>
                          <span>{isHidden ? "****" : formatAmount(data.overlay, currency)}</span>
                        </div>
                      )}
                      {data.avg3 !== null && visibleLines.has("avg3") && (
                        <div className="flex items-center gap-2 text-sm">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: "#22c55e" }}
                          />
                          <span className="text-muted-foreground">3mo avg:</span>
                          <span>{isHidden ? "****" : formatAmount(data.avg3, currency)}</span>
                        </div>
                      )}
                      {data.avg6 !== null && visibleLines.has("avg6") && (
                        <div className="flex items-center gap-2 text-sm">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: "#eab308" }}
                          />
                          <span className="text-muted-foreground">6mo avg:</span>
                          <span>{isHidden ? "****" : formatAmount(data.avg6, currency)}</span>
                        </div>
                      )}
                      {data.avg9 !== null && visibleLines.has("avg9") && (
                        <div className="flex items-center gap-2 text-sm">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: "#f97316" }}
                          />
                          <span className="text-muted-foreground">9mo avg:</span>
                          <span>{isHidden ? "****" : formatAmount(data.avg9, currency)}</span>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              {visibleLines.has("current") && (
                <Line
                  type="monotone"
                  dataKey="current"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                  name="Current Month"
                  connectNulls
                />
              )}
              {visibleLines.has("overlay") && (
                <Line
                  type="monotone"
                  dataKey="overlay"
                  stroke="#a855f7"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  name={overlayMonthLabel}
                  connectNulls
                />
              )}
              {visibleLines.has("avg3") && (
                <Line
                  type="monotone"
                  dataKey="avg3"
                  stroke="#22c55e"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="3 Month Avg"
                  connectNulls
                />
              )}
              {visibleLines.has("avg6") && (
                <Line
                  type="monotone"
                  dataKey="avg6"
                  stroke="#eab308"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="6 Month Avg"
                  connectNulls
                />
              )}
              {visibleLines.has("avg9") && (
                <Line
                  type="monotone"
                  dataKey="avg9"
                  stroke="#f97316"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="9 Month Avg"
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
        <div className="text-muted-foreground mt-2 text-center text-xs">Day of Month</div>
      </CardContent>
    </Card>
  );
}
