import { AccountSelector } from "@/components/account-selector";
import { TickerAvatar } from "@/components/ticker-avatar";
import TickerSearchInput from "@/components/ticker-search";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Account, QuoteSummary } from "@/lib/types";
import { DataSource } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Button,
  Card,
  CardContent,
  DatePickerInput,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  MoneyInput,
  QuantityInput,
} from "@wealthfolio/ui";
import { memo, useCallback, useMemo, useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { z } from "zod";
import { bulkHoldingsFormSchema } from "./schemas";

type BulkHoldingsFormValues = z.infer<typeof bulkHoldingsFormSchema>;

export interface BulkHoldingRow {
  id: string;
  ticker: string;
  name?: string;
  sharesOwned: number | string;
  averageCost: number | string;
  totalValue: number;
  assetId?: string;
  assetDataSource?: DataSource;
}

interface BulkHoldingsFormProps {
  onAccountChange?: (account: Account | null) => void;
}

// Memoized row component to prevent unnecessary re-renders
const HoldingRow = memo(
  ({
    index,
    field,
    onRemove,
    onAddRow,
    isLast,
    isSelected,
    onSelectRow,
    setFocus,
    canRemove,
  }: {
    index: number;
    field: BulkHoldingRow;
    onRemove: (index: number) => void;
    onAddRow: () => void;
    isLast: boolean;
    isSelected: boolean;
    onSelectRow: (id: string) => void;
    setFocus: ReturnType<typeof useFormContext<BulkHoldingsFormValues>>["setFocus"];
    canRemove: boolean;
  }) => {
    const { control, setValue } = useFormContext<BulkHoldingsFormValues>();

    // Use useWatch for specific fields instead of watch() in parent
    const ticker = useWatch({
      control,
      name: `holdings.${index}.ticker`,
      defaultValue: "",
    });

    const sharesOwned = useWatch({
      control,
      name: `holdings.${index}.sharesOwned`,
      defaultValue: 0,
    });

    const averageCost = useWatch({
      control,
      name: `holdings.${index}.averageCost`,
      defaultValue: 0,
    });

    // Memoize total value calculation
    const totalValue = useMemo(() => {
      const shares = Number(sharesOwned) || 0;
      const cost = Number(averageCost) || 0;
      return shares * cost;
    }, [sharesOwned, averageCost]);

    // Memoize event handlers
    const handleSharesKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          setFocus(`holdings.${index}.averageCost`);
        }
      },
      [index, setFocus],
    );

    const handleCostKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (isLast) {
            onAddRow();
          } else {
            setFocus(`holdings.${index + 1}.ticker`);
          }
        }
      },
      [index, isLast, onAddRow, setFocus],
    );

    const handleTickerSelect = useCallback(
      (_symbol: string, quoteSummary?: QuoteSummary) => {
        if (quoteSummary?.dataSource === DataSource.MANUAL) {
          setValue(`holdings.${index}.assetDataSource`, DataSource.MANUAL, { shouldDirty: true });
        } else {
          setValue(`holdings.${index}.assetDataSource`, DataSource.YAHOO, { shouldDirty: true });
        }
        setFocus(`holdings.${index}.sharesOwned`);
      },
      [index, setFocus, setValue],
    );

    const handleRemoveClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onRemove(index);
      },
      [index, onRemove],
    );

    const handleRowClick = useCallback(() => {
      onSelectRow(field.id);
    }, [field.id, onSelectRow]);

    return (
      <div
        className={cn(
          "border-border/50 hover:bg-muted/50 grid grid-cols-12 gap-3 rounded-lg border-b px-3 py-3 transition-colors last:border-b-0",
          isSelected && "bg-muted",
        )}
        onClick={handleRowClick}
      >
        {/* Ticker Input */}
        <div className="col-span-6">
          <div className="flex min-w-0 items-center gap-2">
            <TickerAvatar symbol={ticker} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <FormField
                control={control}
                name={`holdings.${index}.ticker`}
                render={({ field: tickerField }) => (
                  <TickerSearchInput
                    ref={tickerField.ref}
                    onSelectResult={(symbol: string, quoteSummary) => {
                      tickerField.onChange(symbol);
                      handleTickerSelect(symbol, quoteSummary);
                    }}
                    value={tickerField.value}
                    placeholder="Search ticker..."
                    className="focus:border-input focus:bg-background h-9 truncate border-none bg-transparent text-sm focus:border"
                  />
                )}
              />
            </div>
          </div>
        </div>

        {/* Shares Input */}
        <div className="col-span-1 text-right">
          <FormField
            control={control}
            name={`holdings.${index}.sharesOwned`}
            render={({ field: sharesField }) => (
              <QuantityInput
                {...sharesField}
                placeholder="Shares"
                className="focus:border-input focus:bg-background h-9 border-none bg-transparent text-sm focus:border"
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
                className="focus:border-input focus:bg-background h-9 border-none bg-transparent text-sm focus:border"
                onKeyDown={handleCostKeyDown}
              />
            )}
          />
        </div>

        {/* Total Value */}
        <div className="col-span-2 flex items-center justify-end">
          <span
            className={cn(
              "text-sm font-medium",
              totalValue > 0 ? "text-foreground" : "text-muted-foreground",
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
              className="hover:bg-destructive/20 hover:text-destructive h-6 w-6 p-0"
            >
              <Icons.Trash className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    );
  },
);

HoldingRow.displayName = "HoldingRow";

export const BulkHoldingsForm = ({ onAccountChange }: BulkHoldingsFormProps) => {
  const { control, setFocus } = useFormContext<BulkHoldingsFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "holdings",
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
          setFocus("holdings.0.ticker");
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
      ticker: "",
      name: "",
      assetId: "",
      assetDataSource: DataSource.YAHOO,
      sharesOwned: 0,
      averageCost: 0,
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
                        field.onChange(account?.id || "");
                      }}
                      variant="form"
                      filterActive={true}
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
          <div className="text-muted-foreground grid grid-cols-12 gap-3 border-b pb-3 text-sm">
            <div className="col-span-6">Tickers</div>
            <div className="col-span-1 text-right">Shares</div>
            <div className="col-span-2 text-right">Average cost</div>
            <div className="col-span-2 text-right whitespace-nowrap">Total value</div>
            <div className="col-span-1 text-right"></div>
          </div>

          {/* Table Rows - Virtualization candidate for large lists */}
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {fields.map((field, index) => (
              <HoldingRow
                key={field.id}
                index={index}
                field={field as BulkHoldingRow}
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
              className="border-muted-foreground/25 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground h-10 w-full border border-dashed"
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
