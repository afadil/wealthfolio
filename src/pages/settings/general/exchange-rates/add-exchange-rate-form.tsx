import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { worldCurrencies } from '@/lib/currencies';
import { ExchangeRate } from '@/lib/types';
import { Icons } from '@/components/icons';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const exchangeRateSchema = z.object({
  fromCurrency: z.string().min(1, 'From Currency is required'),
  toCurrency: z.string().min(1, 'To Currency is required'),
  rate: z.number().positive('Rate must be a positive number'),
});

type ExchangeRateFormData = z.infer<typeof exchangeRateSchema>;

interface AddExchangeRateFormProps {
  onSubmit: (newRate: Omit<ExchangeRate, 'id'>) => void;
  onCancel: () => void;
}

export function AddExchangeRateForm({ onSubmit, onCancel }: AddExchangeRateFormProps) {
  const form = useForm<ExchangeRateFormData>({
    resolver: zodResolver(exchangeRateSchema),
    defaultValues: {
      fromCurrency: '',
      toCurrency: '',
      rate: 0,
    },
  });

  const handleSubmit = (data: ExchangeRateFormData) => {
    onSubmit({
      ...data,
      source: 'MANUAL',
    });
  };

  const renderCurrencyField = (fieldName: 'fromCurrency' | 'toCurrency') => {
    const [searchValue, setSearchValue] = useState('');

    const handleSearchChange = (value: string) => {
      setSearchValue(value);
      const matchingCurrency = worldCurrencies.find(
        (currency) =>
          currency.label.toLowerCase().includes(value.toLowerCase()) ||
          currency.value.includes(value),
      );
      if (!matchingCurrency && value) {
        form.setValue(fieldName, value.toUpperCase());
      }
    };

    return (
      <FormField
        control={form.control}
        name={fieldName}
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>{fieldName === 'fromCurrency' ? 'From Currency' : 'To Currency'}</FormLabel>
            <Popover modal={true}>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn('justify-between', !field.value && 'text-muted-foreground')}
                  >
                    {field.value
                      ? worldCurrencies.find((currency) => currency.value === field.value)?.label ||
                        field.value
                      : 'Select currency'}
                    <Icons.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput
                    placeholder="Search currency..."
                    onValueChange={handleSearchChange}
                  />
                  <CommandList>
                    <CommandGroup>
                      <ScrollArea className="max-h-96 overflow-y-auto">
                        {searchValue && (
                          <CommandItem
                            value={searchValue}
                            key={searchValue}
                            onSelect={() => {
                              form.setValue(fieldName, searchValue);
                            }}
                          >
                            <Icons.Plus
                              className={cn(
                                'mr-2 h-4 w-4',
                                searchValue === field.value ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            <span className="font-semibold italic">Custom ({searchValue})</span>
                          </CommandItem>
                        )}

                        {worldCurrencies
                          .filter(
                            (currency) =>
                              currency.label.toLowerCase().includes(searchValue.toLowerCase()) ||
                              currency.value.includes(searchValue),
                          )
                          .map((currency) => (
                            <CommandItem
                              value={currency.label}
                              key={currency.value}
                              onSelect={() => {
                                form.setValue(fieldName, currency.value);
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
            <FormMessage />
          </FormItem>
        )}
      />
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        <DialogHeader>
          <DialogTitle>Add Exchange Rate</DialogTitle>
          <DialogDescription>Add a new exchange rate to the system.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-10 p-4">
          {renderCurrencyField('fromCurrency')}
          {renderCurrencyField('toCurrency')}

          <FormField
            control={form.control}
            name="rate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Exchange Rate</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.0001"
                    placeholder="Enter exchange rate"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <DialogFooter>
          <DialogTrigger asChild>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </DialogTrigger>
          <Button type="submit">
            <Icons.Plus className="h-4 w-4" />
            <span className="hidden sm:ml-2 sm:inline">Add Exchange Rate</span>
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
