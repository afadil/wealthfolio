import { useTranslation } from 'react-i18next';
import { useSettingsContext } from '@/lib/settings-provider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function LanguageSettings() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettingsContext();

  const languages = [
    { value: 'en', label: 'English' },
    { value: 'zh-CN', label: '简体中文' },
  ];

  const handleLanguageChange = (value: string) => {
    if (settings) {
      updateSettings({ ...settings, language: value });
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>{t('settings.general.language')}</Label>
        <p className="text-sm text-muted-foreground">
          {t('settings.general.language_description')}
        </p>
      </div>
      <Select value={settings?.language} onValueChange={handleLanguageChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder={t('settings.general.language_selection')} />
        </SelectTrigger>
        <SelectContent>
          {languages.map((language) => (
            <SelectItem key={language.value} value={language.value}>
              {language.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}