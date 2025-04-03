import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown, CreditCard, Briefcase, DollarSign, Bitcoin } from 'lucide-react';
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
import { Account } from '@/lib/types';
import { QueryKeys } from '@/lib/query-keys';
import { getAccounts } from '@/commands/account';
import { motion, AnimatePresence } from 'framer-motion';

// Map account types to icons for visual distinction
const accountTypeIcons: Record<string, any> = {
  SECURITIES: Briefcase,
  CASH: DollarSign,
  CRYPTOCURRENCY: Bitcoin,
};

interface AccountSelectorProps {
  selectedAccount: Account | null;
  setSelectedAccount: (account: Account) => void;
}

export function useAccounts() {
  return useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });
}

// Animation variants for icon containers
const iconContainerVariants = {
  initial: { 
    scale: 0.8, 
    opacity: 0,
    rotate: -10,
  },
  animate: { 
    scale: 1, 
    opacity: 1,
    rotate: 0,
    transition: {
      type: "spring",
      stiffness: 260,
      damping: 20,
      duration: 0.5
    }
  },
  exit: { 
    scale: 0.8, 
    opacity: 0,
    rotate: 10,
    transition: { duration: 0.3 }
  }
};

// Animation variants for icons
const iconVariants = {
  initial: { scale: 0.6, opacity: 0 },
  animate: { 
    scale: 1, 
    opacity: 1,
    transition: {
      delay: 0.1,
      type: "spring",
      stiffness: 300
    }
  }
};

export function AccountSelector({ selectedAccount, setSelectedAccount }: AccountSelectorProps) {
  const [open, setOpen] = useState(false);
  const { data: accounts } = useAccounts();

  // Group accounts by type
  const accountsByType: Record<string, Account[]> = {};
  accounts?.forEach((account) => {
    if (!accountsByType[account.accountType]) {
      accountsByType[account.accountType] = [];
    }
    accountsByType[account.accountType].push(account);
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select an account"
          className={`h-full w-full rounded-lg border border-dashed p-2 transition-colors justify-center ${
            open ? 'border-primary bg-primary/5' : 'border-border bg-background/50 hover:bg-background/80 hover:border-muted-foreground/50'
          }`}
        >
          <div className="flex flex-col items-center justify-center space-y-1">
            <AnimatePresence mode="wait">
              {selectedAccount ? (
                <motion.div
                  key="account"
                  variants={iconContainerVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 shadow-sm dark:bg-green-900/20"
                >
                  <motion.div variants={iconVariants} initial="initial" animate="animate">
                    {(() => {
                      const IconComponent =
                        accountTypeIcons[selectedAccount.accountType] || CreditCard;
                      return (
                        <IconComponent className="h-4 w-4 text-green-600 dark:text-green-400" />
                      );
                    })()}
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  key="select"
                  variants={iconContainerVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-muted shadow-sm"
                >
                  <motion.div variants={iconVariants} initial="initial" animate="animate">
                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-0 text-center">
              <AnimatePresence mode="wait">
                {selectedAccount ? (
                  <motion.div
                    key="account-info"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-0"
                  >
                    <p className="text-xs font-medium">{selectedAccount.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedAccount.accountType}</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="select-text"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.2 }}
                  >
                    <p className="text-xs font-medium">Click to select an account</p>
                    <p className="text-xs text-muted-foreground">Required for import</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        sideOffset={8}
        style={{
          minWidth: 'var(--radix-popover-trigger-width)',
          width: 'var(--radix-popover-trigger-width)',
        }}
      >
        <Command className="w-full">
          <CommandInput placeholder="Search accounts..." />
          <CommandList>
            <CommandEmpty>No accounts found.</CommandEmpty>
            {Object.entries(accountsByType).map(([type, typeAccounts]) => (
              <CommandGroup key={type} heading={type}>
                {typeAccounts.map((account) => {
                  const IconComponent = accountTypeIcons[account.accountType] || CreditCard;
                  return (
                    <CommandItem
                      key={account.id}
                      value={`${account.name} ${account.accountType}`}
                      onSelect={() => {
                        setSelectedAccount(account);
                        setOpen(false);
                      }}
                      className="flex items-center py-1.5"
                    >
                      <div className="flex flex-1 items-center">
                        <IconComponent className="mr-2 h-4 w-4" />
                        <span>{account.name}</span>
                      </div>
                      <Check
                        className={cn(
                          'ml-auto h-4 w-4',
                          selectedAccount?.id === account.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
} 