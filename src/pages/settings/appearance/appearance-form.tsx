import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useTranslation } from "react-i18next";

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
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { usePlatform } from "@/hooks/use-platform";
import { useSettingsContext } from "@/lib/settings-provider";

const createAppearanceFormSchema = (t: (key: string) => string) =>
  z.object({
    theme: z.enum(["light", "dark", "system"], {
      required_error: t("appearance_theme_required"),
    }),
    font: z.enum(["font-mono", "font-sans", "font-serif"], {
      invalid_type_error: t("appearance_font_error"),
      required_error: t("appearance_font_required"),
    }),
    menuBarVisible: z.boolean(),
  });

type AppearanceFormValues = z.infer<ReturnType<typeof createAppearanceFormSchema>>;

export function AppearanceForm() {
  const { settings, updateSettings } = useSettingsContext();
  const { isMobile } = usePlatform();
  const { t } = useTranslation("settings");
  const defaultValues: Partial<AppearanceFormValues> = {
    theme: settings?.theme as AppearanceFormValues["theme"],
    font: settings?.font as AppearanceFormValues["font"],
    menuBarVisible: settings?.menuBarVisible ?? true,
  };
  const form = useForm<AppearanceFormValues>({
    resolver: zodResolver(createAppearanceFormSchema(t)),
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
                <FormLabel className="text-base font-medium">{t("appearance_font_title")}</FormLabel>
                <FormDescription className="text-sm">
                  {t("appearance_font_description")}
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
                <FormLabel className="text-base font-medium">{t("appearance_theme_title")}</FormLabel>
                <FormDescription className="text-sm">
                  {t("appearance_theme_description")}
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

        {!isMobile && (
          <FormField
            control={form.control}
            name="menuBarVisible"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel>{t("appearance_menu_bar")}</FormLabel>
                  <FormDescription>{t("appearance_menu_bar_description")}</FormDescription>
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
