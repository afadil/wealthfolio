import { Separator } from '@/components/ui/separator';
import { BaseCurrencySettings } from './currency-settings';
import { SettingsHeader } from '../header';
import { ExchangeRatesSettings } from './exchange-rates/exchange-rates-settings';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'zh-CN', label: '简体中文' },
];

export default function GeneralSettingsPage() {
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState(i18n.language);

  const handleChangeLang = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value;
    i18n.changeLanguage(newLang);
    setLang(newLang);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SettingsHeader
          heading={t('settings.general.heading', 'General')}
          text={t('settings.general.description', 'Manage the general application settings and preferences.')}
        />
        <div>
          <label htmlFor="lang-select" className="mr-2 text-sm font-medium">
            {t('settings.general.language', 'Language')}
          </label>
          <select
            id="lang-select"
            value={lang}
            onChange={handleChangeLang}
            className="rounded-md border px-2 py-1 text-sm"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Separator />
      <BaseCurrencySettings />
      <div className="pt-6">
        <ExchangeRatesSettings />
      </div>
    </div>
  );
}
