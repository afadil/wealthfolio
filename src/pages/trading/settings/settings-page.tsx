import { useSwingPreferences } from "../hooks/use-swing-preferences";
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
} from "@wealthvn/ui";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

export default function SettingsPage() {
  const { t } = useTranslation("trading");
  const navigate = useNavigate();
  const { preferences, updatePreferences, isUpdating } = useSwingPreferences();

  const handleLotMethodChange = (method: "FIFO" | "LIFO" | "AVERAGE") => {
    updatePreferences({ lotMatchingMethod: method });
  };

  const handleDefaultDateRangeChange = (range: "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL") => {
    updatePreferences({ defaultDateRange: range });
  };

  const handleIncludeFeesChange = (checked: boolean) => {
    updatePreferences({ includeFees: checked });
  };

  const handleIncludeDividendsChange = (checked: boolean) => {
    updatePreferences({ includeDividends: checked });
  };

  return (
    <Page>
      <PageHeader
        heading={t("settings.heading")}
        text={t("settings.description")}
        actions={
          <Button variant="outline" onClick={() => navigate("/trading")}>
            <Icons.ArrowLeft className="mr-2 h-4 w-4" />
            {t("settings.backToDashboard")}
          </Button>
        }
      />

      <PageContent className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.tradeMatching.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="lot-method">{t("settings.tradeMatching.lotMethod")}</Label>
              <Select value={preferences.lotMatchingMethod} onValueChange={handleLotMethodChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIFO">{t("settings.tradeMatching.fifo")}</SelectItem>
                  <SelectItem value="LIFO">{t("settings.tradeMatching.lifo")}</SelectItem>
                  <SelectItem value="AVERAGE">{t("settings.tradeMatching.average")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground mt-1 text-xs">
                {t("settings.tradeMatching.description")}
                <br />
                {t("settings.tradeMatching.fifoDesc")}
                <br />
                {t("settings.tradeMatching.lifoDesc")}
                <br />
                {t("settings.tradeMatching.averageDesc")}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.displaySettings.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="default-range">{t("settings.displaySettings.defaultRange")}</Label>
              <Select
                value={preferences.defaultDateRange}
                onValueChange={handleDefaultDateRangeChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1M">{t("settings.displaySettings.1M")}</SelectItem>
                  <SelectItem value="3M">{t("settings.displaySettings.3M")}</SelectItem>
                  <SelectItem value="6M">{t("settings.displaySettings.6M")}</SelectItem>
                  <SelectItem value="YTD">{t("settings.displaySettings.YTD")}</SelectItem>
                  <SelectItem value="1Y">{t("settings.displaySettings.1Y")}</SelectItem>
                  <SelectItem value="ALL">{t("settings.displaySettings.ALL")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground mt-1 text-xs">
                {t("settings.displaySettings.description")}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.calculationSettings.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-fees"
                checked={preferences.includeFees}
                onCheckedChange={handleIncludeFeesChange}
              />
              <Label htmlFor="include-fees">{t("settings.calculationSettings.includeFees")}</Label>
            </div>
            <p className="text-muted-foreground text-xs">
              {t("settings.calculationSettings.feesDescription")}
            </p>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-dividends"
                checked={preferences.includeDividends}
                onCheckedChange={handleIncludeDividendsChange}
              />
              <Label htmlFor="include-dividends">
                {t("settings.calculationSettings.includeDividends")}
              </Label>
            </div>
            <p className="text-muted-foreground text-xs">
              {t("settings.calculationSettings.dividendsDescription")}
            </p>
          </CardContent>
        </Card>

        {isUpdating && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Icons.Spinner className="h-4 w-4 animate-spin" />
            {t("settings.savingSettings")}
          </div>
        )}
      </PageContent>
    </Page>
  );
}
