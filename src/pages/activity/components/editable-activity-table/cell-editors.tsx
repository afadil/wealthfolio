/**
 * Cell Editor Components
 *
 * Reusable cell editor components for the editable activity table.
 * Each editor is designed to fill its parent cell seamlessly.
 */

import { AccountSelector } from "@/components/account-selector";
import TickerSearchInput from "@/components/ticker-search";
import { ActivityType } from "@/lib/constants";
import { Account } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  CurrencyInput,
  DatePickerInput,
  MoneyInput,
  QuantityInput,
  SearchableSelect,
} from "@wealthfolio/ui";
import React from "react";

// Shared styling for all cell editors - seamless integration
const cellEditorBaseStyle =
  "w-full h-full px-2 py-1.5 border-none rounded-none bg-transparent outline-none focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0";

interface CellEditorProps {
  value: unknown;
  onChange: (value: unknown) => void;
  onComplete: () => void;
  autoFocus?: boolean;
}

export const DateCellEditor: React.FC<CellEditorProps> = ({
  value,
  onChange,
  onComplete,
  autoFocus,
}) => {
  let initialDateForPicker: Date | undefined = undefined;

  if (value) {
    if (typeof value === "string") {
      const parsedDate = new Date(value);
      if (!isNaN(parsedDate.getTime())) {
        initialDateForPicker = parsedDate;
      }
    } else if (value instanceof Date) {
      initialDateForPicker = value;
    }
  }

  return (
    <DatePickerInput
      value={initialDateForPicker}
      onChange={(newDate: Date | undefined) => {
        onChange(newDate);
      }}
      onInteractionEnd={onComplete}
      autoFocus={autoFocus}
      className={cellEditorBaseStyle}
      enableTime={true}
      timeGranularity="minute"
    />
  );
};

interface ActivityTypeSelectProps extends CellEditorProps {
  options: { label: string; value: ActivityType }[];
}

export const ActivityTypeSelectEditor: React.FC<ActivityTypeSelectProps> = ({
  value,
  onChange,
  onComplete,
  options,
}) => {
  return (
    <SearchableSelect
      options={options as { label: string; value: string }[]}
      value={value as string | undefined}
      onValueChange={(newValue) => {
        if (newValue !== undefined) {
          onChange(newValue);
        }
        onComplete();
      }}
      placeholder="Select type..."
      className={cn(
        cellEditorBaseStyle,
        "data-[state=open]:ring-ring min-w-[100px] data-[state=open]:ring-2",
      )}
    />
  );
};

export const AssetSymbolSearchEditor: React.FC<CellEditorProps> = ({
  value,
  onChange,
  onComplete,
}) => {
  return (
    <TickerSearchInput
      value={value as string | undefined}
      onSelectResult={(selectedSymbol) => {
        if (selectedSymbol) {
          onChange(selectedSymbol);
        }
        onComplete();
      }}
      placeholder="Search symbol..."
      className={cn(cellEditorBaseStyle, "text-left")}
    />
  );
};

export const QuantityCellEditor: React.FC<CellEditorProps> = ({
  value,
  onChange,
  onComplete,
  autoFocus,
}) => {
  return (
    <QuantityInput
      value={value as string | number | undefined}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        const newValueString = e.target.value;
        if (newValueString !== undefined && newValueString.trim() !== "") {
          const numericValue = parseFloat(newValueString);
          if (!isNaN(numericValue)) {
            onChange(numericValue);
          }
        } else if (newValueString === "" || newValueString === undefined) {
          onChange(undefined);
        }
      }}
      onBlur={onComplete}
      autoFocus={autoFocus}
      className={cn(cellEditorBaseStyle, "text-right")}
    />
  );
};

export const MoneyCellEditor: React.FC<CellEditorProps> = ({
  value,
  onChange,
  onComplete,
  autoFocus,
}) => {
  return (
    <MoneyInput
      value={value as string | number | undefined}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        const newValueString = e.target.value;
        if (newValueString !== undefined && newValueString.trim() !== "") {
          onChange(newValueString);
        } else if (newValueString === "" || newValueString === undefined) {
          onChange(undefined);
        }
      }}
      onBlur={onComplete}
      autoFocus={autoFocus}
      className={cn(cellEditorBaseStyle, "text-right")}
    />
  );
};

interface AccountSelectEditorProps extends CellEditorProps {
  accounts: Account[];
}

export const AccountSelectEditor: React.FC<AccountSelectEditorProps> = ({
  value,
  onChange,
  onComplete,
  accounts,
}) => {
  const currentAccountId = value as string | undefined;
  const selectedAccountObj = accounts?.find((acc) => acc.id === currentAccountId);

  return (
    <AccountSelector
      selectedAccount={selectedAccountObj ?? null}
      setSelectedAccount={(account: Account) => {
        if (account) {
          onChange(account.id);
        }
        onComplete();
      }}
      variant="dropdown"
      className={cn(cellEditorBaseStyle, "text-left")}
    />
  );
};

export const CurrencySelectEditor: React.FC<CellEditorProps> = ({
  value,
  onChange,
  onComplete,
}) => {
  return (
    <CurrencyInput
      value={value as string | undefined}
      onChange={(newValue: string | undefined) => {
        if (newValue !== undefined) {
          onChange(newValue);
        }
        onComplete();
      }}
      className={cn(cellEditorBaseStyle, "min-w-[80px]")}
    />
  );
};

export const TextCellEditor: React.FC<CellEditorProps> = ({
  value,
  onChange,
  onComplete,
  autoFocus,
}) => {
  return (
    <input
      type="text"
      value={(value as string) || ""}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
      }}
      onBlur={onComplete}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onComplete();
        }
        // Don't prevent Tab - let it bubble up to the parent cell's handler
      }}
      autoFocus={autoFocus}
      className={cn(cellEditorBaseStyle, "text-left")}
    />
  );
};
