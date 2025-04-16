import { forwardRef, useState } from 'react';
import type { ButtonProps } from '@/components/ui/button';
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
import { supportedBrokers } from '@/lib/brokers';

interface BrokerInputCustomProps {
  value?: string;
  onChange: (value: string) => void;
}

type BrokerInputProps = BrokerInputCustomProps & Omit<ButtonProps, 'onChange' | 'value'>;

export const BrokerInput = forwardRef<HTMLButtonElement, BrokerInputProps>(
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
              ? supportedBrokers.find((broker) => broker.value === value)?.label
              : 'Select a broker'}
            <Icons.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0">
          <Command>
            <CommandInput placeholder="Search broker..." className="h-9" />
            <CommandList>
              <CommandEmpty>No broker found.</CommandEmpty>
              <CommandGroup>
                <ScrollArea className="max-h-96 overflow-y-auto">
                  {supportedBrokers.map((broker) => (
                    <CommandItem
                      value={broker.label}
                      key={broker.value}
                      onSelect={() => {
                        onChange(broker.value);
                        setOpen(false);
                      }}
                    >
                      {broker.label}
                      <Icons.Check
                        className={cn(
                          'ml-auto h-4 w-4',
                          broker.value === value ? 'opacity-100' : 'opacity-0',
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

BrokerInput.displayName = 'BrokerInput';
