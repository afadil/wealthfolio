import { Separator } from '@/components/ui/separator';
import { BaseCurrencySettings } from './currency-settings';
import { SettingsHeader } from '../header';
import { ExchangeRatesSettings } from './exchange-rates/exchange-rates-settings';

export default function GeneralSettingsPage() {
  return (
    <div className="space-y-6">
      <SettingsHeader
        heading='general.title'
        text='general.description'
      />
      <Separator />
      <BaseCurrencySettings />
      <div className="pt-6">
        <ExchangeRatesSettings />
      </div>
    </div>
  );
}
