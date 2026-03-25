import { Separator } from "@/components/ui/separator";
import { useTranslation } from "react-i18next";
import { SettingsHeader } from "../settings-header";
import { AutoUpdateSettings } from "./auto-update-settings";
import { BaseCurrencySettings } from "./currency-settings";
import { ExchangeRatesSettings } from "./exchange-rates/exchange-rates-settings";

export default function GeneralSettingsPage() {
  const { t } = useTranslation("settings");

  return (
    <div className="space-y-6">
      <SettingsHeader heading={t("general.title")} text={t("general.description")} />
      <Separator />
      <BaseCurrencySettings />
      <div className="pt-6">
        <ExchangeRatesSettings />
      </div>
      <div className="pt-6">
        <AutoUpdateSettings />
      </div>
    </div>
  );
}
