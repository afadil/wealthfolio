import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Icons,
  Input,
  Label,
  Page,
  PageContent,
  PageHeader,
} from "@wealthfolio/ui";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import React from "react";
import { useAdanosAccountStatus } from "../hooks/use-adanos-account-status";
import { useAdanosApiKey } from "../hooks/use-adanos-api-key";
import { useAdanosPreferences } from "../hooks/use-adanos-preferences";
import type { AdanosPlatformId } from "../types";
import {
  ADANOS_PRICING_URL,
  PLATFORM_ORDER,
  formatAccountTypeLabel,
  formatDashboardRequestEstimate,
  formatFetchedAtLabel,
} from "../lib/utils";

interface SettingsPageProps {
  ctx: AddonContext;
}

const PLATFORM_LABELS: Record<AdanosPlatformId, string> = {
  reddit: "Reddit",
  x: "X.com",
  news: "News",
  polymarket: "Polymarket",
};

export default function SettingsPage({ ctx }: SettingsPageProps) {
  const { apiKey, saveApiKey, isLoading: apiKeyLoading, isSaving } = useAdanosApiKey(ctx);
  const {
    accountStatus,
    isLoading: accountStatusLoading,
    isRefreshing: accountStatusRefreshing,
    error: accountStatusError,
    refreshAccountStatus,
    clearAccountStatus,
  } = useAdanosAccountStatus(apiKey);
  const { preferences, updatePreferences, isUpdating } = useAdanosPreferences(ctx);
  const [draftApiKey, setDraftApiKey] = React.useState("");

  React.useEffect(() => {
    setDraftApiKey(apiKey ?? "");
  }, [apiKey]);

  const handleSaveApiKey = async () => {
    const nextApiKey = draftApiKey.trim() || null;
    await saveApiKey(nextApiKey);
    clearAccountStatus();

    if (nextApiKey) {
      await refreshAccountStatus(nextApiKey);
      return;
    }

    clearAccountStatus();
  };

  const handleClearApiKey = async () => {
    setDraftApiKey("");
    await saveApiKey(null);
    clearAccountStatus();
  };

  const handlePlatformToggle = (platformId: AdanosPlatformId, checked: boolean) => {
    const nextPlatforms = checked
      ? [...preferences.enabledPlatforms, platformId]
      : preferences.enabledPlatforms.filter((value) => value !== platformId);

    if (nextPlatforms.length === 0) {
      return;
    }

    updatePreferences({ enabledPlatforms: nextPlatforms });
  };

  return (
    <Page>
      <PageHeader
        heading="Adanos Sentiment Settings"
        text="Configure secure API access and choose how Adanos scores your portfolio."
        actions={
          <Button
            variant="outline"
            onClick={() => ctx.api.navigation.navigate("/addons/adanos-sentiment")}
          >
            <Icons.ArrowLeft className="mr-2 h-4 w-4" />
            Back to Adanos Sentiment
          </Button>
        }
      />

      <PageContent className="max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>API key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adanos-api-key">Adanos API key</Label>
              <Input
                id="adanos-api-key"
                type="password"
                placeholder="sk_live_..."
                value={draftApiKey}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setDraftApiKey(event.target.value)
                }
                disabled={apiKeyLoading || isSaving}
              />
              <p className="text-muted-foreground text-xs">
                Stored with Wealthfolio's encrypted addon secrets storage, not in local storage.
              </p>
              <p className="text-muted-foreground text-xs">
                This version uses the existing Adanos stock detail endpoints for source cards, so a
                dashboard refresh can consume multiple monthly requests on free plans.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleSaveApiKey()} disabled={isSaving}>
                {isSaving ? (
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Icons.Check className="mr-2 h-4 w-4" />
                )}
                Save API key
              </Button>
              <Button variant="outline" onClick={() => void handleClearApiKey()} disabled={isSaving}>
                Clear
              </Button>
              <Button asChild variant="outline">
                <a href="https://api.adanos.org/docs" target="_blank" rel="noreferrer">
                  API docs
                </a>
              </Button>
              <Button asChild variant="outline">
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

        <Card className={getStatusSurfaceClasses(accountStatus?.status)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Account status</CardTitle>
            {accountStatus?.status === "monthly_limit_exceeded" ? (
              <Icons.AlertCircle className="text-destructive h-4 w-4" />
            ) : (
              <Icons.CheckCircle className="text-success h-4 w-4" />
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {!apiKey ? (
              <p className="text-muted-foreground text-sm">
                Save an API key above to verify your account type and remaining monthly requests.
              </p>
            ) : accountStatusLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Icons.Spinner className="h-4 w-4 animate-spin" />
                Loading last known Adanos account status...
              </div>
            ) : accountStatusRefreshing ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Icons.Spinner className="h-4 w-4 animate-spin" />
                Checking Adanos account status...
              </div>
            ) : accountStatus ? (
              <div className="space-y-4">
                <div>
                  <div className="text-2xl font-bold">
                    {accountStatus.hasUnlimitedRequests
                      ? "Unlimited requests"
                      : `${accountStatus.monthlyRemaining} of ${accountStatus.monthlyLimit}`}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {accountStatus.hasUnlimitedRequests
                      ? "Paid plans remove the monthly cap while keeping your current API key."
                      : "Free requests remaining this calendar month."}
                  </div>
                </div>

                <div
                  className={`grid gap-3 border-t pt-2 sm:grid-cols-2 ${getStatusDividerClasses(accountStatus.status)}`}
                >
                  <div>
                    <div className="text-sm font-medium">
                      {formatAccountTypeLabel(accountStatus.accountType)}
                    </div>
                    <div className="text-muted-foreground text-xs">Account type</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      {accountStatus.status === "monthly_limit_exceeded"
                        ? "Monthly limit reached"
                        : "Active"}
                    </div>
                    <div className="text-muted-foreground text-xs">Status</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">{accountStatus.monthlyUsed}</div>
                    <div className="text-muted-foreground text-xs">Used this month</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      {accountStatus.hasUnlimitedRequests
                        ? "Unlimited"
                        : `${accountStatus.monthlyRemaining} / ${accountStatus.monthlyLimit}`}
                    </div>
                    <div className="text-muted-foreground text-xs">Requests left</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void refreshAccountStatus()}
                    disabled={accountStatusRefreshing}
                  >
                    Refresh status
                  </Button>
                  <span className="text-muted-foreground text-xs">
                    Uses 1 API request. {formatFetchedAtLabel(accountStatus.checkedAt)}
                  </span>
                </div>

                <p className="text-muted-foreground text-xs">
                  {formatDashboardRequestEstimate(preferences.enabledPlatforms.length)}
                </p>

                {accountStatus.status === "monthly_limit_exceeded" && (
                  <div className="border-destructive/20 bg-destructive/10 space-y-3 rounded-xl border p-3">
                    <div>
                      <p className="text-sm font-medium">Your free monthly requests are used up.</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        Upgrade to a paid plan for unlimited requests. Your current API key stays
                        valid after the upgrade.
                      </p>
                    </div>
                    <Button asChild>
                      <a
                        href={accountStatus.pricingUrl || ADANOS_PRICING_URL}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View pricing
                      </a>
                    </Button>
                  </div>
                )}

                {accountStatus.status !== "monthly_limit_exceeded" && (
                  <p className="text-muted-foreground text-xs">
                    Your current API key stays the same if you upgrade later.
                  </p>
                )}
              </div>
            ) : accountStatusError ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">Could not verify this API key.</p>
                <p className="text-muted-foreground text-xs">{accountStatusError.message}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void refreshAccountStatus()}
                    disabled={accountStatusRefreshing}
                  >
                    Retry status check
                  </Button>
                  <Button asChild variant="outline">
                    <a href="https://api.adanos.org/docs" target="_blank" rel="noreferrer">
                      API docs
                    </a>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-muted-foreground text-sm">
                  No recent quota headers captured yet. Run a status check here or refresh the
                  dashboard once to populate account type and monthly usage.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void refreshAccountStatus()}
                    disabled={accountStatusRefreshing}
                  >
                    Check now
                  </Button>
                  <span className="text-muted-foreground text-xs">
                    Uses 1 API request.
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  {formatDashboardRequestEstimate(preferences.enabledPlatforms.length)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Enabled platforms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {PLATFORM_ORDER.map((platformId) => (
              <div key={platformId} className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor={`platform-${platformId}`}>{PLATFORM_LABELS[platformId]}</Label>
                  <p className="text-muted-foreground text-xs">
                    Include {PLATFORM_LABELS[platformId]} in the composite sentiment view.
                  </p>
                </div>
                <Checkbox
                  id={`platform-${platformId}`}
                  checked={preferences.enabledPlatforms.includes(platformId)}
                  onCheckedChange={(checked: boolean | "indeterminate") =>
                    handlePlatformToggle(platformId, Boolean(checked))
                  }
                />
              </div>
            ))}
            <p className="text-muted-foreground text-xs">
              At least one platform must stay enabled.
            </p>
            <p className="text-muted-foreground text-xs">
              Choose the sentiment lookback window directly from the dashboard header.
            </p>
            <p className="text-muted-foreground text-xs">
              {formatDashboardRequestEstimate(preferences.enabledPlatforms.length)}
            </p>
          </CardContent>
        </Card>

        {(isSaving || isUpdating) && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Icons.Spinner className="h-4 w-4 animate-spin" />
            Saving settings...
          </div>
        )}
      </PageContent>
    </Page>
  );
}

function getStatusSurfaceClasses(status: "active" | "monthly_limit_exceeded" | undefined) {
  if (status === "monthly_limit_exceeded") {
    return "border-destructive/10 bg-destructive/10";
  }

  if (status === "active") {
    return "border-success/10 bg-success/10";
  }

  return "border-border/70 bg-card";
}

function getStatusDividerClasses(status: "active" | "monthly_limit_exceeded") {
  if (status === "monthly_limit_exceeded") {
    return "border-destructive/10";
  }

  return "border-success/10";
}
