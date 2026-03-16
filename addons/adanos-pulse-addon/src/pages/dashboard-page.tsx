import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Icons,
  Page,
  PageContent,
  PageHeader,
  TickerAvatar,
} from "@wealthfolio/ui";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import { useAdanosApiKey } from "../hooks/use-adanos-api-key";
import { useAdanosPreferences } from "../hooks/use-adanos-preferences";
import { usePortfolioSentiment } from "../hooks/use-portfolio-sentiment";
import {
  formatCompactNumber,
  formatCurrency,
  formatPercent,
  getCoverageLabel,
  getSentimentClasses,
  getSentimentLabel,
  getStrongestHoldingLabel,
} from "../lib/utils";
import type { PortfolioSentimentResult } from "../types";

interface DashboardPageProps {
  ctx: AddonContext;
}

export default function DashboardPage({ ctx }: DashboardPageProps) {
  const { apiKey, isLoading: apiKeyLoading } = useAdanosApiKey(ctx);
  const { preferences } = useAdanosPreferences(ctx);
  const { data, error, isLoading, isFetching, refetch } = usePortfolioSentiment({
    ctx,
    apiKey,
    preferences,
  });
  const summary = buildSummary(data, preferences.enabledPlatforms.length);

  return (
    <Page>
      <PageHeader
        heading="Adanos Pulse"
        text="Overlay Reddit, X, news, and Polymarket sentiment on your biggest holdings."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => ctx.api.navigation.navigate("/addons/adanos-pulse/settings")}
            >
              <Icons.Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
            <Button variant="outline" onClick={() => refetch()} disabled={!apiKey || isFetching}>
              {isFetching ? (
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Icons.RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        }
      />

      <PageContent className="space-y-6">
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
                description={`Top positions with stock-like tickers`}
              />
              <SummaryCard
                label="Strongest signal"
                value={summary.strongestHolding}
                description="Highest composite buzz in the current view"
              />
              <SummaryCard
                label="Bullish positions"
                value={String(summary.bullishPositions)}
                description={`Sentiment > 0.15 across available platforms`}
              />
            </div>

            {data?.errors && data.errors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Partial platform coverage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.errors.map((message) => (
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
                    Adanos Pulse looks at the largest stock-like tickers in the TOTAL holdings view.
                  </p>
                  <p className="text-muted-foreground">
                    If your portfolio is mostly cash, private assets, or unsupported symbols, the
                    dashboard stays empty.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </PageContent>
    </Page>
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
          This addon calls the Adanos compare endpoints for Reddit, X, news, and Polymarket
          sentiment. Add your API key in settings to activate the dashboard.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href="https://api.adanos.org/docs" target="_blank" rel="noreferrer">
              API docs
            </a>
          </Button>
          <Button asChild>
            <a
              href="https://adanos.org/reddit-stock-sentiment#api"
              target="_blank"
              rel="noreferrer"
            >
              Get API key
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        <p className="text-muted-foreground mt-1 text-xs">{description}</p>
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
  return (
    <Card>
      <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <TickerAvatar symbol={holding.symbol} className="h-10 w-10" />
          <div>
            <CardTitle className="text-xl">{holding.symbol}</CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">{holding.name}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="bg-muted rounded-full px-2 py-1">
                {formatPercent(holding.weight, 1)} weight
              </span>
              <span className="bg-muted rounded-full px-2 py-1">
                {formatCurrency(holding.marketValueBase, holding.baseCurrency)}
              </span>
              <span className="bg-muted rounded-full px-2 py-1">
                {getCoverageLabel(holding.coverage, platformCount)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <div className="text-muted-foreground text-xs uppercase tracking-wide">Composite</div>
          <span
            className={`rounded-full px-2 py-1 text-xs font-medium ${getSentimentClasses(holding.compositeSentiment)}`}
          >
            {getSentimentLabel(holding.compositeSentiment)}
          </span>
          <div className="text-sm font-medium">
            Buzz {holding.compositeBuzz !== null ? Math.round(holding.compositeBuzz) : "No data"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {holding.platforms.map((platform) => (
          <div key={platform.platformId} className="border-border/70 bg-card rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">{platform.label}</h3>
              <span
                className={`rounded-full px-2 py-1 text-[11px] font-medium ${getSentimentClasses(platform.sentiment)}`}
              >
                {getSentimentLabel(platform.sentiment)}
              </span>
            </div>

            <div className="mt-3 space-y-2 text-sm">
              <MetricRow
                label="Buzz"
                value={
                  platform.buzzScore !== null ? String(Math.round(platform.buzzScore)) : "No data"
                }
              />
              <MetricRow label="Sentiment" value={formatPercent(platform.sentiment, 1)} />
              <MetricRow
                label={platform.primaryMetricLabel}
                value={formatCompactNumber(platform.primaryMetricValue)}
              />
              {platform.secondaryMetricLabel && (
                <MetricRow
                  label={platform.secondaryMetricLabel}
                  value={
                    platform.platformId === "polymarket"
                      ? formatCurrency(platform.secondaryMetricValue)
                      : formatCompactNumber(platform.secondaryMetricValue)
                  }
                />
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
      <span className="text-right font-medium">{value}</span>
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
      ? `${strongestHolding.symbol} · ${getStrongestHoldingLabel(strongestHolding.platforms)}`
      : `No data across ${totalPlatforms} platforms`,
  };
}
