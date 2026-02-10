import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { usePlatform } from "@/hooks/use-platform";
import { SettingsHeader } from "../settings-header";
import { AutoUpdateSettings } from "./auto-update-settings";
import { BaseCurrencySettings } from "./currency-settings";
import { ExchangeRatesSettings } from "./exchange-rates/exchange-rates-settings";

export default function GeneralSettingsPage() {
  const { isMobile } = usePlatform();

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
      {!isMobile && (
        <div className="pt-6">
          <AutoUpdateSettings />
        </div>
      )}
    </div>
  );
}
