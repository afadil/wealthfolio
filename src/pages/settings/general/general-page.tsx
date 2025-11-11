import { Separator } from "@/components/ui/separator";
import { usePlatform } from "@/hooks/use-platform";
import { useTranslation } from "react-i18next";
import { SettingsHeader } from "../settings-header";
import { AutoUpdateSettings } from "./auto-update-settings";
import { BaseCurrencySettings } from "./currency-settings";
import { ExchangeRatesSettings } from "./exchange-rates/exchange-rates-settings";

export default function GeneralSettingsPage() {
  const { isMobile } = usePlatform();
  const { t } = useTranslation("settings");

  return (
    <div className="space-y-6">
      <SettingsHeader heading={t("general.title")} text={t("general.description")} />
      <Separator />
      <BaseCurrencySettings />
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
