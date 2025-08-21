import { useState, useCallback, useMemo, memo } from 'react';
import { useFormContext, useFieldArray, useWatch } from 'react-hook-form';
import {
  Card,
  CardContent,
  Button,
  MoneyInput,
  QuantityInput,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  DatePickerInput,
} from '@wealthfolio/ui';
import { Icons } from '@/components/ui/icons';
import { AccountSelector } from '@/components/account-selector';
import TickerSearchInput from '@/components/ticker-search';
import { TickerAvatar } from '@/components/ticker-avatar';
import { cn } from '@/lib/utils';
import { Account } from '@/lib/types';

export interface BulkHoldingRow {
  id: string;
  ticker: string;
  name?: string;
  sharesOwned: number | string;
  averageCost: number | string;
  totalValue: number;
  assetId?: string;
}

interface BulkHoldingsFormProps {
  onAccountChange?: (account: Account | null) => void;
}

// Memoized row component to prevent unnecessary re-renders
const HoldingRow = memo(({ 
  index, 
  field, 
  onRemove, 
  onAddRow,
  isLast,
  isSelected,
  onSelectRow,
  setFocus,
  canRemove
}: {
  index: number;
  field: any;
  onRemove: (index: number) => void;
  onAddRow: () => void;
  isLast: boolean;
  isSelected: boolean;
  onSelectRow: (id: string) => void;
  setFocus: any;
  canRemove: boolean;
}) => {
  const { control } = useFormContext();
  
  // Use useWatch for specific fields instead of watch() in parent
  const ticker = useWatch({ 
    control, 
    name: `holdings.${index}.ticker`,
    defaultValue: ''
  });
  
  const sharesOwned = useWatch({ 
    control, 
    name: `holdings.${index}.sharesOwned`,
    defaultValue: 0
  });
  
  const averageCost = useWatch({ 
    control, 
    name: `holdings.${index}.averageCost`,
    defaultValue: 0
  });

  // Memoize total value calculation
  const totalValue = useMemo(() => {
    const shares = Number(sharesOwned) || 0;
    const cost = Number(averageCost) || 0;
    return shares * cost;
  }, [sharesOwned, averageCost]);

  // Memoize event handlers
  const handleSharesKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setFocus(`holdings.${index}.averageCost`);
    }
  }, [index, setFocus]);

  const handleCostKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isLast) {
        onAddRow();
      } else {
        setFocus(`holdings.${index + 1}.ticker`);
      }
    }
  }, [index, isLast, onAddRow, setFocus]);

  const handleTickerSelect = useCallback((_symbol: string) => {
    setFocus(`holdings.${index}.sharesOwned`);
  }, [index, setFocus]);

  const handleRemoveClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(index);
  }, [index, onRemove]);

  const handleRowClick = useCallback(() => {
    onSelectRow(field.id);
  }, [field.id, onSelectRow]);

  return (
    <div
      className={cn(
        'grid grid-cols-12 gap-3 rounded-lg border-b border-border/50 px-3 py-3 transition-colors hover:bg-muted/50 last:border-b-0',
        isSelected && 'bg-muted',
      )}
      onClick={handleRowClick}
    >
      {/* Ticker Input */}
      <div className="col-span-5">
        <div className="flex items-center gap-2">
          <TickerAvatar symbol={ticker} />
          <div className="flex-1">
            <FormField
              control={control}
              name={`holdings.${index}.ticker`}
              render={({ field: tickerField }) => (
                <TickerSearchInput
                  ref={tickerField.ref}
                  onSelectResult={(symbol: string) => {
                    tickerField.onChange(symbol);
                    handleTickerSelect(symbol);
                  }}
                  value={tickerField.value}
                  placeholder="Search ticker..."
                  className="h-9 border-none bg-transparent text-sm focus:border focus:border-input focus:bg-background"
                />
              )}
            />
          </div>
        </div>
      </div>

      {/* Shares Input */}
      <div className="col-span-2 text-right">
        <FormField
          control={control}
          name={`holdings.${index}.sharesOwned`}
          render={({ field: sharesField }) => (
            <QuantityInput
              {...sharesField}
              placeholder="Add shares"
              className="h-9 border-none bg-transparent text-sm focus:border focus:border-input focus:bg-background"
              onKeyDown={handleSharesKeyDown}
            />
          )}
        />
      </div>

      {/* Average Cost Input */}
      <div className="col-span-2 text-right">
        <FormField
          control={control}
          name={`holdings.${index}.averageCost`}
          render={({ field: priceField }) => (
            <MoneyInput
              {...priceField}
              placeholder="Average cost"
              className="h-9 border-none bg-transparent text-sm focus:border focus:border-input focus:bg-background"
              onKeyDown={handleCostKeyDown}
            />
          )}
        />
      </div>

      {/* Total Value */}
      <div className="col-span-2 flex items-center justify-end">
        <span
          className={cn(
            'text-sm font-medium',
            totalValue > 0 ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          ${totalValue.toFixed(2)}
        </span>
      </div>

      {/* Delete Button */}
      <div className="col-span-1 flex items-center justify-end">
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemoveClick}
            className="h-6 w-6 p-0 hover:bg-destructive/20 hover:text-destructive"
          >
            <Icons.Trash className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
});

