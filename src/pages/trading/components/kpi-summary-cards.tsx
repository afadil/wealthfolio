import { Card, CardContent, CardHeader, CardTitle, GainAmount, GainPercent, Icons } from "@wealthvn/ui";
import type { SwingMetrics } from "../types";

interface KPISummaryCardsProps {
  metrics: SwingMetrics;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}

export function KPISummaryCards({ metrics, t }: KPISummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
      {/* Widget 1: Overall P/L Summary */}
      <Card
        className={`${metrics.totalPL >= 0 ? "border-success/10 bg-success/10" : "border-destructive/10 bg-destructive/10"}`}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pt-4 pb-3">
          <CardTitle className="text-sm font-medium">{t("dashboard.kpi.pl.title")}</CardTitle>
          <GainAmount
            className="text-xl font-bold sm:text-2xl"
            value={metrics.totalPL}
            currency={metrics.currency}
          />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground text-xs">
                {t("dashboard.kpi.pl.realized", { count: metrics.totalTrades })}
              </span>
              <div className="flex items-center gap-2">
                <GainAmount
                  value={metrics.totalRealizedPL}
                  currency={metrics.currency}
                  className="font-medium"
                  displayDecimal={false}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground text-xs">
                {t("dashboard.kpi.pl.unrealized", { count: metrics.openPositions })}
              </span>
              <div className="flex items-center gap-2">
                <GainAmount
                  value={metrics.totalUnrealizedPL}
                  currency={metrics.currency}
                  className="font-medium"
                  displayDecimal={false}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Widget 2: Core Performance */}
      <Card className="border-blue-500/10 bg-blue-500/10">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {t("dashboard.kpi.corePerformance.title")}
          </CardTitle>
          <Icons.CheckCircle className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">
                {t("dashboard.kpi.corePerformance.winRate")}
              </span>
              <GainPercent
                value={metrics.winRate}
                className="text-sm font-semibold"
                showSign={false}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">
                {t("dashboard.kpi.corePerformance.avgWin")}
              </span>
              <GainAmount
                value={metrics.averageWin}
                currency={metrics.currency}
                className="text-sm font-semibold"
                displayDecimal={false}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">
                {t("dashboard.kpi.corePerformance.avgLoss")}
              </span>
              <GainAmount
                value={-metrics.averageLoss}
                currency={metrics.currency}
                className="text-sm font-semibold"
                displayDecimal={false}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">
                {t("dashboard.kpi.corePerformance.totalTrades")}
              </span>
              <span className="text-sm font-semibold">{metrics.totalTrades}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Widget 3: Analytics & Ratios */}
      <Card className="border-purple-500/10 bg-purple-500/10">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t("dashboard.kpi.analytics.title")}</CardTitle>
          <Icons.BarChart className="text-muted-foreground h-4 w-4" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">
                {t("dashboard.kpi.analytics.expectancy")}
              </span>
              <GainAmount
                value={metrics.expectancy}
                currency={metrics.currency}
                className="text-sm font-semibold"
                displayDecimal={false}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">
                {t("dashboard.kpi.analytics.profitFactor")}
              </span>
              <span className="text-sm font-semibold">
                {metrics.profitFactor === Number.POSITIVE_INFINITY
                  ? "∞"
                  : metrics.profitFactor.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">
                {t("dashboard.kpi.analytics.avgHoldTime")}
              </span>
              <span className="text-sm font-semibold">
                {metrics.averageHoldingDays.toFixed(1)} {t("dashboard.kpi.analytics.daysUnit")}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
