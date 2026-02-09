import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Icons,
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
import { useSwingPreferences } from "../hooks/use-swing-preferences";

interface SettingsPageProps {
  ctx: AddonContext;
}

export default function SettingsPage({ ctx }: SettingsPageProps) {
  const { preferences, updatePreferences, isUpdating } = useSwingPreferences(ctx);

  const handleLotMethodChange = (method: "FIFO" | "LIFO" | "AVERAGE") => {
    updatePreferences({ lotMatchingMethod: method });
  };

  const handleDefaultDateRangeChange = (range: any) => {
    updatePreferences({ defaultDateRange: range });
  };

  const handleIncludeFeesChange = (checked: boolean) => {
    updatePreferences({ includeFees: checked });
  };

  const handleIncludeDividendsChange = (checked: boolean) => {
    updatePreferences({ includeDividends: checked });
  };

  const pageDescription = "Configure your swing trading analysis preferences";

  return (
    <Page>
      <PageHeader
        heading="Swingfolio Settings"
        text={pageDescription}
        actions={
          <Button
            variant="outline"
            onClick={() => ctx.api.navigation.navigate("/addons/swingfolio")}
          >
            <Icons.ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        }
      />

      <PageContent className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Trade Matching</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="lot-method">Lot Matching Method</Label>
              <Select value={preferences.lotMatchingMethod} onValueChange={handleLotMethodChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIFO">FIFO (First In, First Out)</SelectItem>
                  <SelectItem value="LIFO">LIFO (Last In, First Out)</SelectItem>
                  <SelectItem value="AVERAGE">Average Cost</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground mt-1 text-xs">
                Method used to match buy and sell orders for P/L calculation:
                <br />
                • FIFO: Matches oldest purchases first
                <br />
                • LIFO: Matches newest purchases first
                <br />• Average Cost: Uses weighted average price of all purchases
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Display Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="default-range">Default Date Range</Label>
              <Select
                value={preferences.defaultDateRange}
                onValueChange={handleDefaultDateRangeChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1M">1 Month</SelectItem>
                  <SelectItem value="3M">3 Months</SelectItem>
                  <SelectItem value="6M">6 Months</SelectItem>
                  <SelectItem value="YTD">Year to Date</SelectItem>
                  <SelectItem value="1Y">1 Year</SelectItem>
                  <SelectItem value="ALL">All Time</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground mt-1 text-xs">
                Default time period when opening the dashboard
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Calculation Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-fees"
                checked={preferences.includeFees}
                onCheckedChange={handleIncludeFeesChange}
              />
              <Label htmlFor="include-fees">Include fees in P/L calculations</Label>
            </div>
            <p className="text-muted-foreground text-xs">
              When enabled, trading fees will be subtracted from realized P/L
            </p>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-dividends"
                checked={preferences.includeDividends}
                onCheckedChange={handleIncludeDividendsChange}
              />
              <Label htmlFor="include-dividends">Include dividends in performance</Label>
            </div>
            <p className="text-muted-foreground text-xs">
              When enabled, dividend payments will be included in total returns
            </p>
          </CardContent>
        </Card>

        {isUpdating && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Icons.Spinner className="h-4 w-4 animate-spin" />
            Saving settings...
          </div>
        )}
      </PageContent>
    </Page>
  );
}