HoldingRow.displayName = 'HoldingRow';

export const BulkHoldingsForm = ({ onAccountChange }: BulkHoldingsFormProps) => {
  const { control, setFocus } = useFormContext();
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'holdings',
  });

  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Handle account selection with improved focus management
  const handleAccountSelect = useCallback(
    (account: Account) => {
      setSelectedAccount(account);
      onAccountChange?.(account);
      // Focus first ticker field after account selection, with proper timing
      if (fields.length > 0) {
        requestAnimationFrame(() => {
          setFocus('holdings.0.ticker');
        });
      }
    },
    [onAccountChange, fields.length, setFocus],
  );

  // Add a new holding row
  const addRow = useCallback(() => {
    const newIndex = fields.length;
    append({
      id: `holding-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // More unique ID
      ticker: '',
      name: '',
      assetId: '',
    });
    
    // Use requestAnimationFrame for smoother focus transition
    requestAnimationFrame(() => {
      setFocus(`holdings.${newIndex}.ticker`);
    });
  }, [append, fields.length, setFocus]);

  // Remove a holding row
  const removeRow = useCallback(
    (index: number) => {
      if (fields.length > 1) {
        remove(index);
        // Focus previous row if removing current selection
        if (index > 0) {
          requestAnimationFrame(() => {
            setFocus(`holdings.${index - 1}.ticker`);
          });
        }
      }
    },
    [remove, fields.length, setFocus],
  );

  // Memoize row selection handler
  const handleRowSelect = useCallback((id: string) => {
    setSelectedRowId(id);
  }, []);

  return (
    <div className="space-y-6">
      {/* Holdings Table */}
      <Card>
        <CardContent className="space-y-4 pt-4">
          {/* Account and Date Selection */}
          <div className="grid grid-cols-2 gap-4 pb-4">
            <FormField
              control={control}
              name="accountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account</FormLabel>
                  <FormControl>
                    <AccountSelector
                      ref={field.ref}
                      selectedAccount={selectedAccount}
                      setSelectedAccount={(account) => {
                        handleAccountSelect(account);
                        field.onChange(account?.id || '');
                      }}
                      variant="form"
                      filterActive={true}
                      className="mt-2"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="activityDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Date</FormLabel>
                  <FormControl>
                    <DatePickerInput value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-12 gap-3 border-b pb-3 text-sm text-muted-foreground">
            <div className="col-span-5">Tickers</div>
            <div className="col-span-2 text-right">Shares owned</div>
            <div className="col-span-2 text-right">Average cost</div>
            <div className="col-span-2 whitespace-nowrap text-right">Total value</div>
            <div className="col-span-1 text-right"></div>
          </div>

          {/* Table Rows - Virtualization candidate for large lists */}
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {fields.map((field, index) => (
              <HoldingRow
                key={field.id}
                index={index}
                field={field}
                onRemove={removeRow}
                onAddRow={addRow}
                isLast={index === fields.length - 1}
                isSelected={selectedRowId === field.id}
                onSelectRow={handleRowSelect}
                setFocus={setFocus}
                canRemove={fields.length > 1}
              />
            ))}
          </div>

          {/* Add Row Button */}
          <div className="pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addRow}
              className="h-10 w-full border border-dashed border-muted-foreground/25 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground"
            >
              <Icons.PlusCircle className="mr-2 h-4 w-4" />
              Add Another Holding
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};