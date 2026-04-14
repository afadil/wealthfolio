import { getExchanges } from "@/adapters";
import TickerSearchInput from "@/components/ticker-search";
import { useSettingsContext } from "@/lib/settings-provider";
import type { NewAsset, SymbolSearchResult } from "@/lib/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { CurrencyInput, SearchableSelect } from "@wealthfolio/ui";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wealthfolio/ui/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@wealthfolio/ui/components/ui/form";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Input } from "@wealthfolio/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui/components/ui/select";
import { Textarea } from "@wealthfolio/ui/components/ui/textarea";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

/** Map search result quoteType to our InstrumentType form values.
 *  Returns null for unrecognized types so the caller can fall back to manual mode. */
function mapQuoteTypeToInstrumentType(quoteType: string): string | null {
  switch (quoteType.toUpperCase()) {
    case "EQUITY":
    case "ETF":
    case "MUTUALFUND":
    case "INDEX":
    case "ECNQUOTE":
      return "EQUITY";
    case "CRYPTOCURRENCY":
      return "CRYPTO";
    case "BOND":
    case "MONEYMARKET":
      return "BOND";
    case "OPTION":
      return "OPTION";
    default:
      return null;
  }
}

const createSecuritySchema = z.object({
  symbol: z
    .string()
    .min(1, "Symbol is required")
    .max(20, "Symbol must be 20 characters or less")
    .transform((val) => val.toUpperCase().trim()),
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  instrumentType: z.string().min(1, "Instrument type is required"),
  quoteCcy: z.string().min(1, "Currency is required"),
  quoteMode: z.enum(["MANUAL", "MARKET"]),
  instrumentExchangeMic: z.string().optional(),
  notes: z.string().optional(),
});

type CreateSecurityFormValues = z.infer<typeof createSecuritySchema>;

const normalizeMic = (mic?: string | null): string => mic?.trim().toUpperCase() ?? "";

interface CreateSecurityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: NewAsset) => void;
  isPending?: boolean;
  initialAsset?: Partial<NewAsset>;
  title?: string;
  description?: string;
  submitLabel?: string;
}

