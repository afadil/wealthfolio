import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Icons,
  TickerAvatar,
} from "@wealthfolio/ui";
import type { ComponentType } from "react";
import {
  ADANOS_PRICING_URL,
  buildCompositeSignal,
  formatBullishPercent,
  formatDetailedBuzzScore,
  formatBuzzScore,
  formatCompactNumber,
  formatCurrency,
  formatPercent,
  getCoverageLabel,
  getAlignmentValueClass,
  getBullishValueClass,
  getRecommendationBadgeClasses,
  getTrendValueClass,
  formatTrendLabel,
  isMonthlyLimitExceededMessage,
} from "../lib/utils";
import type { AdanosPreferences, PortfolioSentimentResult } from "../types";

interface PortfolioSentimentSectionProps {
  apiKey: string | null;
  apiKeyLoading: boolean;
  preferences: AdanosPreferences;
  data: PortfolioSentimentResult | undefined;
  error: Error | null;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
}

export default function PortfolioSentimentSection({
  apiKey,
  apiKeyLoading,
  preferences,
  data,
  error,
  isLoading,
  refetch,
}: PortfolioSentimentSectionProps) {
  const summary = buildSummary(data, preferences.enabledPlatforms.length);
  const monthlyLimitErrors = (data?.errors ?? []).filter(isMonthlyLimitExceededMessage);
  const otherErrors = (data?.errors ?? []).filter((message) => !isMonthlyLimitExceededMessage(message));

  return (
    <section className="space-y-6">
      {!apiKeyLoading && !apiKey && <MissingApiKeyCard />}

      {error && (
        <Card>
          <CardHeader>
            <CardTitle>Adanos request failed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">{error.message}</p>
            <Button variant="outline" onClick={() => refetch()}>
              <Icons.RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {apiKey && !error && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <SummaryCard
              label="Tracked holdings"
              value={String(summary.trackedHoldings)}
              description="Top positions with stock-like tickers"
              icon={Icons.BarChart}
              accentClassName="border-success/10 bg-success/10"
              dividerClassName="border-success/10"
            />
            <SummaryCard
              label="Strongest signal"
              value={summary.strongestHolding}
              description="Highest average buzz across enabled sources"
              icon={Icons.Activity2}
              accentClassName="border-blue-500/10 bg-blue-500/10"
              dividerClassName="border-blue-500/10"
            />
            <SummaryCard
              label="Bullish positions"
              value={String(summary.bullishPositions)}
              description="Sentiment > 0.15 across available platforms"
              icon={Icons.CheckCircle}
              valueClassName={
                summary.bullishPositions > 0 ? "text-success" : "text-muted-foreground"
              }
              accentClassName="border-purple-500/10 bg-purple-500/10"
              dividerClassName="border-purple-500/10"
            />
          </div>

          {monthlyLimitErrors.length > 0 && (
            <Card className="border-destructive/10 bg-destructive/10">
              <CardHeader>
                <CardTitle>Free monthly limit reached</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">
                  Your Adanos free account has used all 250 monthly requests. Upgrade for unlimited
                  requests. Your current API key stays the same after upgrading.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <a href={ADANOS_PRICING_URL} target="_blank" rel="noreferrer">
                      View pricing
                    </a>
                  </Button>
                  <Button variant="outline" onClick={() => void refetch()}>
                    <Icons.RefreshCw className="mr-2 h-4 w-4" />
                    Check again
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {otherErrors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Partial platform coverage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {otherErrors.map((message) => (
                  <p key={message} className="text-muted-foreground text-sm">
                    {message}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          {isLoading ? (
            <Card>
              <CardContent className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
                <Icons.Spinner className="h-4 w-4 animate-spin" />
                Loading portfolio sentiment...
              </CardContent>
            </Card>
          ) : data?.holdings.length ? (
            <div className="space-y-4">
              {data.holdings.map((holding) => (
                <HoldingCard
                  key={holding.symbol}
                  holding={holding}
                  platformCount={preferences.enabledPlatforms.length}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>No supported holdings found</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  Adanos Sentiment looks at the largest stock-like tickers in the TOTAL holdings view.
                </p>
                <p className="text-muted-foreground">
                  If your portfolio is mostly cash, private assets, or unsupported symbols, this
                  section stays empty.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </section>
  );
}

function MissingApiKeyCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your Adanos API key</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Add your key from the settings button above to activate Reddit, X.com, news, and Polymarket
          sentiment for your holdings.
        </p>
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  label,
  value,
  description,
  icon: Icon,
  valueClassName,
  accentClassName,
  dividerClassName,
}: {
  label: string;
  value: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  valueClassName?: string;
  accentClassName?: string;
  dividerClassName?: string;
}) {
  return (
    <Card className={`overflow-hidden border ${accentClassName ?? "border-border/70 bg-card"}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="text-muted-foreground h-4 w-4" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className={`text-2xl font-bold tracking-tight ${valueClassName ?? ""}`}>{value}</div>
          <div className={`pt-2 text-xs ${dividerClassName ?? "border-border/60"} border-t`}>
            <p className="text-muted-foreground leading-relaxed">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HoldingCard({
  holding,
  platformCount,
}: {
  holding: NonNullable<PortfolioSentimentResult["holdings"]>[number];
  platformCount: number;
}) {
  const compositeSignal = holding.compositeSignal ?? buildCompositeSignal(holding.platforms);

  return (
    <Card className="overflow-hidden border-border/70">
      <CardHeader className="gap-3 pb-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_18rem] sm:items-start">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <TickerAvatar symbol={holding.symbol} className="h-11 w-11 shrink-0" />
              <div className="min-w-0">
                <CardTitle className="text-2xl leading-none tracking-tight">
                  {holding.symbol}
                </CardTitle>
                <p className="text-muted-foreground mt-1 truncate text-sm">{holding.name}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <MetaPill label="Portfolio share" value={formatPercent(holding.weight, 1)} />
              <MetaPill
                label="Value"
                value={formatCurrency(holding.marketValueBase, holding.baseCurrency)}
              />
              <MetaPill label="Coverage" value={getCoverageLabel(holding.coverage, platformCount)} />
            </div>
          </div>

          <div className={`rounded-xl border px-3 py-3 ${getCompositeSurfaceClasses(compositeSignal?.recommendation.className)}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Adanos signal</span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm ${getRecommendationBadgeClasses(compositeSignal?.recommendation)}`}
              >
                {compositeSignal?.recommendation.label ?? "No signal"}
              </span>
            </div>

            <div className={`mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-2 ${getCompositeDividerClasses(compositeSignal?.recommendation.className)}`}>
              <MetricBlock
                label="Average buzz"
                value={formatDetailedBuzzScore(holding.compositeBuzz)}
              />
              <MetricBlock
                label="Conviction"
                value={
                  compositeSignal ? `${compositeSignal.conviction}/100` : "No data"
                }
              />
              <MetricBlock
                label="Bullish avg"
                value={formatBullishPercent(compositeSignal?.bullishAverage)}
                valueClassName={getBullishValueClass(compositeSignal?.bullishAverage)}
              />
              <MetricBlock
                label="Source alignment"
                value={compositeSignal?.sourceAlignment.label ?? "No data"}
                valueClassName={getAlignmentValueClass(compositeSignal?.sourceAlignment)}
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          {holding.platforms.map((platform) => (
            <SourceCard key={platform.platformId} platform={platform} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background/80 inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-1.5 text-sm shadow-sm">
      <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-[0.14em]">
        {label}
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function SourceCard({
  platform,
}: {
  platform: NonNullable<PortfolioSentimentResult["holdings"]>[number]["platforms"][number];
}) {
  const metrics = [
    {
      label: "Buzz",
      value: formatBuzzScore(platform.buzzScore),
      valueClassName: "",
    },
    {
      label: "Bullish",
      value: formatBullishPercent(platform.bullishPct),
      valueClassName: getBullishValueClass(platform.bullishPct),
    },
    {
      label: platform.activityMetricLabel,
      value: formatCompactNumber(platform.activityMetricValue),
      valueClassName: "",
    },
    {
      label: "Trend",
      value: formatTrendLabel(platform.trend),
      valueClassName: getTrendValueClass(platform.trend),
    },
  ];

  return (
    <div
      className={`rounded-xl border p-3 ${getSentimentSurfaceClasses(platform.sentiment)}`}
    >
      <div className="pb-2">
        <h3 className="text-base font-semibold tracking-tight">{platform.label}</h3>
      </div>

      <div
        className={`grid grid-cols-2 gap-3 border-t pt-2 ${getSentimentDividerClasses(platform.sentiment)}`}
      >
        {metrics.map((metric) => (
          <MetricBlock
            key={metric.label}
            label={metric.label}
            value={metric.value}
            valueClassName={metric.valueClassName}
          />
        ))}
      </div>
    </div>
  );
}

function MetricBlock({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <div className="text-muted-foreground text-[11px] font-medium uppercase tracking-[0.18em]">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold leading-snug tabular-nums ${valueClassName ?? ""}`}>
        {value}
      </div>
    </div>
  );
}

function buildSummary(data: PortfolioSentimentResult | undefined, totalPlatforms: number) {
  const holdings = data?.holdings ?? [];
  const strongestHolding = [...holdings].sort(
    (left, right) => (right.compositeBuzz ?? -1) - (left.compositeBuzz ?? -1),
  )[0];

  return {
    trackedHoldings: holdings.length,
    bullishPositions: holdings.filter((holding) => (holding.compositeSentiment ?? 0) > 0.15).length,
    strongestHolding: strongestHolding
      ? `${strongestHolding.symbol} · Avg. Buzz ${formatDetailedBuzzScore(strongestHolding.compositeBuzz)}`
      : `No data across ${totalPlatforms} platforms`,
  };
}

function getSentimentSurfaceClasses(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "border-border/70 bg-card";
  }

  if (value >= 0.15) {
    return "border-success/10 bg-success/10";
  }

  if (value <= -0.15) {
    return "border-destructive/10 bg-destructive/10";
  }

  return "border-warning/10 bg-warning/10";
}

function getSentimentDividerClasses(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "border-border/60";
  }

  if (value >= 0.15) {
    return "border-success/10";
  }

  if (value <= -0.15) {
    return "border-destructive/10";
  }

  return "border-warning/10";
}

function getCompositeSurfaceClasses(recommendationClassName: "buy" | "hold" | "sell" | undefined) {
  if (recommendationClassName === "buy") {
    return "border-success/10 bg-success/10";
  }

  if (recommendationClassName === "sell") {
    return "border-destructive/10 bg-destructive/10";
  }

  return "border-warning/10 bg-warning/10";
}

function getCompositeDividerClasses(recommendationClassName: "buy" | "hold" | "sell" | undefined) {
  if (recommendationClassName === "buy") {
    return "border-success/10";
  }

  if (recommendationClassName === "sell") {
    return "border-destructive/10";
  }

  return "border-warning/10";
}
