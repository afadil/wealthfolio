import { Separator } from '@/components/ui/separator';
import { BaseCurrencySettings } from './currency-settings';
import { SettingsHeader } from '../header';
import { ExchangeRatesSettings } from './exchange-rates/exchange-rates-settings';
import { AutoUpdateSettings } from './auto-update-settings';

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