export function CreateSecurityDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending = false,
  initialAsset,
  title,
  description,
  submitLabel,
}: CreateSecurityDialogProps) {
  const { t } = useTranslation();
  const { settings } = useSettingsContext();
  const resolvedTitle = title ?? t("settings.securities.dialog.add_title");
  const resolvedDescription = description ?? t("settings.securities.dialog.add_description");
  const resolvedSubmitLabel = submitLabel ?? t("settings.securities.dialog.create_submit");
  const instrumentTypeOptions = useMemo(
    () => [
      { value: "EQUITY", label: t("settings.securities.dialog.type_equity") },
      { value: "CRYPTO", label: t("settings.securities.dialog.type_crypto") },
      { value: "BOND", label: t("settings.securities.dialog.type_bond") },
      { value: "OPTION", label: t("settings.securities.dialog.type_option") },
      { value: "FX", label: t("settings.securities.dialog.type_fx") },
      { value: "METAL", label: t("settings.securities.dialog.type_metal") },
    ],
    [t],
  );
  const quoteModeOptions = useMemo(
    () => [
      { value: "MANUAL", label: t("settings.securities.dialog.quote_mode_manual") },
      { value: "MARKET", label: t("settings.securities.dialog.quote_mode_market") },
    ],
    [t],
  );

  const defaultCurrency = settings?.baseCurrency || "USD";
  const [selectedResult, setSelectedResult] = useState<SymbolSearchResult | undefined>();

  const { data: exchanges = [] } = useQuery({
    queryKey: ["exchanges"],
    queryFn: getExchanges,
    staleTime: Infinity,
  });

  const exchangeOptions = useMemo(
    () =>
      exchanges.map((e) => ({
        value: normalizeMic(e.mic),
        label: `${e.longName} (${e.name})`,
      })),
    [exchanges],
  );

  const defaultValues = useMemo<CreateSecurityFormValues>(
    () => ({
      symbol: (initialAsset?.instrumentSymbol || initialAsset?.displayCode || "").toUpperCase(),
      name: initialAsset?.name || initialAsset?.displayCode || initialAsset?.instrumentSymbol || "",
      instrumentType: initialAsset?.instrumentType || "EQUITY",
      quoteCcy: initialAsset?.quoteCcy || defaultCurrency,
      quoteMode: initialAsset?.quoteMode === "MARKET" ? "MARKET" : "MANUAL",
      instrumentExchangeMic: normalizeMic(initialAsset?.instrumentExchangeMic),
      notes: initialAsset?.notes || "",
    }),
    [defaultCurrency, initialAsset],
  );

  const form = useForm<CreateSecurityFormValues>({
    resolver: zodResolver(createSecuritySchema),
    defaultValues,
  });

  useEffect(() => {
    if (open) {
      setSelectedResult(undefined);
      form.reset(defaultValues);
    }
  }, [defaultValues, form, open]);

  const handleTickerSelect = useCallback(
    (_symbol: string, result?: SymbolSearchResult) => {
      if (!result) return;

      setSelectedResult(result);
      form.setValue("symbol", result.symbol.toUpperCase(), { shouldValidate: true });
      form.setValue("name", result.longName || result.shortName || "", { shouldValidate: true });

      const mappedType = result.quoteType ? mapQuoteTypeToInstrumentType(result.quoteType) : null;

      if (mappedType) {
        form.setValue("instrumentType", mappedType);
      }
      if (result.currency) {
        form.setValue("quoteCcy", result.currency, { shouldValidate: true });
      }
      if (result.exchangeMic) {
        form.setValue("instrumentExchangeMic", normalizeMic(result.exchangeMic));
      }

      // If the type is unrecognized, fall back to manual mode.
      // Otherwise auto-sync unless the result is from MANUAL source.
      if (!mappedType) {
        form.setValue("quoteMode", "MANUAL");
      } else {
        const isManual = result.dataSource === "MANUAL";
        form.setValue("quoteMode", isManual ? "MANUAL" : "MARKET");
      }
    },
    [form],
  );

  const handleSubmit = (values: CreateSecurityFormValues) => {
    const kind = values.instrumentType === "FX" ? "FX" : "INVESTMENT";

    const payload: NewAsset = {
      kind,
      name: values.name,
      displayCode: values.symbol,
      isActive: true,
      quoteMode: values.quoteMode,
      quoteCcy: values.quoteCcy,
      instrumentType: values.instrumentType,
      instrumentSymbol: values.symbol,
      instrumentExchangeMic: values.instrumentExchangeMic || undefined,
      notes: values.notes || undefined,
    };
    onSubmit(payload);
  };

  const handleDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter") return;
    if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
    // Don't submit when interacting with the ticker search popover
    const inPopover = (e.target as HTMLElement).closest("[data-radix-popper-content-wrapper]");
    if (inPopover) return;
    e.preventDefault();
    void form.handleSubmit(handleSubmit)();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{resolvedTitle}</DialogTitle>
          <DialogDescription>{resolvedDescription}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <div className="space-y-4" onKeyDown={handleDialogKeyDown}>
            {/* Ticker search - auto-populates form fields on selection */}
            {open && (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("settings.securities.dialog.search")}
                </label>
                <TickerSearchInput
                  onSelectResult={handleTickerSelect}
                  placeholder={t("settings.securities.dialog.search_placeholder")}
                  defaultCurrency={defaultCurrency}
                  autoFocusSearch
                  hideCustomCreate
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="symbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.securities.dialog.symbol")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("settings.securities.dialog.symbol_placeholder")}
                        {...field}
                        onChange={(e) => {
                          const next = e.target.value.toUpperCase();
                          if (
                            selectedResult &&
                            next.trim() !== selectedResult.symbol.toUpperCase()
                          ) {
                            setSelectedResult(undefined);
                          }
                          field.onChange(next);
                        }}
                        className="uppercase"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="instrumentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.securities.dialog.type")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("settings.securities.dialog.select_type")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {instrumentTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.securities.dialog.name")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("settings.securities.dialog.name_placeholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="quoteCcy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.securities.dialog.currency")}</FormLabel>
                    <FormControl>
                      <CurrencyInput
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={t("settings.securities.dialog.select_currency")}
                        valueDisplay="code"
                        allowCustom
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="quoteMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.securities.dialog.quote_mode")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {quoteModeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="instrumentExchangeMic"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("settings.securities.dialog.exchange")}{" "}
                    <span className="text-muted-foreground text-xs">
                      ({t("settings.securities.dialog.optional")})
                    </span>
                  </FormLabel>
                  <FormControl>
                    <SearchableSelect
                      options={exchangeOptions}
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      placeholder={t("settings.securities.dialog.select_exchange")}
                      searchPlaceholder={t("settings.securities.dialog.search_exchanges")}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t("settings.securities.dialog.notes")}{" "}
                    <span className="text-muted-foreground text-xs">
                      ({t("settings.securities.dialog.optional")})
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder={t("settings.securities.dialog.notes_placeholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                {t("settings.shared.cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => void form.handleSubmit(handleSubmit)()}
                disabled={isPending}
              >
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <Icons.Spinner className="h-4 w-4 animate-spin" />{" "}
                    {t("settings.securities.dialog.creating")}
                  </span>
                ) : (
                  resolvedSubmitLabel
                )}
              </Button>
            </DialogFooter>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
