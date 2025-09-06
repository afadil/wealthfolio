import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { cn } from '@/lib/utils';
import { useSettingsContext } from '@/lib/settings-provider';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Icons } from '@/components/ui/icons';
import { Switch } from '@/components/ui/switch';

const appearanceFormSchema = z.object({
  theme: z.enum(['light', 'dark', 'system'], {
    required_error: 'Please select a theme.',
  }),
  font: z.enum(['font-mono', 'font-sans', 'font-serif'], {
    invalid_type_error: 'Select a font',
    required_error: 'Please select a font.',
  }),
  menuBarVisible: z.boolean().default(true),
});

type AppearanceFormValues = z.infer<typeof appearanceFormSchema>;

export function AppearanceForm() {
  const { settings, updateSettings } = useSettingsContext();
  const defaultValues: Partial<AppearanceFormValues> = {
    theme: settings?.theme as AppearanceFormValues['theme'],
    font: settings?.font as AppearanceFormValues['font'],
    menuBarVisible: settings?.menuBarVisible ?? true,
  };
  const form = useForm<AppearanceFormValues>({
    resolver: zodResolver(appearanceFormSchema),
    defaultValues,
  });

  async function onSubmit(data: AppearanceFormValues) {
    try {
      await updateSettings({
        theme: data.theme,
        font: data.font,
        menuBarVisible: data.menuBarVisible,
      });
    } catch (error) {
      console.error('Failed to update appearance settings:', error);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="font"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Font</FormLabel>
              <div className="relative w-max">
                <FormControl>
                  <select
                    className={cn(
                      buttonVariants({ variant: 'outline' }),
                      'w-[200px] appearance-none bg-transparent font-normal',
                    )}
                    {...field}
                  >
                    <option value="font-mono">Mono</option>
                    <option value="font-sans">Sans-Serif</option>
                    <option value="font-serif">Serif</option>
                  </select>
                </FormControl>
                <Icons.ChevronDown className="absolute right-3 top-2.5 h-4 w-4 opacity-50" />
              </div>
              <FormDescription>Set your preferred font family to use.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="theme"
          render={({ field }) => (
            <FormItem className="space-y-1">
              <FormLabel>Theme</FormLabel>
              <FormDescription>Select your preferred theme for the application.</FormDescription>
              <FormMessage />
              <RadioGroup
                onValueChange={field.onChange}
                defaultValue={field.value}
                className="grid max-w-md grid-cols-2 gap-8 pt-2"
              >
                <FormItem>
                  <FormLabel className="[&:has([data-state=checked])>div]:border-primary cursor-pointer">
                    <FormControl>
                      <RadioGroupItem value="light" className="sr-only" />
                    </FormControl>
                    <div className="items-center rounded-md border-2 border-muted p-1 hover:border-accent">
                      <div className="space-y-2 rounded-sm bg-[hsl(51_59%_95%)] p-2">
                        <div className="space-y-2 rounded-md bg-[hsl(48_100%_97%)] p-2 shadow-sm">
                          <div className="h-2 w-[80px] rounded-lg bg-[hsl(50_14%_83%)]" />
                          <div className="h-2 w-[100px] rounded-lg bg-[hsl(50_14%_83%)]" />
                        </div>
                        <div className="flex items-center space-x-2 rounded-md bg-[hsl(48_100%_97%)] p-2 shadow-sm">
                          <div className="h-4 w-4 rounded-full bg-[hsl(50_14%_83%)]" />
                          <div className="h-2 w-[100px] rounded-lg bg-[hsl(50_14%_83%)]" />
                        </div>
                        <div className="flex items-center space-x-2 rounded-md bg-[hsl(48_100%_97%)] p-2 shadow-sm">
                          <div className="h-4 w-4 rounded-full bg-[hsl(50_14%_83%)]" />
                          <div className="h-2 w-[100px] rounded-lg bg-[hsl(50_14%_83%)]" />
                        </div>
                      </div>
                    </div>
                    <span className="block w-full p-2 text-center font-normal">Light</span>
                  </FormLabel>
                </FormItem>
                <FormItem>
                  <FormLabel className="[&:has([data-state=checked])>div]:border-primary cursor-pointer">
                    <FormControl>
                      <RadioGroupItem value="dark" className="sr-only" />
                    </FormControl>
                    <div className="dark items-center rounded-md border-2 border-muted bg-popover p-1 hover:bg-accent hover:text-accent-foreground">
                      <div className="space-y-2 rounded-sm bg-[var(--flexoki-bg)] p-2">
                        <div className="space-y-2 rounded-md bg-[var(--flexoki-bg-2)] p-2 shadow-sm">
                          <div className="h-2 w-[80px] rounded-lg bg-[var(--flexoki-ui-2)]" />
                          <div className="h-2 w-[100px] rounded-lg bg-[var(--flexoki-ui-2)]" />
                        </div>
                        <div className="flex items-center space-x-2 rounded-md bg-[var(--flexoki-bg-2)] p-2 shadow-sm">
                          <div className="h-4 w-4 rounded-full bg-[var(--flexoki-ui-2)]" />
                          <div className="h-2 w-[100px] rounded-lg bg-[var(--flexoki-ui-2)]" />
                        </div>
                        <div className="flex items-center space-x-2 rounded-md bg-[var(--flexoki-bg-2)] p-2 shadow-sm">
                          <div className="h-4 w-4 rounded-full bg-[var(--flexoki-ui-2)]" />
                          <div className="h-2 w-[100px] rounded-lg bg-[var(--flexoki-ui-2)]" />
                        </div>
                      </div>
                    </div>
                    <span className="block w-full p-2 text-center font-normal">Dark</span>
                  </FormLabel>
                </FormItem>
              </RadioGroup>
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

        <Button type="submit">Update preferences</Button>
      </form>
    </Form>
  );
}
