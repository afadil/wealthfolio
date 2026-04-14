import TickerSearchInput from "@/components/ticker-search";
import { buildOccSymbol, parseOccSymbol } from "@/lib/occ-symbol";
import type { SymbolSearchResult } from "@/lib/types";
import { normalizeCurrency } from "@/lib/utils";
import { resolveSymbolQuote } from "@/adapters";
import { Input } from "@wealthfolio/ui/components/ui/input";
import {
  DatePickerInput,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@wealthfolio/ui";
import { useEffect, useRef } from "react";
import { useFormContext, type FieldPath, type FieldValues } from "react-hook-form";
import { useTranslation } from "react-i18next";

interface OptionContractFieldsProps<TFieldValues extends FieldValues = FieldValues> {
  underlyingName: FieldPath<TFieldValues>;
  strikePriceName: FieldPath<TFieldValues>;
  expirationDateName: FieldPath<TFieldValues>;
  optionTypeName: FieldPath<TFieldValues>;
  /** Field name for currency — set from underlying ticker search result */
  currencyName?: FieldPath<TFieldValues>;
  /** Field name for exchangeMic — set from underlying ticker search result */
  exchangeMicName?: FieldPath<TFieldValues>;
  /** Field name for symbol quote currency hint — confirmed via resolveSymbolQuote */
  quoteCcyName?: FieldPath<TFieldValues>;
  /** Field name for unit price — pre-filled with option premium from provider */
  unitPriceName?: FieldPath<TFieldValues>;
}

export function OptionContractFields<TFieldValues extends FieldValues = FieldValues>({
  underlyingName,
  strikePriceName,
  expirationDateName,
  optionTypeName,
  currencyName,
  exchangeMicName,
  quoteCcyName,
  unitPriceName,
}: OptionContractFieldsProps<TFieldValues>) {
  const { t, i18n } = useTranslation("common");
  const { control, setValue, getValues, watch } = useFormContext<TFieldValues>();
  const latestResolveRequestId = useRef(0);
  const needsCurrencyConfirmation = useRef(false);
  const provisionalCurrency = useRef<string | undefined>(undefined);

  const underlying = watch(underlyingName) as string | undefined;
  const strikePrice = watch(strikePriceName) as number | undefined;
  const expirationDate = watch(expirationDateName) as string | undefined;
  const optionType = watch(optionTypeName) as string | undefined;

  const expirationDisplay = expirationDate
    ? new Date(expirationDate + "T12:00:00").toLocaleDateString(i18n.language, {
        month: "short",
        day: "numeric",
      })
    : undefined;
  const hasContractSummary = strikePrice && expirationDate && optionType;

  const handleUnderlyingSelect = (symbol: string, searchResult?: SymbolSearchResult) => {
    const upper = symbol.toUpperCase();

    const parsed = parseOccSymbol(upper);
    if (parsed) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue(underlyingName, parsed.underlying as any, {
        shouldValidate: true,
        shouldDirty: true,
      });
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

    if (quoteCcyName && searchResult?.currency) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue(quoteCcyName, searchResult.currency as any);
    }

    needsCurrencyConfirmation.current =
      !!currencyName &&
      !!searchResult &&
      searchResult.currencySource === "exchange_inferred" &&
      !searchResult.isExisting;
    provisionalCurrency.current = searchResult?.currency?.trim();
  };

  useEffect(() => {
    if (!underlying || !strikePrice || !expirationDate || !optionType) return;
    if (optionType !== "CALL" && optionType !== "PUT") return;

    latestResolveRequestId.current += 1;
    const requestId = latestResolveRequestId.current;

    const occSymbol = buildOccSymbol(underlying, expirationDate, optionType, strikePrice);
    const exchangeMic = exchangeMicName
      ? (getValues(exchangeMicName) as string | undefined)
      : undefined;

    resolveSymbolQuote(occSymbol, exchangeMic, "OPTION")
      .then((resolved) => {
        if (requestId !== latestResolveRequestId.current) return;

        const confirmedCurrency = resolved?.currency?.trim();
        if (confirmedCurrency && quoteCcyName) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setValue(quoteCcyName, confirmedCurrency as any);
        }

        if (needsCurrencyConfirmation.current && confirmedCurrency && currencyName) {
          const current = getValues(currencyName);
          if (current === provisionalCurrency.current) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setValue(currencyName, confirmedCurrency as any, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
        }

        if (resolved?.price != null && unitPriceName) {
          const currentPrice = getValues(unitPriceName);
          if (!currentPrice) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setValue(unitPriceName, resolved.price as any, { shouldDirty: true });
          }
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underlying, strikePrice, expirationDate, optionType]);

  return (
    <div className="space-y-4">
      <h4 className="text-muted-foreground text-sm font-medium">{t("activity.form.option.section_title")}</h4>

      <FormField
        control={control}
        name={underlyingName}
        render={({ field }) => (
          <FormItem className="-mt-2">
            <FormLabel>{t("activity.form.option.symbol_label")}</FormLabel>
            <FormControl>
              <TickerSearchInput
                onSelectResult={handleUnderlyingSelect}
                value={field.value as string}
                placeholder={t("activity.form.option.symbol_placeholder")}
              />
            </FormControl>
            <FormMessage className="text-xs" />
            {!field.value && (
              <p className="text-muted-foreground text-xs">{t("activity.form.option.symbol_hint")}</p>
            )}
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={optionTypeName}
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => field.onChange("CALL")}
                  className={`flex cursor-pointer items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-colors ${
                    field.value === "CALL"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                    <path
                      d="M2 12L6 6L10 9L14 3"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  CALL
                </button>
                <button
                  type="button"
                  onClick={() => field.onChange("PUT")}
                  className={`flex cursor-pointer items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-colors ${
                    field.value === "PUT"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                    <path
                      d="M2 4L6 10L10 7L14 13"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  PUT
                </button>
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={control}
          name={strikePriceName}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("activity.form.option.strike_price")}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  {...field}
                  value={(field.value as number) ?? ""}
                  onChange={(e) =>
                    field.onChange(e.target.value ? Number(e.target.value) : undefined)
                  }
                  className="h-10"
                  aria-label={t("activity.form.option.strike_price")}
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
              <FormLabel>{t("activity.form.option.expiration")}</FormLabel>
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

      {hasContractSummary && (
        <div className="bg-muted/50 border-border rounded-md border px-3 py-2">
          <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
            {t("activity.form.option.contract_summary")}
          </span>
          <p className="text-sm font-medium tabular-nums">
            {expirationDisplay} ${strikePrice} {optionType}
          </p>
        </div>
      )}
    </div>
  );
}
