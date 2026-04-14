import { useSettingsContext } from "@/lib/settings-provider";
import { cn } from "@/lib/utils";
import { Icons } from "@wealthfolio/ui";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useTranslation } from "react-i18next";

export interface OnboardingAppearanceHandle {
  submitForm: () => void;
}

interface OnboardingAppearanceProps {
  onNext: () => void;
  onValidityChange: (isValid: boolean) => void;
}

const fonts = [
  {
    value: "font-mono",
    label: "font_mono",
    description: "font_mono_desc",
  },
  {
    value: "font-sans",
    label: "font_sans",
    description: "font_sans_desc",
  },
  {
    value: "font-serif",
    label: "font_serif",
    description: "font_serif_desc",
  },
];

export const OnboardingAppearance = forwardRef<
  OnboardingAppearanceHandle,
  OnboardingAppearanceProps
>(({ onNext, onValidityChange }, ref) => {
  const { t } = useTranslation("common");
  const { settings, updateSettings } = useSettingsContext();
  const [theme, setTheme] = useState<string>(settings?.theme ?? "system");
  const [font, setFont] = useState<string>(settings?.font ?? "font-mono");

  useEffect(() => {
    // Always valid since we have defaults
    onValidityChange(true);
  }, [onValidityChange]);

  useImperativeHandle(ref, () => ({
    submitForm() {
      updateSettings({ theme, font })
        .then(() => onNext())
        .catch((error) => console.error(t("onboarding.appearance.save_error"), error));
    },
  }));

  // Apply theme/font preview when user selects them
  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    updateSettings({ theme: newTheme }).catch(console.error);
  };

  const handleFontChange = (newFont: string) => {
    setFont(newFont);
    updateSettings({ font: newFont }).catch(console.error);
  };

  return (
    <div className="w-full max-w-2xl space-y-8">
      <div className="text-center">
        <p className="text-muted-foreground">{t("onboarding.appearance.subtitle")}</p>
      </div>

      <Card className="border-none bg-transparent">
        <CardContent className="space-y-10 p-0 sm:p-6">
          {/* Theme Selection */}
          <div>
            <div className="mb-5 flex items-center gap-3">
              <div className="bg-muted rounded-lg p-2">
                <Icons.Palette className="text-muted-foreground h-5 w-5" />
              </div>
              <span className="text-xl font-semibold">{t("onboarding.appearance.theme")}</span>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              {/* Light Theme */}
              <button
                type="button"
                data-testid="theme-light-button"
                onClick={() => handleThemeChange("light")}
                className={cn(
                  "group relative overflow-hidden rounded-xl border-2 transition-all duration-200",
                  theme === "light"
                    ? "border-primary ring-primary/20 ring-2"
                    : "border-border hover:border-primary/50",
                )}
              >
                <div className="overflow-hidden rounded-t-lg">
                  <img
                    src="/themes/theme-light.webp"
                    srcSet="/themes/theme-light.webp 1x, /themes/theme-light@2x.webp 2x"
                    alt={t("onboarding.appearance.light_preview_alt")}
                    className="h-auto w-full object-cover"
                  />
                </div>
                <div
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 sm:py-3",
                    theme === "light" ? "bg-primary/10" : "bg-muted/50",
                  )}
                >
                  <Icons.Sun
                    className={cn(
                      "h-4 w-4",
                      theme === "light" ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span className="text-sm font-medium">{t("onboarding.appearance.light")}</span>
                </div>
                {theme === "light" && (
                  <div className="bg-primary absolute right-2 top-2 rounded-full p-0.5">
                    <Icons.Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>

              {/* Dark Theme */}
              <button
                type="button"
                onClick={() => handleThemeChange("dark")}
                className={cn(
                  "group relative overflow-hidden rounded-xl border-2 transition-all duration-200",
                  theme === "dark"
                    ? "border-primary ring-primary/20 ring-2"
                    : "border-border hover:border-primary/50",
                )}
              >
                <div className="overflow-hidden rounded-t-lg">
                  <img
                    src="/themes/theme-dark.webp"
                    srcSet="/themes/theme-dark.webp 1x, /themes/theme-dark@2x.webp 2x"
                    alt={t("onboarding.appearance.dark_preview_alt")}
                    className="h-auto w-full object-cover"
                  />
                </div>
                <div
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 sm:py-3",
                    theme === "dark" ? "bg-primary/10" : "bg-muted/50",
                  )}
                >
                  <Icons.Moon
                    className={cn(
                      "h-4 w-4",
                      theme === "dark" ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span className="text-sm font-medium">{t("onboarding.appearance.dark")}</span>
                </div>
                {theme === "dark" && (
                  <div className="bg-primary absolute right-2 top-2 rounded-full p-0.5">
                    <Icons.Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>

              {/* System Theme */}
              <button
                type="button"
                onClick={() => handleThemeChange("system")}
                className={cn(
                  "group relative overflow-hidden rounded-xl border-2 transition-all duration-200",
                  theme === "system"
                    ? "border-primary ring-primary/20 ring-2"
                    : "border-border hover:border-primary/50",
                )}
              >
                <div className="overflow-hidden rounded-t-lg">
                  <img
                    src="/themes/theme-system.webp"
                    srcSet="/themes/theme-system.webp 1x, /themes/theme-system@2x.webp 2x"
                    alt={t("onboarding.appearance.system_preview_alt")}
                    className="h-auto w-full object-cover"
                  />
                </div>
                <div
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 sm:py-3",
                    theme === "system" ? "bg-primary/10" : "bg-muted/50",
                  )}
                >
                  <Icons.Monitor
                    className={cn(
                      "h-4 w-4",
                      theme === "system" ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span className="text-sm font-medium">{t("onboarding.appearance.system")}</span>
                </div>
                {theme === "system" && (
                  <div className="bg-primary absolute right-2 top-2 rounded-full p-0.5">
                    <Icons.Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Font Selection */}
          <div>
            <div className="mb-5 flex items-center gap-3">
              <div className="bg-muted rounded-lg p-2">
                <Icons.Type className="text-muted-foreground h-5 w-5" />
              </div>
              <span className="text-xl font-semibold">{t("onboarding.appearance.font")}</span>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              {fonts.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => handleFontChange(f.value)}
                  className={cn(
                    "group relative flex flex-col overflow-hidden rounded-xl border-2 transition-all duration-200",
                    font === f.value
                      ? "border-primary ring-primary/20 ring-2"
                      : "border-border hover:border-primary/50",
                    f.value,
                  )}
                >
                  {/* Font preview area */}
                  <div className="bg-muted/30 flex flex-1 flex-col items-center justify-center px-3 py-3 text-center sm:px-4 sm:py-4">
                    <div className="w-full space-y-2">
                      {/* Font name as hero */}
                      <div className="text-xl font-medium tracking-tight sm:text-2xl">
                        {t(`onboarding.appearance.${f.label}`)}
                      </div>
                      {/* Sample text paragraph */}
                      <div className="text-muted-foreground text-[11px] leading-relaxed sm:text-xs">
                        {t("onboarding.appearance.font_preview_text")}
                      </div>
                      {/* Secondary: numbers sample */}
                      <div className="text-muted-foreground/60 whitespace-nowrap text-[10px] sm:text-xs">
                        12345 · $1,234
                      </div>
                    </div>
                  </div>
                  {/* Label area */}
                  <div
                    className={cn(
                      "w-full px-4 py-2.5 text-center sm:py-3",
                      font === f.value ? "bg-primary/10" : "bg-muted/50",
                    )}
                  >
                    <div className="text-muted-foreground text-xs">
                      {t(`onboarding.appearance.${f.description}`)}
                    </div>
                  </div>
                  {font === f.value && (
                    <div className="bg-primary absolute right-2 top-2 rounded-full p-0.5">
                      <Icons.Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

OnboardingAppearance.displayName = "OnboardingAppearance";
