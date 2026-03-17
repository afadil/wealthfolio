import { AnimatedToggleGroup, Button, Icons, Page, PageContent, PageHeader } from "@wealthfolio/ui";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import type { ReactNode } from "react";
import { useAdanosApiKey } from "../hooks/use-adanos-api-key";
import { useAdanosPreferences } from "../hooks/use-adanos-preferences";
import { usePortfolioSentiment } from "../hooks/use-portfolio-sentiment";
import { formatFetchedAtLabel, formatLookbackLabel } from "../lib/utils";
import PortfolioSentimentSection from "../components/portfolio-sentiment-section";

interface DashboardPageProps {
  ctx: AddonContext;
}

const lookbackItems = [
  { value: "1" as const, label: "24H" },
  { value: "7" as const, label: "7D" },
  { value: "14" as const, label: "14D" },
  { value: "30" as const, label: "30D" },
];

export default function DashboardPage({ ctx }: DashboardPageProps) {
  const { apiKey, isLoading: apiKeyLoading } = useAdanosApiKey(ctx);
  const { preferences, updatePreferences } = useAdanosPreferences(ctx);
  const sentimentQuery = usePortfolioSentiment({
    ctx,
    apiKey,
    preferences,
  });
  const sourcesLabel = preferences.enabledPlatforms.map(getPlatformLabel).join(" • ");
  const handleLookbackChange = (value: "1" | "7" | "14" | "30") => {
    updatePreferences({ days: Number(value) as 1 | 7 | 14 | 30 });
  };

  return (
    <Page>
      <PageHeader
        heading="Adanos Sentiment"
        text="Overlay Reddit, X.com, news, and Polymarket sentiment on your biggest holdings."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden rounded-2xl border border-border/70 bg-background/70 p-1 shadow-sm md:block">
              <AnimatedToggleGroup
                items={lookbackItems}
                value={String(preferences.days)}
                onValueChange={(value) => handleLookbackChange(value as "1" | "7" | "14" | "30")}
                variant="secondary"
                size="sm"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => sentimentQuery.refetch()}
              disabled={!apiKey || sentimentQuery.isFetching || apiKeyLoading}
              className="rounded-full shadow-sm"
            >
              {sentimentQuery.isFetching ? (
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Icons.RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => ctx.api.navigation.navigate("/addons/adanos-sentiment/settings")}
              className="rounded-full shadow-sm"
              aria-label="Open settings"
            >
              <Icons.Settings className="size-4" />
            </Button>
          </div>
        }
      />

      <PageContent className="space-y-6">
        <div className="flex justify-end md:hidden">
          <div className="rounded-2xl border border-border/70 bg-background/70 p-1 shadow-sm">
            <AnimatedToggleGroup
              items={lookbackItems}
              value={String(preferences.days)}
              onValueChange={(value) => handleLookbackChange(value as "1" | "7" | "14" | "30")}
              variant="secondary"
              size="sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <InfoPill icon={<Icons.Clock className="h-3.5 w-3.5" />}>
            {formatLookbackLabel(preferences.days)}
          </InfoPill>
          <InfoPill icon={<Icons.Globe className="h-3.5 w-3.5" />}>{sourcesLabel}</InfoPill>
          <InfoPill icon={<Icons.Activity2 className="h-3.5 w-3.5" />}>
            {formatFetchedAtLabel(sentimentQuery.data?.fetchedAt)}
          </InfoPill>
        </div>

        <PortfolioSentimentSection
          apiKey={apiKey}
          apiKeyLoading={apiKeyLoading}
          preferences={preferences}
          data={sentimentQuery.data}
          error={sentimentQuery.error}
          isLoading={sentimentQuery.isLoading}
          refetch={sentimentQuery.refetch}
        />
      </PageContent>
    </Page>
  );
}

function getPlatformLabel(platform: "reddit" | "x" | "news" | "polymarket") {
  switch (platform) {
    case "reddit":
      return "Reddit";
    case "x":
      return "X.com";
    case "news":
      return "News";
    case "polymarket":
      return "Polymarket";
  }
}

function InfoPill({
  children,
  icon,
}: {
  children: string;
  icon: ReactNode;
}) {
  return (
    <span className="bg-muted/80 text-muted-foreground inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-xs shadow-sm">
      {icon}
      <span>{children}</span>
    </span>
  );
}
