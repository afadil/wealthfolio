import TickerSearchInput from "@/components/ticker-search";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@wealthfolio/ui";
import { DataSource, PricingMode } from "@/lib/constants";
import type { SymbolSearchResult } from "@/lib/types";
import { useFormContext, type FieldPath, type FieldValues } from "react-hook-form";
import { normalizeCurrency } from "@/lib/utils";

/**
 * Strip exchange suffix from symbol (e.g., "VFV.TO" -> "VFV")
 * Yahoo and other providers add exchange suffixes like .TO, .L, .PA, .DE
 * Since we capture exchangeMic separately, we should use the base symbol
 */
function stripExchangeSuffix(symbol: string): string {
  // Common exchange suffixes from Yahoo Finance
  const suffixPattern =
    /\.(TO|L|PA|DE|SW|AS|MI|MC|BR|HK|T|SI|AX|NZ|TA|JO|SA|SN|MX|VI|ST|OL|CO|HE|IC|PR|WA|AT|LI|LS|IR|KQ|KS|TW|TWO|V|CN|F|BE|DU|HA|HM|MU|SG)$/i;
  return symbol.replace(suffixPattern, "");
}

interface SymbolSearchProps<TFieldValues extends FieldValues = FieldValues> {
  /** Field name for the symbol value */
  name: FieldPath<TFieldValues>;
  /** Whether to show manual input instead of search */
  isManualAsset?: boolean;
  /** Label for the field */
  label?: string;
  /** Default currency for creating custom assets */
  defaultCurrency?: string;
  /** Field name for exchangeMic (optional, for capturing exchange info) */
  exchangeMicName?: FieldPath<TFieldValues>;
  /** Field name for pricingMode (optional, to set manual pricing for custom assets) */
  pricingModeName?: FieldPath<TFieldValues>;
  /** Field name for currency (optional, to set currency from search result) */
  currencyName?: FieldPath<TFieldValues>;
}

export function SymbolSearch<TFieldValues extends FieldValues = FieldValues>({
  name,
  isManualAsset = false,
  label = "Symbol",
  defaultCurrency,
  exchangeMicName,
  pricingModeName,
  currencyName,
}: SymbolSearchProps<TFieldValues>) {
  const { control, setValue } = useFormContext<TFieldValues>();

  const handleTickerSelect = (
    symbol: string,
    quoteSummary: SymbolSearchResult | undefined,
    onChange: (value: string) => void,
  ) => {
    // If the selected ticker is a custom/manual entry, set pricing mode FIRST
    // This must happen before the symbol is set to ensure the form state is correct
    if (quoteSummary?.dataSource === DataSource.MANUAL && pricingModeName) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue(pricingModeName, PricingMode.MANUAL as any);
    }

    // Strip exchange suffix when we have exchangeMic (e.g., "VFV.TO" -> "VFV")
    // Backend generates canonical ID as SEC:{symbol}:{mic}, so we need the base symbol
    const baseSymbol = quoteSummary?.exchangeMic ? stripExchangeSuffix(symbol) : symbol;
    onChange(baseSymbol);

    // Capture exchangeMic from search result for canonical asset ID generation
    if (quoteSummary?.exchangeMic && exchangeMicName) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue(exchangeMicName, quoteSummary.exchangeMic as any);
    }
    // Set currency from search result (normalized: GBp -> GBP)
    // This ensures users enter prices in the major currency unit
    if (quoteSummary?.currency && currencyName) {
      const normalizedCurrency = normalizeCurrency(quoteSummary.currency);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue(currencyName, normalizedCurrency as any);
    }
  };

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="-mt-2">
          <FormLabel>{label}</FormLabel>
          <FormControl>
            {isManualAsset ? (
              <Input
                placeholder="Enter symbol"
                className="h-10"
                {...field}
                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                aria-label={label}
              />
            ) : (
              <TickerSearchInput
                onSelectResult={(symbol, quoteSummary) =>
                  handleTickerSelect(symbol, quoteSummary, field.onChange)
                }
                value={field.value}
                defaultCurrency={defaultCurrency}
                aria-label={label}
              />
            )}
          </FormControl>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}
