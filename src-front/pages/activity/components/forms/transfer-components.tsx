import { useAccounts } from "@/hooks/use-accounts";
import type { Account, Holding } from "@/lib/types";
import { cn, formatAmount } from "@/lib/utils";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Icons,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  Skeleton,
  Switch,
} from "@wealthfolio/ui";
import { useState } from "react";

// ============================================================================
// Account Combobox Component
// ============================================================================
interface AccountComboboxProps {
  value?: string;
  onChange: (value: string, account?: Account) => void;
  placeholder?: string;
  excludeId?: string;
  label?: string;
}

export function AccountCombobox({
  value,
  onChange,
  placeholder = "Select account...",
  excludeId,
  label,
}: AccountComboboxProps) {
  const [open, setOpen] = useState(false);
  const { accounts, isLoading } = useAccounts(true);

  const filteredAccounts = excludeId ? accounts.filter((a) => a.id !== excludeId) : accounts;

  const selectedAccount = accounts.find((a) => a.id === value);

  if (isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  return (
    <div className="space-y-2">
      {label && <Label className="text-sm font-medium">{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {selectedAccount ? (
              <span className="flex items-center gap-2">
                <Icons.Briefcase className="h-4 w-4 opacity-50" />
                {selectedAccount.name}
                <Badge variant="outline" className="ml-auto">
                  {selectedAccount.currency}
                </Badge>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <Icons.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search accounts..." />
            <CommandList>
              <CommandEmpty>No accounts found.</CommandEmpty>
              <CommandGroup>
                {filteredAccounts.map((account) => (
                  <CommandItem
                    key={account.id}
                    value={`${account.name} ${account.currency}`}
                    onSelect={() => {
                      onChange(account.id, account);
                      setOpen(false);
                    }}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icons.Briefcase className="h-4 w-4 opacity-50" />
                        <span>{account.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{account.currency}</Badge>
                        <Icons.Check
                          className={cn(
                            "h-4 w-4",
                            value === account.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ============================================================================
// Holding Combobox Component
// ============================================================================
interface HoldingComboboxProps {
  holdings: Holding[];
  value?: string;
  onChange: (value: string, holding?: Holding) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
}

export function HoldingCombobox({
  holdings,
  value,
  onChange,
  isLoading,
  disabled,
  placeholder = "Select asset...",
  label,
}: HoldingComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedHolding = holdings.find((h) => h.instrument?.symbol === value || h.id === value);

  if (isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  return (
    <div className="space-y-2">
      {label && <Label className="text-sm font-medium">{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
          >
            {selectedHolding ? (
              <span className="flex items-center gap-2">
                <span className="font-medium">{selectedHolding.instrument?.symbol}</span>
                <span className="text-muted-foreground truncate">
                  {selectedHolding.instrument?.name}
                </span>
                <Badge variant="secondary" className="ml-auto">
                  {selectedHolding.quantity.toLocaleString()} shares
                </Badge>
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <Icons.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[500px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search holdings..." />
            <CommandList>
              <CommandEmpty>No holdings found in this account.</CommandEmpty>
              <CommandGroup>
                {holdings.map((holding) => (
                  <CommandItem
                    key={holding.id}
                    value={`${holding.instrument?.symbol} ${holding.instrument?.name}`}
                    onSelect={() => {
                      onChange(holding.instrument?.symbol || holding.id, holding);
                      setOpen(false);
                    }}
                  >
                    <div className="flex w-full flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{holding.instrument?.symbol}</span>
                          <span className="text-muted-foreground max-w-[200px] truncate text-sm">
                            {holding.instrument?.name}
                          </span>
                        </div>
                        <Icons.Check
                          className={cn(
                            "h-4 w-4",
                            value === holding.instrument?.symbol || value === holding.id
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                      </div>
                      <div className="text-muted-foreground flex items-center gap-4 text-xs">
                        <span>{holding.quantity.toLocaleString()} shares</span>
                        <span>@ {formatAmount(holding.price || 0, holding.localCurrency)}</span>
                        <span>
                          Value: {formatAmount(holding.marketValue.local, holding.localCurrency)}
                        </span>
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ============================================================================
// Transfer Mode Selector (Internal vs External)
// ============================================================================
interface TransferModeSelectorProps {
  isExternal: boolean;
  onExternalChange: (isExternal: boolean) => void;
}

export function TransferModeSelector({ isExternal, onExternalChange }: TransferModeSelectorProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="space-y-0.5">
        <Label htmlFor="external-toggle" className="text-sm font-medium">
          External Transfer
        </Label>
        <p className="text-muted-foreground text-xs">
          Transfer from/to outside tracked accounts (affects contributions)
        </p>
      </div>
      <Switch id="external-toggle" checked={isExternal} onCheckedChange={onExternalChange} />
    </div>
  );
}

// ============================================================================
// Direction Selector (for external transfers)
// ============================================================================
interface DirectionSelectorProps {
  direction?: "in" | "out";
  onDirectionChange: (direction: "in" | "out") => void;
}

export function DirectionSelector({ direction, onDirectionChange }: DirectionSelectorProps) {
  return (
    <RadioGroup
      value={direction}
      onValueChange={(v) => onDirectionChange(v as "in" | "out")}
      className="grid grid-cols-2 gap-4"
    >
      <Label
        htmlFor="dir-in"
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-lg border-2 p-3 transition-colors",
          direction === "in" ? "border-green-500 bg-green-500/5" : "border-muted hover:bg-muted/50",
        )}
      >
        <RadioGroupItem value="in" id="dir-in" className="sr-only" />
        <Icons.ArrowDown className="h-4 w-4 text-green-500" />
        <div>
          <span className="text-sm font-medium">Incoming</span>
          <p className="text-muted-foreground text-xs">Into this account</p>
        </div>
      </Label>
      <Label
        htmlFor="dir-out"
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-lg border-2 p-3 transition-colors",
          direction === "out" ? "border-red-500 bg-red-500/5" : "border-muted hover:bg-muted/50",
        )}
      >
        <RadioGroupItem value="out" id="dir-out" className="sr-only" />
        <Icons.ArrowUp className="h-4 w-4 text-red-500" />
        <div>
          <span className="text-sm font-medium">Outgoing</span>
          <p className="text-muted-foreground text-xs">Out of this account</p>
        </div>
      </Label>
    </RadioGroup>
  );
}

// ============================================================================
// Currency Mismatch Alert
// ============================================================================
interface CurrencyMismatchAlertProps {
  fromCurrency?: string;
  toCurrency?: string;
}

export function CurrencyMismatchAlert({ fromCurrency, toCurrency }: CurrencyMismatchAlertProps) {
  if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) {
    return null;
  }

  return (
    <Alert>
      <Icons.AlertCircle className="h-4 w-4" />
      <AlertDescription>
        These accounts have different currencies ({fromCurrency} → {toCurrency}). You may need to
        specify an FX rate.
      </AlertDescription>
    </Alert>
  );
}

// ============================================================================
// Account Pair Selector (From → To for internal transfers)
// ============================================================================
interface AccountPairSelectorProps {
  fromAccountId?: string;
  toAccountId?: string;
  onFromChange: (id: string, account?: Account) => void;
  onToChange: (id: string, account?: Account) => void;
  fromLabel?: string;
  toLabel?: string;
}

export function AccountPairSelector({
  fromAccountId,
  toAccountId,
  onFromChange,
  onToChange,
  fromLabel = "From Account",
  toLabel = "To Account",
}: AccountPairSelectorProps) {
  const { accounts } = useAccounts(true);
  const fromAccount = accounts.find((a) => a.id === fromAccountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <Icons.ArrowUp className="h-4 w-4 text-red-500" />
          {fromLabel}
        </Label>
        <AccountCombobox
          value={fromAccountId}
          onChange={onFromChange}
          placeholder="Select source account..."
          excludeId={toAccountId}
        />
        {fromAccount && (
          <p className="text-muted-foreground text-xs">Currency: {fromAccount.currency}</p>
        )}
      </div>

      <div className="flex justify-center">
        <div className="bg-muted rounded-full p-2">
          <Icons.ArrowDown className="h-4 w-4" />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <Icons.ArrowDown className="h-4 w-4 text-green-500" />
          {toLabel}
        </Label>
        <AccountCombobox
          value={toAccountId}
          onChange={onToChange}
          placeholder="Select destination account..."
          excludeId={fromAccountId}
        />
        {toAccount && (
          <p className="text-muted-foreground text-xs">Currency: {toAccount.currency}</p>
        )}
      </div>

      <CurrencyMismatchAlert
        fromCurrency={fromAccount?.currency}
        toCurrency={toAccount?.currency}
      />
    </div>
  );
}

// ============================================================================
// Generate transfer group ID
// ============================================================================
export function generateTransferGroupId(): string {
  return `transfer_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
