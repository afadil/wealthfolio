import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, Button, TooltipProvider } from "@wealthfolio/ui";
import { PrivacyProvider } from "@/context/privacy-context";
import { SettingsContext } from "@/lib/settings-provider";
import { PerformanceChart } from "@/components/performance-chart";
import { PerformanceChartMobile } from "@/components/performance-chart-mobile";
import { TopHoldings } from "@/pages/dashboard/top-holdings";
import type { TaxonomyAllocation } from "@/lib/types";
import { DrillableDonutChart } from "@/pages/holdings/components/drillable-donut-chart";
import { PortfolioComposition } from "@/pages/holdings/components/composition-chart";
import { ValueWidget } from "@/pages/insights/overview/value-strip";
import { computeValueStrip } from "@/pages/insights/overview/allocation-derivations";
import { previewHoldings } from "./design-system-screen-data";

// Supply only local context: mounting the preview never loads or mutates app settings.
const previewSettings = {
  settings: null,
  isLoading: false,
  isError: false,
  accountsGrouped: true,
  setAccountsGrouped: () => undefined,
  updateSettings: () => Promise.resolve(),
  updateBaseCurrency: () => Promise.resolve(),
  refetch: () => Promise.resolve(),
};
const insights = computeValueStrip(previewHoldings, []);
const allocations: TaxonomyAllocation[] = (
  [
    {
      title: "Asset classes",
      items: [
        ["Equities", 63.2],
        ["Bonds", 25],
        ["Real assets", 11.8],
      ],
    },
    {
      title: "Regions",
      items: [
        ["Americas", 60],
        ["Europe", 25],
        ["Asia Pacific", 15],
      ],
    },
    {
      title: "Sectors",
      items: [
        ["Technology", 35],
        ["Financials", 28],
        ["Healthcare", 22],
        ["Industrials", 15],
      ],
    },
  ] as const
).map(({ title, items }) => ({
  taxonomyId: title.toLowerCase().replaceAll(" ", "-"),
  taxonomyName: title,
  color: "var(--chart-1)",
  categories: items.map(([name, weight], index) => ({
    categoryId: name.toLowerCase().replaceAll(" ", "-"),
    categoryName: name,
    color: `var(--chart-${index + 1})`,
    value: (insights.total * weight) / 100,
    percentage: weight,
    ...(name === "Americas"
      ? {
          children: [
            {
              categoryId: "united-states",
              categoryName: "United States",
              color: "var(--chart-1)",
              value: insights.total * 0.45,
              percentage: 45,
            },
            {
              categoryId: "canada",
              categoryName: "Canada",
              color: "var(--chart-2)",
              value: insights.total * 0.15,
              percentage: 15,
            },
          ],
        }
      : {}),
  })),
}));
const performance = [
  { id: "portfolio", name: "Example portfolio", isReference: false },
  { id: "reference", name: "Example benchmark", isReference: true },
].map((series, index) => ({
  ...series,
  returns: Array.from({ length: 181 }, (_, day) => ({
    date: new Date(Date.UTC(2026, 2, 1 + day)).toISOString().slice(0, 10),
    value:
      day * (index ? 0.00035 : 0.00052) + Math.sin(day / 9) * 0.012 + Math.sin(day / 3) * 0.004,
  })),
}));

export function DesignSystemWidgets() {
  const [period, setPeriod] = useState<"1M" | "3M" | "6M">("6M");
  const days = { "1M": 30, "3M": 90, "6M": 181 }[period];
  const data = performance.map((series) => {
    const points = series.returns.slice(-days);
    const baseline = 1 + points[0].value;
    return {
      ...series,
      returns: points.map((point) => ({ ...point, value: (1 + point.value) / baseline - 1 })),
    };
  });
  return (
    <MemoryRouter>
      <SettingsContext.Provider value={previewSettings}>
        <PrivacyProvider>
          <TooltipProvider>
            <section aria-labelledby="app-widgets-title" className="min-w-0 space-y-6">
              <div className="space-y-1">
                <h2 id="app-widgets-title" className="text-lg font-semibold">
                  App widgets
                </h2>
                <p className="text-muted-foreground text-sm">
                  Real Wealthfolio components · synthetic portfolio data
                </p>
              </div>
              <section aria-label="Portfolio insights">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {(["value", "cash", "invested", "bookCost"] as const).map((metric) => (
                    <ValueWidget key={metric} metric={metric} data={insights} currency="USD" />
                  ))}
                </div>
              </section>
              <section aria-label="Allocation donuts" className="grid min-w-0 gap-4 lg:grid-cols-3">
                {allocations.map((allocation) => (
                  <div
                    key={allocation.taxonomyId}
                    data-testid={`donut-${allocation.taxonomyId}`}
                    className="min-w-0"
                  >
                    <DrillableDonutChart
                      title={allocation.taxonomyName}
                      allocation={allocation}
                      baseCurrency="USD"
                    />
                  </div>
                ))}
              </section>
              <Card className="min-w-0" data-testid="performance-widget">
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                  <CardTitle>Performance</CardTitle>
                  <div className="flex gap-1" role="group" aria-label="Performance period">
                    {(["1M", "3M", "6M"] as const).map((value) => (
                      <Button
                        key={value}
                        size="sm"
                        variant={period === value ? "secondary" : "ghost"}
                        aria-pressed={period === value}
                        onClick={() => setPeriod(value)}
                      >
                        {value}
                      </Button>
                    ))}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="hidden h-80 min-w-0 md:block">
                    <PerformanceChart data={data} />
                  </div>
                  <div className="h-72 min-w-0 md:hidden">
                    <PerformanceChartMobile data={data} />
                  </div>
                </CardContent>
              </Card>
              <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                <section aria-label="Holdings list" className="min-w-0">
                  <TopHoldings holdings={previewHoldings} baseCurrency="USD" isLoading={false} />
                </section>
                <section aria-label="Composition chart" className="min-w-0">
                  <PortfolioComposition holdings={previewHoldings} isLoading={false} />
                </section>
              </div>
            </section>
          </TooltipProvider>
        </PrivacyProvider>
      </SettingsContext.Provider>
    </MemoryRouter>
  );
}
