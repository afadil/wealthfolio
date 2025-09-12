import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { FontSelector } from "@/components/font-selector";
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
  font: z.enum(["font-mono", "font-sans", "font-serif"], {
    invalid_type_error: "Select a font",
    required_error: "Please select a font.",
  }),
  menuBarVisible: z.boolean(),
});

type AppearanceFormValues = z.infer<typeof appearanceFormSchema>;

export function AppearanceForm() {
  const { settings, updateSettings } = useSettingsContext();
  const defaultValues: Partial<AppearanceFormValues> = {
    theme: settings?.theme as AppearanceFormValues["theme"],
    font: settings?.font as AppearanceFormValues["font"],
    menuBarVisible: settings?.menuBarVisible ?? true,
  };
  const form = useForm<AppearanceFormValues>({
    resolver: zodResolver(appearanceFormSchema),
    defaultValues,
  });

  function onSubmit(data: AppearanceFormValues) {
    updateSettings({
      theme: data.theme,
      font: data.font,
      menuBarVisible: data.menuBarVisible,
    }).catch((error) => {
      console.error("Failed to update appearance settings:", error);
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          form.handleSubmit(onSubmit)(e);
        }}
        className="max-w-4xl space-y-6"
      >
        <FormField
          control={form.control}
          name="font"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <div className="space-y-1">
                <FormLabel className="text-base font-medium">Font Family</FormLabel>
                <FormDescription className="text-sm">
                  Choose the font family used throughout the interface.
                </FormDescription>
              </div>
              <FormControl>
                <FontSelector value={field.value} onChange={field.onChange} />
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
                <FormLabel className="text-base font-medium">Theme</FormLabel>
                <FormDescription className="text-sm">
                  Select your preferred theme for the application.
                </FormDescription>
              </div>
              <FormMessage />
              <FormControl>
                <ThemeSelector value={field.value} onChange={field.onChange} className="pt-2" />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="menuBarVisible"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <FormLabel>Show menu bar</FormLabel>
                <FormDescription>
                  Toggle to display the application menu bar (Windows only).
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full sm:w-auto">
          Update preferences
        </Button>
      </form>
    </Form>
  );
}
