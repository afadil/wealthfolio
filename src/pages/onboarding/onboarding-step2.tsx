import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { worldCurrencies } from '@/lib/currencies';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';

// Simplified schema for onboarding - removed 'system' theme option for direct selection
const onboardingSettingsSchema = z.object({
  baseCurrency: z.string({ required_error: 'Please select a base currency.' }),
  theme: z.enum(['light', 'dark'], { required_error: 'Please select a theme.' }),
});

// Helper for locale detection (simple example)
function detectDefaultCurrency(): string {
  console.log('Detecting default currency...');
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
    console.log('onSubmit', data);
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
    <div className="space-y-2 px-12 md:px-16 lg:px-20">
      <h1 className="mb-2 text-3xl font-bold">Settings</h1>
      <p className="pb-6 text-base text-muted-foreground">
        Just a couple preferences to get you started
      </p>
      <Card>
        <CardContent className="p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-12">
              {/* --- Base Currency Field --- */}
              <FormField
                control={form.control}
                name="baseCurrency"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Setup your base currency</FormLabel>
                    <Popover modal={true}>
                      <PopoverTrigger asChild>
                        <FormControl className="mt-2 w-[300px]">
                          <Button
                            variant="outline"
                            role="combobox"
                            autoFocus
                            className={cn(
                              'justify-between',
                              !field.value && 'text-muted-foreground',
                            )}
                          >
                            {field.value
                              ? worldCurrencies.find((currency) => currency.value === field.value)
                                  ?.label
                              : 'Select currency'}
                            <Icons.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0">
                        <Command>
                          <CommandInput placeholder="Search currency..." />
                          <CommandList>
                            <CommandEmpty>No currency found.</CommandEmpty>
                            <CommandGroup>
                              <ScrollArea className="max-h-72 overflow-y-auto">
                                {worldCurrencies.map((currency) => (
                                  <CommandItem
                                    value={currency.label}
                                    key={currency.value}
                                    onSelect={() => {
                                      form.setValue(field.name, currency.value);
                                    }}
                                  >
                                    <Icons.Check
                                      className={cn(
                                        'mr-2 h-4 w-4',
                                        currency.value === field.value
                                          ? 'opacity-100'
                                          : 'opacity-0',
                                      )}
                                    />
                                    {currency.label}
                                  </CommandItem>
                                ))}
                              </ScrollArea>
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
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
                      className="grid max-w-md grid-cols-2 gap-8 pt-2"
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
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} type="button">
          <Icons.ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center space-x-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: form.formState.isValid ? 1 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <Button
              onClick={form.handleSubmit(onSubmit)}
              type="button"
              disabled={!form.formState.isValid}
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
