import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const BENCHMARKS = [
  {
    group: 'US Market Indices',
    items: [
      { symbol: '^GSPC', name: 'S&P 500', description: 'Large-cap US stocks' },
      { symbol: '^NDX', name: 'Nasdaq 100', description: 'Large-cap tech-focused US stocks' },
      { symbol: '^RUT', name: 'Russell 2000', description: 'Small-cap US stocks' },
      { symbol: '^DJI', name: 'Dow Jones', description: 'Blue-chip US stocks' },
    ],
  },
  {
    group: 'Global Indices',
    items: [
      { symbol: '^FTSE', name: 'FTSE 100', description: 'Large-cap UK stocks' },
      { symbol: '^N225', name: 'Nikkei 225', description: 'Japanese stocks' },
      { symbol: '^STOXX50E', name: 'EURO STOXX 50', description: 'European blue-chip stocks' },
      { symbol: '^MSCIWD', name: 'MSCI World', description: 'Global developed markets' },
    ],
  },
  {
    group: 'ETFs',
    items: [
      { symbol: 'VOO', name: 'Vanguard S&P 500', description: 'S&P 500 index fund' },
      { symbol: 'VTI', name: 'Vanguard Total Stock', description: 'Total US market' },
      { symbol: 'VEA', name: 'Vanguard FTSE Developed', description: 'Developed markets ex-US' },
      { symbol: 'VWO', name: 'Vanguard FTSE Emerging', description: 'Emerging markets' },
    ],
  },
];

interface BenchmarkSymbolSelectorProps {
  onSelect: (symbol: { id: string; name: string }) => void;
}

export function BenchmarkSymbolSelector({ onSelect }: BenchmarkSymbolSelectorProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          role="combobox" 
          aria-expanded={open} 
          className="gap-2 rounded-md h-8 px-3 py-1" 
          size="sm"
        >
          <PlusCircle className="h-4 w-4" />
          Add Benchmark
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search benchmarks..." />
          <CommandList>
            <CommandEmpty>No benchmark found.</CommandEmpty>
            {BENCHMARKS.map((group) => (
              <CommandGroup key={group.group} heading={group.group}>
                {group.items.map((benchmark) => (
                  <CommandItem
                    key={benchmark.symbol}
                    value={`${benchmark.name} ${benchmark.symbol}`}
                    onSelect={() => {
                      setValue(benchmark.name);
                      onSelect({ id: benchmark.symbol, name: benchmark.name });
                      setOpen(false);
                    }}
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center">
                        <span className="font-medium">{benchmark.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {benchmark.symbol}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">{benchmark.description}</span>
                    </div>
                    <Check
                      className={cn(
                        'ml-auto h-4 w-4',
                        value === benchmark.name ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
