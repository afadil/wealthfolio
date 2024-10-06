import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { cn } from '@/lib/utils';
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
import { Icons } from '@/components/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { worldCurrencies } from '@/lib/currencies';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useSettingsContext } from '@/lib/settings-provider';
import { ScrollArea } from '@/components/ui/scroll-area';

const appearanceFormSchema = z.object({
  baseCurrency: z.string({ required_error: 'Please select a base currency.' }),
});

type GeneralSettingFormValues = z.infer<typeof appearanceFormSchema>;

export function GeneralSettingForm() {
  const { settings, updateSettings } = useSettingsContext();
  const defaultValues: Partial<GeneralSettingFormValues> = {
    baseCurrency: settings?.baseCurrency || 'USD',
  };
  const form = useForm<GeneralSettingFormValues>({
    resolver: zodResolver(appearanceFormSchema),
    defaultValues,
  });

  function onSubmit(data: GeneralSettingFormValues) {
    const updatedSettings = {
      theme: settings?.theme || 'light',
      font: settings?.font || 'font-mono',
      ...data,
    };
    updateSettings(updatedSettings);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="baseCurrency"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Currency</FormLabel>
              <Popover modal={true}>
                <PopoverTrigger asChild>
                  <FormControl className="w-[300px]">
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn('justify-between', !field.value && 'text-muted-foreground')}
                    >
                      {field.value
                        ? worldCurrencies.find((currency) => currency.value === field.value)?.label
                        : 'Select account currency'}
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
                        <ScrollArea className="max-h-96 overflow-y-auto">
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
                                  currency.value === field.value ? 'opacity-100' : 'opacity-0',
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
              <FormDescription>Select your base currency.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit">Save</Button>
      </form>
    </Form>
  );
}
