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
import { cn } from '@/lib/utils';
import { Icons } from './icons';

interface Account {
  id: string;
  name: string;
}

interface AccountSelectorProps {
  accounts: Account[];
  selectedAccounts: string[];
  onSelect: (account: { id: string; name: string }) => void;
}

export function AccountSelector({ accounts, selectedAccounts, onSelect }: AccountSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="flex h-8 items-center gap-1.5 rounded-md border-[1.5px] border-none bg-secondary/30 px-3 py-1 text-sm font-medium hover:bg-muted/80"
          size="sm"
        >
          <Icons.Plus className="h-4 w-4" />
          Add Account
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search accounts..." />
          <CommandList>
            <CommandEmpty>No account found.</CommandEmpty>
            <CommandGroup heading="Your Accounts">
              {accounts.map((account) => (
                <CommandItem
                  key={account.id}
                  value={account.name}
                  onSelect={() => {
                    onSelect({ id: account.id, name: account.name });
                    setOpen(false);
                  }}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{account.name}</span>
                  </div>
                  <Icons.Check
                    className={cn(
                      'ml-auto h-4 w-4',
                      selectedAccounts.includes(account.id) ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
