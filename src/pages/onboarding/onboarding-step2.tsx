import { Button } from '@/components/ui/button';
import { Icons } from '@/components/ui/icons';
import React, { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { motion } from 'framer-motion';
import { useSettingsContext } from '@/lib/settings-provider';
import { cn } from '@/lib/utils';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { CurrencyInput } from '@wealthfolio/ui';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';

// Simplified schema for onboarding - removed 'system' theme option for direct selection
const onboardingSettingsSchema = z.object({
  baseCurrency: z.string({ required_error: 'Please select a base currency.' }),
  theme: z.enum(['light', 'dark'], { required_error: 'Please select a theme.' }),
});

// Helper for locale detection (simple example)
function detectDefaultCurrency(): string {
  if (typeof navigator === 'undefined') return 'USD'; // Default SSR/Node
  const lang = navigator.language || navigator.languages[0];
  if (lang.startsWith('en-GB')) return 'GBP';
  if (lang.startsWith('en-US')) return 'USD';
  if (lang.startsWith('en-CA')) return 'CAD';
  if (lang.startsWith('en-AU')) return 'AUD';
  if (lang.startsWith('de')) return 'EUR'; // Simplified German -> EUR
  if (lang.startsWith('fr')) return 'EUR'; // Simplified French -> EUR
  if (lang.startsWith('es')) return 'EUR'; // Simplified Spanish -> EUR
  if (lang.startsWith('it')) return 'EUR'; // Simplified Italian -> EUR
  if (lang.startsWith('ja')) return 'JPY'; // Simplified Japanese -> JPY
  if (lang.startsWith('zh')) return 'CNY'; // Simplified Chinese -> CNY
  if (lang.startsWith('ko')) return 'KRW'; // Simplified Korean -> KRW
  if (lang.startsWith('ru')) return 'RUB'; // Simplified Russian -> RUB
  if (lang.startsWith('nl')) return 'EUR'; // Simplified Dutch -> EUR
  if (lang.startsWith('pl')) return 'EUR'; // Simplified Polish -> EUR
  if (lang.startsWith('pt')) return 'EUR'; // Simplified Portuguese -> EUR
  if (lang.startsWith('sv')) return 'EUR'; // Simplified Swedish -> EUR
  if (lang.startsWith('tr')) return 'EUR'; // Simplified Turkish -> EUR
  if (lang.startsWith('ar')) return 'USD'; // Simplified Arabic -> USD
  if (lang.startsWith('hi')) return 'INR'; // Simplified Hindi -> INR
  return 'USD'; // Fallback
}

// Helper for OS theme detection
function detectDefaultTheme(): 'light' | 'dark' {
  if (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

type OnboardingSettingsValues = z.infer<typeof onboardingSettingsSchema>;

interface OnboardingStep2Props {
  onNext: () => void;
  onBack: () => void;
}

export const OnboardingStep2: React.FC<OnboardingStep2Props> = ({ onNext, onBack }) => {
  const { settings, updateSettings } = useSettingsContext();
  const [initialValuesSet, setInitialValuesSet] = useState(false);

  // Use detected values for initial form state
  const form = useForm<OnboardingSettingsValues>({
    resolver: zodResolver(onboardingSettingsSchema),
  });

  // Set defaults based on detection after mount
  useEffect(() => {
    if (!initialValuesSet) {
      form.reset({
        baseCurrency: settings?.baseCurrency || detectDefaultCurrency(),
        theme: (settings?.theme as OnboardingSettingsValues['theme']) || detectDefaultTheme(),
      });
      setInitialValuesSet(true);
    }
  }, [form, settings, initialValuesSet]);

  async function onSubmit(data: OnboardingSettingsValues) {
    try {
      await updateSettings({
        baseCurrency: data.baseCurrency,
        theme: data.theme,
        onboardingCompleted: true,
      });
      onNext();
    } catch (error) {
      console.error('Failed to save onboarding settings:', error);
    }
  }

  return (
    <div className="space-y-2 px-4 md:px-12 lg:px-16 xl:px-20">
      <h1 className="mb-2 text-2xl font-bold md:text-3xl">Settings</h1>
      <p className="pb-4 text-sm text-muted-foreground md:pb-6 md:text-base">
        Just a couple preferences to get you started
      </p>
      <Card>
        <CardContent className="p-4 md:p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 md:space-y-12">
              {/* --- Base Currency Field --- */}
              <FormField
                control={form.control}
                name="baseCurrency"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Setup your base currency</FormLabel>
                    <FormControl className="mt-2 w-full max-w-[300px]">
                      <CurrencyInput
                        value={field.value}
                        onChange={field.onChange}
                        autoFocus
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* --- Theme Field --- */}
              <FormField
                control={form.control}
                name="theme"
                render={({ field }) => (
                  <FormItem className="space-y-1" id="theme-selection-label">
                    <FormLabel>Select your preferred theme</FormLabel>
                    <FormMessage />
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      aria-labelledby="theme-selection-label"
                      className="grid max-w-md grid-cols-1 gap-4 pt-2 sm:grid-cols-2 sm:gap-8"
                    >
                      {[
                        { value: 'light', labelText: 'Light' },
                        { value: 'dark', labelText: 'Dark' },
                      ].map((themeOption) => (
                        <FormItem key={themeOption.value}>
                          <FormLabel
                            className={cn(
                              'block cursor-pointer rounded-md border-2 p-1',
                              'min-h-[44px] min-w-[44px]',
                              field.value === themeOption.value ? 'border-primary' : 'border-muted',
                              'focus-within:border-accent focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 hover:border-accent',
                              'motion-safe:transition-all motion-safe:duration-150 motion-safe:ease-out',
                              field.value === themeOption.value && 'motion-safe:scale-105',
                            )}
                          >
                            <FormControl>
                              <RadioGroupItem value={themeOption.value} className="sr-only" />
                            </FormControl>
                            <div
                              className={cn(
                                'items-center rounded-md p-1',
                                themeOption.value === 'dark' && 'dark bg-popover',
                              )}
                            >
                              <div
                                className={cn(
                                  'space-y-2 rounded-sm p-2',
                                  themeOption.value === 'light'
                                    ? 'bg-[hsl(51_59%_95%)]'
                                    : 'dark bg-[hsl(var(--flexoki-bg))]',
                                )}
                              >
                                <div
                                  className={cn(
                                    'space-y-2 rounded-md p-2 shadow-sm',
                                    themeOption.value === 'light'
                                      ? 'bg-[hsl(48_100%_97%)]'
                                      : 'bg-[hsl(var(--flexoki-bg-2))]',
                                  )}
                                >
                                  <div
                                    className={cn(
                                      'h-2 w-[80px] rounded-lg',
                                      themeOption.value === 'light'
                                        ? 'bg-[hsl(50_14%_83%)]'
                                        : 'bg-[hsl(var(--flexoki-ui-2))]',
                                    )}
                                  />
                                  <div
                                    className={cn(
                                      'h-2 w-[100px] rounded-lg',
                                      themeOption.value === 'light'
                                        ? 'bg-[hsl(50_14%_83%)]'
                                        : 'bg-[hsl(var(--flexoki-ui-2))]',
                                    )}
                                  />
                                </div>
                                <div
                                  className={cn(
                                    'flex items-center space-x-2 rounded-md p-2 shadow-sm',
                                    themeOption.value === 'light'
                                      ? 'bg-[hsl(48_100%_97%)]'
                                      : 'bg-[hsl(var(--flexoki-bg-2))]',
                                  )}
                                >
                                  <div
                                    className={cn(
                                      'h-4 w-4 rounded-full',
                                      themeOption.value === 'light'
                                        ? 'bg-[hsl(50_14%_83%)]'
                                        : 'bg-[hsl(var(--flexoki-ui-2))]',
                                    )}
                                  />
                                  <div
                                    className={cn(
                                      'h-2 w-[100px] rounded-lg',
                                      themeOption.value === 'light'
                                        ? 'bg-[hsl(50_14%_83%)]'
                                        : 'bg-[hsl(var(--flexoki-ui-2))]',
                                    )}
                                  />
                                </div>
                                <div
                                  className={cn(
                                    'flex items-center space-x-2 rounded-md p-2 shadow-sm',
                                    themeOption.value === 'light'
                                      ? 'bg-[hsl(48_100%_97%)]'
                                      : 'bg-(--flexoki-bg-2)',
                                  )}
                                >
                                  <div
                                    className={cn(
                                      'h-4 w-4 rounded-full',
                                      themeOption.value === 'light'
                                        ? 'bg-[hsl(50_14%_83%)]'
                                        : 'bg-(--flexoki-ui-2)',
                                    )}
                                  />
                                  <div
                                    className={cn(
                                      'h-2 w-[100px] rounded-lg',
                                      themeOption.value === 'light'
                                        ? 'bg-[hsl(50_14%_83%)]'
                                        : 'bg-(--flexoki-ui-2)',
                                    )}
                                  />
                                </div>
                              </div>
                            </div>
                            <span className="block w-full p-2 text-center font-normal">
                              {themeOption.labelText}
                            </span>
                          </FormLabel>
                        </FormItem>
                      ))}
                    </RadioGroup>
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={onBack} type="button" className="w-full sm:w-auto">
          <Icons.ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center space-x-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: form.formState.isValid ? 1 : 0 }}
            transition={{ duration: 0.3 }}
            className="w-full sm:w-auto"
          >
            <Button
              onClick={form.handleSubmit(onSubmit)}
              type="button"
              disabled={!form.formState.isValid}
              className="w-full sm:w-auto"
            >
              Next: Final Steps
              <Icons.ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
