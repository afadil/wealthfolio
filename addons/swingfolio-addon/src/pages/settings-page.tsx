
import {
  ApplicationShell,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Checkbox,
  Label,
  Icons,
} from "@wealthfolio/ui"
import type { AddonContext } from "@wealthfolio/addon-sdk"
import { useSwingPreferences } from "../hooks/use-swing-preferences"

interface SettingsPageProps {
  ctx: AddonContext
}

export default function SettingsPage({ ctx }: SettingsPageProps) {
  const { preferences, updatePreferences, isUpdating } = useSwingPreferences(ctx)

  const handleLotMethodChange = (method: "FIFO" | "LIFO" | "AVERAGE") => {
    updatePreferences({ lotMatchingMethod: method })
  }

  const handleDefaultDateRangeChange = (range: any) => {
    updatePreferences({ defaultDateRange: range })
  }

  const handleIncludeFeesChange = (checked: boolean) => {
    updatePreferences({ includeFees: checked })
  }

  const handleIncludeDividendsChange = (checked: boolean) => {
    updatePreferences({ includeDividends: checked })
  }


  return (
    <ApplicationShell className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Swingfolio Settings</h1>
          <p className="text-muted-foreground">Configure your swing trading analysis preferences</p>
        </div>
        <Button variant="outline" onClick={() => ctx.api.navigation.navigate("/addons/swingfolio")}>
          <Icons.ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* Trade Matching Settings */}
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
              <p className="text-xs text-muted-foreground mt-1">
                Method used to match buy and sell orders for P/L calculation:
                <br />
                • FIFO: Matches oldest purchases first
                <br />
                • LIFO: Matches newest purchases first  
                <br />
                • Average Cost: Uses weighted average price of all purchases
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Display Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Display Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="default-range">Default Date Range</Label>
              <Select value={preferences.defaultDateRange} onValueChange={handleDefaultDateRangeChange}>
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
              <p className="text-xs text-muted-foreground mt-1">Default time period when opening the dashboard</p>
            </div>
          </CardContent>
        </Card>

        {/* Calculation Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Calculation Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox id="include-fees" checked={preferences.includeFees} onCheckedChange={handleIncludeFeesChange} />
              <Label htmlFor="include-fees">Include fees in P/L calculations</Label>
            </div>
            <p className="text-xs text-muted-foreground">
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
            <p className="text-xs text-muted-foreground">
              When enabled, dividend payments will be included in total returns
            </p>
          </CardContent>
        </Card>
        {/* Save Status */}
        {isUpdating && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icons.Spinner className="h-4 w-4 animate-spin" />
            Saving settings...
          </div>
        )}
      </div>
    </ApplicationShell>
  )
}
