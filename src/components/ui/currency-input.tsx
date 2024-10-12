import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { worldCurrencies } from '@/lib/currencies';

interface CurrencyInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function CurrencyInput({ value, onChange }: CurrencyInputProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('justify-between', !value && 'text-muted-foreground')}
        >
          {value
            ? worldCurrencies.find((currency) => currency.value === value)?.label
            : 'Select account currency'}
          <Icons.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder="Search currency..." className="h-9" />
          <CommandList>
            <CommandEmpty>No currency found.</CommandEmpty>
            <CommandGroup>
              <ScrollArea className="max-h-96 overflow-y-auto">
                {worldCurrencies.map((currency) => (
                  <CommandItem
                    value={currency.label}
                    key={currency.value}
                    onSelect={() => {
                      onChange(currency.value);
                      setOpen(false);
                    }}
                  >
                    {currency.label}
                    <Icons.Check
                      className={cn(
                        'ml-auto h-4 w-4',
                        currency.value === value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                ))}
              </ScrollArea>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
