import { Separator } from "@/components/ui/separator";
import { SettingsHeader } from "../settings-header";
import { AutoUpdateSettings } from "./auto-update-settings";
import { BaseCurrencySettings } from "./currency-settings";
import { ExchangeRatesSettings } from "./exchange-rates/exchange-rates-settings";

export default function GeneralSettingsPage() {
  return (
    <div className="space-y-6">
      <SettingsHeader
        heading="General"
        text="Manage the general application settings and preferences."
      />
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
