import TickerSearchInput from "@/components/ticker-search";
import { parseOccSymbol } from "@/lib/occ-symbol";
import type { SymbolSearchResult } from "@/lib/types";
import { normalizeCurrency } from "@/lib/utils";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@wealthfolio/ui/components/ui/radio-group";
import {
  DatePickerInput,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@wealthfolio/ui";
import { useFormContext, type FieldPath, type FieldValues } from "react-hook-form";

interface OptionContractFieldsProps<TFieldValues extends FieldValues = FieldValues> {
  underlyingName: FieldPath<TFieldValues>;
  strikePriceName: FieldPath<TFieldValues>;
  expirationDateName: FieldPath<TFieldValues>;
  optionTypeName: FieldPath<TFieldValues>;
  contractMultiplierName: FieldPath<TFieldValues>;
  /** Field name for currency — set from underlying ticker search result */
  currencyName?: FieldPath<TFieldValues>;
  /** Field name for exchangeMic — set from underlying ticker search result */
  exchangeMicName?: FieldPath<TFieldValues>;
}

export function OptionContractFields<TFieldValues extends FieldValues = FieldValues>({
  underlyingName,
  strikePriceName,
  expirationDateName,
  optionTypeName,
  contractMultiplierName,
  currencyName,
  exchangeMicName,
}: OptionContractFieldsProps<TFieldValues>) {
  const { control, setValue } = useFormContext<TFieldValues>();

  const handleUnderlyingSelect = (symbol: string, searchResult?: SymbolSearchResult) => {
    const upper = symbol.toUpperCase();

    // If user pasted an OCC symbol, parse it and auto-fill contract fields
    const parsed = parseOccSymbol(upper);
    if (parsed) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue(underlyingName, parsed.underlying as any, { shouldValidate: true, shouldDirty: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue(strikePriceName, parsed.strikePrice as any, { shouldDirty: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue(expirationDateName, parsed.expiration as any, { shouldDirty: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue(optionTypeName, parsed.optionType as any, { shouldDirty: true });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue(underlyingName, upper as any, { shouldValidate: true, shouldDirty: true });
    }

    if (searchResult?.currency && currencyName) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue(currencyName, normalizeCurrency(searchResult.currency) as any);
    }
    if (searchResult?.exchangeMic && exchangeMicName) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue(exchangeMicName, searchResult.exchangeMic as any);
    }
  };

  return (
    <div className="space-y-4">
      <h4 className="text-muted-foreground text-sm font-medium">Option Contract</h4>

      {/* Underlying Symbol */}
      <FormField
        control={control}
        name={underlyingName}
        render={({ field }) => (
          <FormItem className="-mt-2">
            <FormLabel>Underlying Symbol</FormLabel>
            <FormControl>
              <TickerSearchInput
                onSelectResult={handleUnderlyingSelect}
                value={field.value as string}
              />
            </FormControl>
            <FormMessage className="text-xs" />
          </FormItem>
        )}
      />

      {/* Strike Price + Expiration Date */}
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name={strikePriceName}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Strike Price</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  {...field}
                  value={(field.value as number) ?? ""}
                  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                  className="h-10"
                  aria-label="Strike Price"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={expirationDateName}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Expiration Date</FormLabel>
              <FormControl>
                <DatePickerInput
                  onChange={(date: Date | undefined) => {
                    if (date) {
                      const yyyy = date.getFullYear();
                      if (yyyy < 1000) return;
                      const mm = String(date.getMonth() + 1).padStart(2, "0");
                      const dd = String(date.getDate()).padStart(2, "0");
                      field.onChange(`${yyyy}-${mm}-${dd}`);
                    }
                  }}
                  value={field.value as string | undefined}
                  disabled={field.disabled}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Call/Put + Multiplier */}
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name={optionTypeName}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Option Type</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  value={field.value as string}
                  className="grid grid-cols-2 gap-2"
                >
                  <div>
                    <RadioGroupItem value="CALL" id="option-call" className="peer sr-only" />
                    <Label
                      htmlFor="option-call"
                      className="hover:bg-muted peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 flex cursor-pointer items-center justify-center rounded-md border p-2 text-sm"
                    >
                      Call
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="PUT" id="option-put" className="peer sr-only" />
                    <Label
                      htmlFor="option-put"
                      className="hover:bg-muted peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 flex cursor-pointer items-center justify-center rounded-md border p-2 text-sm"
                    >
                      Put
                    </Label>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={contractMultiplierName}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Multiplier</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  {...field}
                  value={(field.value as number) ?? 100}
                  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : 100)}
                  className="h-10"
                  aria-label="Contract Multiplier"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
