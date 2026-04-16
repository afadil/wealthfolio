import { zodResolver } from "@hookform/resolvers/zod";
import type { TFunction } from "i18next";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { FontSelector } from "@/components/font-selector";
import { ThemeSelector } from "@/components/theme-selector";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@wealthfolio/ui/components/ui/form";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import { usePlatform } from "@/hooks/use-platform";
import { useSettingsContext } from "@/lib/settings-provider";
import { useTranslation } from "react-i18next";

function createAppearanceFormSchema(t: TFunction) {
  return z.object({
    theme: z.enum(["light", "dark", "system"], {
      required_error: t("settings.appearance.validation.theme_required"),
    }),
    font: z.enum(["font-mono", "font-sans", "font-serif"], {
      invalid_type_error: t("settings.appearance.validation.font_invalid"),
      required_error: t("settings.appearance.validation.font_required"),
    }),
    menuBarVisible: z.boolean(),
  });
}

type AppearanceFormValues = z.infer<ReturnType<typeof createAppearanceFormSchema>>;

export function AppearanceForm() {
  const { t } = useTranslation("common");
  const appearanceFormSchema = useMemo(() => createAppearanceFormSchema(t), [t]);
  const { settings, updateSettings } = useSettingsContext();
  const { isMobile } = usePlatform();
  const defaultValues: Partial<AppearanceFormValues> = {
    theme: settings?.theme as AppearanceFormValues["theme"],
    font: settings?.font as AppearanceFormValues["font"],
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

  return (
    <Form {...form}>
      <div className="max-w-4xl space-y-6">
        <FormField
          control={form.control}
          name="font"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <div className="space-y-1">
                <FormLabel className="text-base font-medium">{t("settings.appearance.font_label")}</FormLabel>
                <FormDescription className="text-sm">{t("settings.appearance.font_hint")}</FormDescription>
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
                <FormLabel className="text-base font-medium">{t("settings.appearance.theme_label")}</FormLabel>
                <FormDescription className="text-sm">{t("settings.appearance.theme_hint")}</FormDescription>
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

        {!isMobile && (
          <FormField
            control={form.control}
            name="menuBarVisible"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel>{t("settings.appearance.menu_bar_label")}</FormLabel>
                  <FormDescription>{t("settings.appearance.menu_bar_hint")}</FormDescription>
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
        )}
      </div>
    </Form>
  );
}
