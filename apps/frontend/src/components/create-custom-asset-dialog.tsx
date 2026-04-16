import { useSettingsContext } from "@/lib/settings-provider";
import type { SymbolSearchResult } from "@/lib/types";
import i18n from "@/i18n/i18n";
import { zodResolver } from "@hookform/resolvers/zod";
import { CurrencyInput } from "@wealthfolio/ui";
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
import { Input } from "@wealthfolio/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui/components/ui/select";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

function createCustomAssetSchema() {
  return z.object({
    symbol: z
      .string()
      .min(1, { message: i18n.t("custom_asset.validation.symbol_required") })
      .max(20, { message: i18n.t("custom_asset.validation.symbol_max") })
      .transform((val) => val.toUpperCase().trim()),
    name: z
      .string()
      .min(1, { message: i18n.t("custom_asset.validation.name_required") })
      .max(100, { message: i18n.t("custom_asset.validation.name_max") }),
    assetType: z.enum(["EQUITY", "CRYPTO", "BOND", "OPTION", "METAL", "OTHER"]),
    currency: z.string().min(1, { message: i18n.t("custom_asset.validation.currency_required") }),
  });
}

type CustomAssetFormValues = z.infer<ReturnType<typeof createCustomAssetSchema>>;

interface CreateCustomAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssetCreated: (searchResult: SymbolSearchResult) => void;
  defaultSymbol?: string;
  defaultCurrency?: string;
}

export function CreateCustomAssetDialog({
  open,
  onOpenChange,
  onAssetCreated,
  defaultSymbol = "",
  defaultCurrency,
}: CreateCustomAssetDialogProps) {
  const { t, i18n: i18next } = useTranslation("common");
  const customAssetSchema = useMemo(() => createCustomAssetSchema(), [i18next.language]);

  const assetTypeOptions = useMemo(
    () =>
      [
        { value: "EQUITY" as const, label: t("custom_asset.type.equity") },
        { value: "CRYPTO" as const, label: t("custom_asset.type.crypto") },
        { value: "BOND" as const, label: t("custom_asset.type.bond") },
        { value: "OPTION" as const, label: t("custom_asset.type.option") },
        { value: "METAL" as const, label: t("custom_asset.type.metal") },
        { value: "OTHER" as const, label: t("custom_asset.type.other") },
      ] as const,
    [t],
  );

  const { settings } = useSettingsContext();

  const currency = defaultCurrency || settings?.baseCurrency || "USD";

  const form = useForm<CustomAssetFormValues>({
    resolver: zodResolver(customAssetSchema),
    defaultValues: {
      symbol: defaultSymbol.toUpperCase(),
      name: "",
      assetType: "EQUITY",
      currency,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        symbol: defaultSymbol.toUpperCase(),
        name: "",
        assetType: "EQUITY",
        currency,
      });
    }
  }, [open, currency, defaultSymbol, form]);

  const handleSubmit = (values: CustomAssetFormValues) => {
    const searchResult: SymbolSearchResult = {
      symbol: values.symbol,
      longName: values.name,
      shortName: values.name,
      exchange: "MANUAL",
      quoteType:
        values.assetType === "CRYPTO"
          ? "CRYPTOCURRENCY"
          : values.assetType === "OTHER"
            ? "OTHER"
            : values.assetType,
      index: "MANUAL",
      typeDisplay: "Custom Asset",
      dataSource: "MANUAL",
      score: 0,
      currency: values.currency,
      assetKind: values.assetType === "OTHER" ? "OTHER" : "INVESTMENT",
    };

    onAssetCreated(searchResult);
    onOpenChange(false);
    form.reset();
  };

  const handleCancel = () => {
    onOpenChange(false);
    form.reset();
  };

  const handleCreateClick = () => {
    void form.handleSubmit(handleSubmit)();
  };

  const handleDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter") return;
    if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
    e.preventDefault();
    void form.handleSubmit(handleSubmit)();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("symbol.selector.mobile.custom_asset_title")}</DialogTitle>
          <DialogDescription>{t("custom_asset.dialog.description")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <div className="space-y-4" onKeyDown={handleDialogKeyDown}>
            <FormField
              control={form.control}
              name="symbol"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("symbol.selector.mobile.symbol_label")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("symbol.selector.mobile.symbol_placeholder")}
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      className="uppercase"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("symbol.selector.mobile.name_label")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("symbol.selector.mobile.name_placeholder")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="assetType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("symbol.selector.mobile.asset_type")}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("custom_asset.dialog.select_type")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {assetTypeOptions.map((option) => (
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

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("activity.form.fields.currency")}</FormLabel>
                    <FormControl>
                      <CurrencyInput {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={handleCancel}>
                {t("activity.form.cancel")}
              </Button>
              <Button type="button" onClick={handleCreateClick}>
                {t("symbol.selector.mobile.create_asset")}
              </Button>
            </DialogFooter>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
