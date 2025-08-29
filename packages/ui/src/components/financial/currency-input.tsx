import { forwardRef, useState } from 'react';
import { ChevronsUpDown, Check } from 'lucide-react';
import type { ButtonProps } from '../ui/button';
import { Button } from '../ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../lib/utils';
import { worldCurrencies } from '../../lib/currencies';

interface CurrencyInputCustomProps {
  value?: string;
  onChange: (value: string) => void;
}

type CurrencyInputProps = CurrencyInputCustomProps & Omit<ButtonProps, 'onChange' | 'value'>;

export const CurrencyInput = forwardRef<HTMLButtonElement, CurrencyInputProps>(
  ({ value, onChange, className, ...props }, ref) => {
    const [open, setOpen] = useState(false);

    return (
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn('w-full justify-between', !value && 'text-muted-foreground', className)}
            {...props}
          >
            {value
              ? worldCurrencies.find((currency) => currency.value === value)?.label
              : 'Select account currency'}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
                      <Check
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
  },
);

CurrencyInput.displayName = 'CurrencyInput';
