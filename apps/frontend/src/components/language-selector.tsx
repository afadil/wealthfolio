import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui/components/ui/select";
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import { useTranslation } from "react-i18next";

interface LanguageSelectorProps {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
}

export function LanguageSelector({ value, onChange, className }: LanguageSelectorProps) {
  const { t } = useTranslation();
  return (
    <Select
      value={value}
      items={SUPPORTED_LOCALES.map(({ code, label }) => ({ value: code, label }))}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <SelectTrigger
        data-testid="language-select"
        aria-label={t("settings:languageSettings.title")}
        className={className}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LOCALES.map((locale) => (
          <SelectItem
            data-testid={`language-option-${locale.code}`}
            key={locale.code}
            value={locale.code}
          >
            {locale.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
