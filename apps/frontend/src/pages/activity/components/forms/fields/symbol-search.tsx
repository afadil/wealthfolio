import TickerSearchInput from "@/components/ticker-search";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@wealthfolio/ui";
import { DataSource, QuoteMode } from "@/lib/constants";
import type { SymbolSearchResult } from "@/lib/types";
import { useRef, useState } from "react";
import { useFormContext, type FieldPath, type FieldValues } from "react-hook-form";
import { resolveSymbolQuote } from "@/adapters";

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

/**
 * Normalize crypto pair symbols (e.g., "BTC-CAD" -> "BTC").
 * Canonical crypto IDs use base symbol + quote currency.
 */
function stripCryptoQuoteSuffix(symbol: string, currencyHint?: string): string {
  const trimmed = symbol.trim();
  const match = /^(.*)-([A-Za-z]{3,5})$/.exec(trimmed);
  if (!match) return trimmed;
  const base = match[1]?.trim();
  const quote = match[2]?.trim().toUpperCase();
  const hint = currencyHint?.trim().toUpperCase();
  if (hint && quote && quote !== hint) {
    return trimmed;
  }
  return base || trimmed;
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
  /** Field name for quoteMode (optional, to set manual pricing for custom assets) */
  quoteModeName?: FieldPath<TFieldValues>;
  /** Field name for currency (optional, to set currency from search result) */
  currencyName?: FieldPath<TFieldValues>;
  /** Field name for symbol quote currency hint (optional, e.g. "GBp") */
  quoteCcyName?: FieldPath<TFieldValues>;
  /** Field name for symbol instrument type hint (optional, e.g. "EQUITY") */
  instrumentTypeName?: FieldPath<TFieldValues>;
  /** Field name for assetMetadata (optional, to capture asset name for custom assets) */
  assetMetadataName?: FieldPath<TFieldValues>;
}

export function SymbolSearch<TFieldValues extends FieldValues = FieldValues>({
  name,
  isManualAsset = false,
  label = "Symbol",
  defaultCurrency,
  exchangeMicName,
  quoteModeName,
  currencyName,
  quoteCcyName,
  instrumentTypeName,
  assetMetadataName,
}: SymbolSearchProps<TFieldValues>) {
  const { control, setValue, watch, getValues } = useFormContext<TFieldValues>();
  const [quoteDisplay, setQuoteDisplay] = useState<{
    price: number | null;
    isLoading: boolean;
  } | null>(null);
  const latestResolveRequestId = useRef(0);
  const selectedExchangeMic = exchangeMicName
    ? (watch(exchangeMicName as any) as string | undefined)
    : undefined;
  const displayCurrency = quoteCcyName
    ? (watch(quoteCcyName as any) as string | undefined)
    : undefined;

  const handleAssetSelect = (symbol: string, searchResult: SymbolSearchResult | undefined) => {
    latestResolveRequestId.current += 1;
    const requestId = latestResolveRequestId.current;
    const isManualAsset = searchResult?.dataSource === DataSource.MANUAL;

    // Set quote mode for manual/custom assets
    if (isManualAsset && quoteModeName) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue(quoteModeName, QuoteMode.MANUAL as any);
    }

    // Normalize symbol for canonical ID generation:
    // - Securities: strip Yahoo suffix when exchangeMic exists (e.g., "VFV.TO" -> "VFV")
    // - Crypto: strip quote suffix (e.g., "BTC-CAD" -> "BTC")
    // Backend generates canonical IDs (SEC:{symbol}:{mic}, CRYPTO:{symbol}:{currency})
    const withoutExchangeSuffix = searchResult?.exchangeMic ? stripExchangeSuffix(symbol) : symbol;
    const baseSymbol =
      searchResult?.assetKind?.toUpperCase() === "CRYPTO"
        ? stripCryptoQuoteSuffix(withoutExchangeSuffix, searchResult?.currency)
        : withoutExchangeSuffix;
    const canonicalSymbol = baseSymbol.trim().toUpperCase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setValue(name, canonicalSymbol as any, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });

    // Capture exchangeMic for canonical asset ID generation
    if (exchangeMicName) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue(exchangeMicName, (searchResult?.exchangeMic ?? undefined) as any);
    }

    // Symbol-based activities should prioritize the selected asset quote currency.
    // If provider/search result includes currency, set activity currency from symbol.
    if (currencyName) {
      const rawCurrency = searchResult?.currency?.trim();
      if (rawCurrency) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setValue(currencyName, rawCurrency as any, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    }

    if (quoteCcyName) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue(quoteCcyName, (searchResult?.currency ?? undefined) as any);
    }

    // Background quote resolution: confirm inferred currency and show display quote
    const needsCurrencyConfirmation =
      currencyName && searchResult?.currencySource === "exchange_inferred";

    if (searchResult && !searchResult.isExisting) {
      setQuoteDisplay({ price: null, isLoading: true });
      const provisionalCurrency = searchResult.currency?.trim();
      resolveSymbolQuote(searchResult.symbol, searchResult.exchangeMic, searchResult.quoteType)
        .then((resolved) => {
          if (requestId !== latestResolveRequestId.current) return;
          setQuoteDisplay({ price: resolved?.price ?? null, isLoading: false });

          // Update currency if it was exchange-inferred and user hasn't changed it
          if (needsCurrencyConfirmation && resolved?.currency) {
            const confirmedCurrency = resolved.currency?.trim();
            if (confirmedCurrency) {
              const current = getValues(currencyName!);
              if (current === provisionalCurrency) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setValue(currencyName!, confirmedCurrency as any, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
                if (quoteCcyName) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  setValue(quoteCcyName, resolved.currency as any);
                }
              }
            }
          }
        })
        .catch(() => {
          if (requestId !== latestResolveRequestId.current) return;
          setQuoteDisplay({ price: null, isLoading: false });
        });
    } else {
      setQuoteDisplay(null);
    }

    if (instrumentTypeName) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue(instrumentTypeName, (searchResult?.quoteType ?? undefined) as any);
    }

    // Capture asset name and kind for custom assets (backend uses this when creating the asset)
    // Set the nested fields directly so they match the registered hidden input paths
    if (isManualAsset && assetMetadataName) {
      if (searchResult?.longName) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setValue(`${assetMetadataName}.name` as any, searchResult.longName as any, {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        });
      }
      if (searchResult?.assetKind) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setValue(`${assetMetadataName}.kind` as any, searchResult.assetKind as any, {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        });
      }
    }
  };

  const handleClear = () => {
    latestResolveRequestId.current += 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setValue(name, "" as any, { shouldValidate: true, shouldDirty: true });
    if (exchangeMicName) setValue(exchangeMicName, undefined as any);
    if (currencyName) setValue(currencyName, "" as any);
    if (quoteCcyName) setValue(quoteCcyName, undefined as any);
    if (instrumentTypeName) setValue(instrumentTypeName, undefined as any);
    setQuoteDisplay(null);
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
                data-testid="symbol-input"
              />
            ) : (
              <TickerSearchInput
                onSelectResult={handleAssetSelect}
                value={field.value}
                defaultCurrency={defaultCurrency}
                selectedExchangeMic={selectedExchangeMic}
                quoteInfo={
                  quoteDisplay ? { ...quoteDisplay, currency: displayCurrency } : undefined
                }
                onClear={handleClear}
                aria-label={label}
                data-testid="symbol-search"
              />
            )}
          </FormControl>
          <FormMessage className="text-xs" />
        </FormItem>
      )}
    />
  );
}
