import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/ui/icons';
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

import { motion, AnimatePresence } from 'framer-motion';
import { PORTFOLIO_ACCOUNT_ID, AccountType } from '@/lib/constants';
import { Skeleton } from '@/components/ui/skeleton';
import { useAccounts } from '@/hooks/use-accounts';
import { useSettings } from '@/hooks/use-settings';

// Custom type for UI purposes that extends the standard AccountType
type UIAccountType = AccountType | typeof PORTFOLIO_ACCOUNT_ID;

// Map account types to icons for visual distinction
const accountTypeIcons: Record<string, any> = {
  SECURITIES: Icons.Briefcase,
  CASH: Icons.DollarSign,
  CRYPTOCURRENCY: Icons.Bitcoin,
  [PORTFOLIO_ACCOUNT_ID]: Icons.Wallet,
};

interface AccountSelectorProps {
  selectedAccount?: Account | null;
  setSelectedAccount: (account: Account) => void;
  variant?: 'card' | 'dropdown' | 'button';
  buttonText?: string;
  filterActive?: boolean;
  includePortfolio?: boolean;
  className?: string;
}

// Extended Account type for UI that can have the PORTFOLIO type
interface UIAccount extends Omit<Account, 'accountType'> {
  accountType: UIAccountType;
}



// Create a portfolio account for UI purposes
function createPortfolioAccount(baseCurrency: string): UIAccount {
  return {
    id: PORTFOLIO_ACCOUNT_ID,
    name: 'All Portfolio',
    accountType: PORTFOLIO_ACCOUNT_ID as UIAccountType,
    balance: 0,
    currency: baseCurrency,
    isDefault: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };
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

export function AccountSelector({ 
  selectedAccount, 
  setSelectedAccount, 
  variant = 'card',
  buttonText = 'Select Account',
  filterActive = true,
  includePortfolio = false,
  className
}: AccountSelectorProps) {
  const [open, setOpen] = useState(false);
  const { accounts, isLoading: isLoadingAccounts } = useAccounts(filterActive);
  const { data: settings, isLoading: isLoadingSettings } = useSettings();

  const isLoading = isLoadingAccounts || isLoadingSettings;
  
  // Add portfolio account if requested
  const displayAccounts = [...accounts];
  
  if (includePortfolio) {
    const baseCurrency = settings?.baseCurrency || 'USD'; // Default to USD if settings not loaded
    const portfolioAccount = createPortfolioAccount(baseCurrency);
    // Check if portfolio account already exists to avoid duplication
    const portfolioExists = accounts.some(account => account.id === PORTFOLIO_ACCOUNT_ID);
    
    if (!portfolioExists) {
      displayAccounts.push(portfolioAccount as Account);
    }
  }

  // Group accounts by type
  const accountsByType: Record<string, Account[]> = {};
  displayAccounts.forEach((account) => {
    if (!accountsByType[account.accountType]) {
      accountsByType[account.accountType] = [];
    }
    accountsByType[account.accountType].push(account);
  });

  // Sort groups to ensure PORTFOLIO appears first if it exists
  const sortedGroups = Object.entries(accountsByType).sort(([typeA], [typeB]) => {
    if (typeA === PORTFOLIO_ACCOUNT_ID) return -1;
    if (typeB === PORTFOLIO_ACCOUNT_ID) return 1;
    return 0;
  });

  // Render skeleton for loading state
  const renderSkeleton = () => {
    switch (variant) {
      case 'card':
        return (
          <div className="h-full w-full rounded-lg border border-dashed p-2 border-border bg-background/50">
            <div className="flex flex-col items-center justify-center space-y-1">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-0.5 text-center">
                <Skeleton className="h-3 w-16 mx-auto" />
                <Skeleton className="h-3 w-20 mx-auto" />
              </div>
            </div>
          </div>
        );
      
      case 'dropdown':
        return (
          <Button variant="outline" className="w-[240px] justify-between" disabled>
            <div className="flex items-center gap-2 w-full">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-36" />
            </div>
          </Button>
        );
      
      case 'button':
        return (
          <Button variant="outline" className="h-8 px-3 py-1" size="sm" disabled>
            <Skeleton className="h-4 w-24" />
          </Button>
        );
        
      default:
        return null;
    }
  };

  // Render the appropriate trigger based on the variant
  const renderTrigger = () => {
    if (isLoading) {
      return renderSkeleton();
    }
    
    switch (variant) {
      case 'card':
        return (
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
                          accountTypeIcons[selectedAccount.accountType] || Icons.CreditCard;
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
                      <Icons.ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
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
        );
      
      case 'dropdown':
        return (
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            size="sm"
            className={cn(
              "flex items-center h-10 gap-1.5 rounded-full border-[1.5px] border-none bg-secondary/30 px-3 py-1 text-sm font-medium hover:bg-muted/80",
              className
            )}
          >
            <div className="flex items-center gap-2">
              {selectedAccount ? (
                <>
                  {(() => {
                    const IconComponent =
                      accountTypeIcons[selectedAccount.accountType] || Icons.CreditCard;
                    return <IconComponent className="h-4 w-4 shrink-0 opacity-70" />;
                  })()}
                  <span>{selectedAccount.name}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Select an account</span>
              )}
            </div>
            <Icons.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        );
      
      case 'button':
        return (
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="flex h-8 items-center gap-1.5 rounded-md border-[1.5px] border-none bg-secondary/30 px-3 py-1 text-sm font-medium hover:bg-muted/80"
            size="sm"
          >
            <Icons.Plus className="h-4 w-4" />
            {buttonText}
          </Button>
        );
        
      default:
        return null;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {renderTrigger()}
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        sideOffset={8}
        style={{
          minWidth: variant === 'card' ? 'var(--radix-popover-trigger-width)' : '240px'
        }}
      >
        <Command className="w-full">
          <CommandInput placeholder="Search accounts..." />
          <CommandList>
            {isLoading ? (
              <div className="py-6 px-2 text-center">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </div>
            ) : (
              <>
                <CommandEmpty>No accounts found.</CommandEmpty>
                {sortedGroups.map(([type, typeAccounts]) => (
                  <CommandGroup key={type} heading={type}>
                    {typeAccounts.map((account) => {
                      const IconComponent = accountTypeIcons[account.accountType] || Icons.CreditCard;
                      return (
                        <CommandItem
                          key={account.id}
                          value={account.id}
                          onSelect={() => {
                            setSelectedAccount(account);
                            setOpen(false);
                          }}
                          className="flex items-center py-1.5"
                        >
                          <div className="flex flex-1 items-center">
                            <IconComponent className="mr-2 h-4 w-4" />
                            <span>{account.name} ({account.currency})</span>
                          </div>
                          <Icons.Check
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
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
} 