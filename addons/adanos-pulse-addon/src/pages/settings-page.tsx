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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import React from "react";
import { useAdanosApiKey } from "../hooks/use-adanos-api-key";
import { useAdanosPreferences } from "../hooks/use-adanos-preferences";
import type { AdanosPlatformId } from "../types";
import { PLATFORM_ORDER } from "../lib/utils";

interface SettingsPageProps {
  ctx: AddonContext;
}

const PLATFORM_LABELS: Record<AdanosPlatformId, string> = {
  reddit: "Reddit",
  x: "X/Twitter",
  news: "News",
  polymarket: "Polymarket",
};

export default function SettingsPage({ ctx }: SettingsPageProps) {
  const { apiKey, saveApiKey, isLoading: apiKeyLoading, isSaving } = useAdanosApiKey(ctx);
  const { preferences, updatePreferences, isUpdating } = useAdanosPreferences(ctx);
  const [draftApiKey, setDraftApiKey] = React.useState("");

  React.useEffect(() => {
    setDraftApiKey(apiKey ?? "");
  }, [apiKey]);

  const handleSaveApiKey = async () => {
    await saveApiKey(draftApiKey || null);
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
        heading="Adanos Pulse Settings"
        text="Configure secure API access and choose how the addon scores your portfolio."
        actions={
          <Button
            variant="outline"
            onClick={() => ctx.api.navigation.navigate("/addons/adanos-pulse")}
          >
            <Icons.ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
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
              <Button variant="outline" onClick={() => void saveApiKey(null)} disabled={isSaving}>
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

        <Card>
          <CardHeader>
            <CardTitle>Lookback window</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="lookback-days">Days</Label>
              <Select
                value={String(preferences.days)}
                onValueChange={(value: string) =>
                  updatePreferences({ days: Number(value) as 1 | 7 | 14 | 30 })
                }
              >
                <SelectTrigger id="lookback-days">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                The addon defaults to free-tier friendly windows. Paid Adanos plans support longer
                history.
              </p>
            </div>
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
