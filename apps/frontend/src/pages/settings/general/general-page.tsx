import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { usePlatform } from "@/hooks/use-platform";
import { useTranslation } from "react-i18next";
import { SettingsHeader } from "../settings-header";
import { AutoUpdateSettings } from "./auto-update-settings";
import { BaseCurrencySettings } from "./currency-settings";
import { ExchangeRatesSettings } from "./exchange-rates/exchange-rates-settings";
import { LanguageSettings } from "./language-settings";
import { TimezoneSettings } from "./timezone-settings";

export default function GeneralSettingsPage() {
  const { isMobile } = usePlatform();
  const { t } = useTranslation("common");

  return (
    <div className="space-y-6">
      <SettingsHeader heading={t("settings.general.heading")} text={t("settings.general.description")} />
      <Separator />
      <LanguageSettings />
      <BaseCurrencySettings />
      <TimezoneSettings />
      <div className="pt-6">
        <ExchangeRatesSettings />
      </div>
      {!isMobile && (
        <div className="pt-6">
          <AutoUpdateSettings />
        </div>
      )}
    </div>
  );
}
