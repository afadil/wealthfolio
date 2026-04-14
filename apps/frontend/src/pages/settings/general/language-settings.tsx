import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import { Label } from "@wealthfolio/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui/components/ui/select";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { UI_LOCALES, isUiLocale, type UiLocale } from "@/i18n/supported-locales";
import { useSettingsContext } from "@/lib/settings-provider";
import {
  NOTES_TRANSLATION_SOURCE_LANGS,
  labelForSourceLang,
} from "@/lib/translation-source-languages";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export function LanguageSettings() {
  const { t, i18n } = useTranslation("common");
  const { settings, updateSettings, isLoading } = useSettingsContext();
  const raw = i18n.resolvedLanguage ?? i18n.language;
  const value: UiLocale = isUiLocale(raw) ? raw : "en";
  const displayLocale = i18n.resolvedLanguage ?? i18n.language ?? "en";

  const savedSourceLang = (settings?.translationSourceLang ?? "en").trim() || "en";
  const sourceLangOptions = useMemo(() => {
    const opts: string[] = [...NOTES_TRANSLATION_SOURCE_LANGS];
    if (savedSourceLang && !opts.includes(savedSourceLang)) {
      opts.push(savedSourceLang);
      opts.sort((a, b) => a.localeCompare(b));
    }
    return opts;
  }, [savedSourceLang]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="text-lg">{t("settings.language.title")}</CardTitle>
          <CardDescription>{t("settings.language.description")}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="ui-language" className="sr-only">
            {t("settings.language.title")}
          </Label>
          <Select
            value={value}
            onValueChange={(next: UiLocale) => {
              void i18n.changeLanguage(next);
            }}
          >
            <SelectTrigger id="ui-language" className="w-[280px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UI_LOCALES.map((code) => (
                <SelectItem key={code} value={code}>
                  {t(`settings.language.option.${code}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-sm font-medium">{t("settings.language.translation_source.title")}</p>
            <p className="text-muted-foreground text-sm">{t("settings.language.translation_source.description")}</p>
          </div>
          {isLoading || !settings ? (
            <Skeleton className="h-10 w-[280px]" />
          ) : (
            <Select
              value={savedSourceLang}
              onValueChange={(code: string) => {
                void updateSettings({ translationSourceLang: code });
              }}
            >
              <Label htmlFor="translation-source-lang" className="sr-only">
                {t("settings.language.translation_source.title")}
              </Label>
              <SelectTrigger id="translation-source-lang" className="w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sourceLangOptions.map((code) => (
                  <SelectItem key={code} value={code}>
                    {labelForSourceLang(code, displayLocale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
