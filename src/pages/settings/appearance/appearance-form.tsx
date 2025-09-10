import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { useSettingsContext } from '@/lib/settings-provider';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FontSelector } from '@/components/font-selector';
import { ThemeSelector } from '@/components/theme-selector';

const appearanceFormSchema = z.object({
  theme: z.enum(['light', 'dark', 'system'], {
    required_error: 'Please select a theme.',
  }),
  font: z.enum(['font-mono', 'font-sans', 'font-serif'], {
    invalid_type_error: 'Select a font',
    required_error: 'Please select a font.',
  }),
});

type AppearanceFormValues = z.infer<typeof appearanceFormSchema>;

export function AppearanceForm() {
  const { settings, updateSettings } = useSettingsContext();
  const defaultValues: Partial<AppearanceFormValues> = {
    theme: settings?.theme as AppearanceFormValues['theme'],
    font: settings?.font as AppearanceFormValues['font'],
  };
  const form = useForm<AppearanceFormValues>({
    resolver: zodResolver(appearanceFormSchema),
    defaultValues,
  });

  async function onSubmit(data: AppearanceFormValues) {
    try {
      await updateSettings({ theme: data.theme, font: data.font });
    } catch (error) {
      console.error('Failed to update appearance settings:', error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-4xl">
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

        <Button type="submit" className="w-full sm:w-auto">
          Update preferences
        </Button>
      </form>
    </Form>
  );
}
