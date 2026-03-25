import { zodResolver } from "@hookform/resolvers/zod";
import { Dices } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as z from "zod";

import { FontSelector } from "@/components/font-selector";
import { LanguageSelector } from "@/components/language-selector";
import { ThemeColorSelector } from "@/components/theme-color-selector";
import { ThemeSelector } from "@/components/theme-selector";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useSettingsContext } from "@/lib/settings-provider";

const appearanceFormSchema = z.object({
  theme: z.enum(["light", "dark", "system"], {
    required_error: "Please select a theme.",
  }),
  themeColor: z.string().optional(),
  font: z.enum(["font-mono", "font-sans", "font-serif"], {
    invalid_type_error: "Select a font",
    required_error: "Please select a font.",
  }),
  language: z.string({
    required_error: "Please select a language.",
  }),
  menuBarVisible: z.boolean(),
});

type AppearanceFormValues = z.infer<typeof appearanceFormSchema>;

export function AppearanceForm() {
  const { t } = useTranslation("settings");
  const { settings, updateSettings } = useSettingsContext();
  const defaultValues: Partial<AppearanceFormValues> = {
    theme: settings?.theme as AppearanceFormValues["theme"],
    themeColor: settings?.themeColor || "default",
    font: settings?.font as AppearanceFormValues["font"],
    language: settings?.language ?? "en",
    menuBarVisible: settings?.menuBarVisible ?? true,
  };
  const form = useForm<AppearanceFormValues>({
    resolver: zodResolver(appearanceFormSchema),
    defaultValues,
  });

  function handlePartialUpdate(data: Partial<AppearanceFormValues>) {
    updateSettings(data).catch((error) => {
      console.error("Failed to update appearance settings:", error);
    });
  }

  const handleRandomTheme = () => {
    const themes = ["default", "emerald", "midnight", "sunset", "mono", "rose", "neon"];
    const current = form.getValues("themeColor") || "default";

    // Filter out current theme to ensure change
    const availableThemes = themes.filter(t => t !== current);
    const next = availableThemes[Math.floor(Math.random() * availableThemes.length)];

    form.setValue("themeColor", next);
    handlePartialUpdate({ themeColor: next });
  };

  return (
    <Form {...form}>
      <div className="max-w-4xl space-y-6">
        <FormField
          control={form.control}
          name="font"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <div className="space-y-1">
                <FormLabel className="text-base font-medium">
                  {t("appearance.font.label")}
                </FormLabel>
                <FormDescription className="text-sm">
                  {t("appearance.font.description")}
                </FormDescription>
              </div>
              <FormControl>
                <FontSelector
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    handlePartialUpdate({ font: value as AppearanceFormValues["font"] });
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="theme"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <div className="space-y-1">
                <FormLabel className="text-base font-medium">
                  {t("appearance.theme.label")}
                </FormLabel>
                <FormDescription className="text-sm">
                  {t("appearance.theme.description")}
                </FormDescription>
              </div>
              <FormMessage />
              <FormControl>
                <ThemeSelector
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    handlePartialUpdate({ theme: value as AppearanceFormValues["theme"] });
                  }}
                  className="pt-2"
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="themeColor"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <FormLabel className="text-base font-medium">
                    Theme Color
                  </FormLabel>
                  <FormDescription className="text-sm">
                    Select a color theme or roll the dice.
                  </FormDescription>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRandomTheme}
                    className="gap-2"
                >
                    <Dices className="h-4 w-4" />
                    Random Theme
                </Button>
              </div>
              <FormControl>
                <ThemeColorSelector
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    handlePartialUpdate({ themeColor: value });
                  }}
                  className="pt-2"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="language"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <div className="space-y-1">
                <FormLabel className="text-base font-medium">
                  {t("appearance.language.label")}
                </FormLabel>
                <FormDescription className="text-sm">
                  {t("appearance.language.description")}
                </FormDescription>
              </div>
              <FormControl>
                <LanguageSelector
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    handlePartialUpdate({ language: value });
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="menuBarVisible"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <FormLabel>{t("appearance.menuBar.label")}</FormLabel>
                <FormDescription>{t("appearance.menuBar.description")}</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={(value) => {
                    field.onChange(value);
                    handlePartialUpdate({ menuBarVisible: value });
                  }}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    </Form>
  );
}
