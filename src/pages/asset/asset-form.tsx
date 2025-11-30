import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as z from "zod";

import { useMarketDataProviderSettings } from "@/pages/settings/market-data/use-market-data-settings";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Icons } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { InputTags } from "@/components/ui/tag-input";
import { Textarea } from "@/components/ui/textarea";
import { DataSource, dataSourceSchema } from "@/lib/constants";
import { UpdateAssetProfile } from "@/lib/types";
import { ResponsiveSelect, type ResponsiveSelectOption } from "@wealthvn/ui";

import { ParsedAsset, formatBreakdownTags, tagsToBreakdown } from "./asset-utils";

const assetFormSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().optional(),
  assetClass: z.string().optional(),
  assetSubClass: z.string().optional(),
  currency: z.string().min(1),
  dataSource: dataSourceSchema,
  notes: z.string().optional(),
  sectors: z.array(z.string()),
  countries: z.array(z.string()),
});

export type AssetFormValues = z.infer<typeof assetFormSchema>;

// Helper function to get display label for data source
const getDataSourceLabel = (dataSource: string, t: any): string => {
  switch (dataSource) {
    case DataSource.YAHOO:
      return t("securities.form.dataSource.options.yahoo");
    case DataSource.MANUAL:
      return t("securities.form.dataSource.options.manual");
    case DataSource.MARKET_DATA_APP:
      return t("securities.form.dataSource.options.marketDataApp");
    case DataSource.ALPHA_VANTAGE:
      return t("securities.form.dataSource.options.alphaVantage");
    case DataSource.METAL_PRICE_API:
      return t("securities.form.dataSource.options.metalPriceApi");
    case DataSource.VN_MARKET:
      return t("securities.form.dataSource.options.vnMarket");
    default:
      return dataSource;
  }
};

interface AssetFormProps {
  asset: ParsedAsset;
  onSubmit: (values: AssetFormValues) => Promise<void>;
  onCancel?: () => void;
  isSaving?: boolean;
  onDataSourceChange?: (newSource: string, currentSource: string) => Promise<boolean>;
}

export function AssetForm({
  asset,
  onSubmit,
  onCancel,
  isSaving,
  onDataSourceChange,
}: AssetFormProps) {
  const { t } = useTranslation("settings");
  const { data: providerSettings = [] } = useMarketDataProviderSettings();

  // Generate data source options based on enabled providers and original source
  const dataSourceOptions = useMemo(() => {
    const originalDataSource = (asset.dataSource as DataSource) ?? DataSource.YAHOO;
    const enabledProviderIds = providerSettings
      .filter((provider) => provider.enabled)
      .map((provider) => provider.id);

    const options: ResponsiveSelectOption[] = [];

    // Always include the original data source even if disabled (so user can see current setting)
    options.push({ label: getDataSourceLabel(originalDataSource, t), value: originalDataSource });

    // Add Manual option if it's not already the original source
    if (originalDataSource !== DataSource.MANUAL) {
      options.push({ label: getDataSourceLabel(DataSource.MANUAL, t), value: DataSource.MANUAL });
    }

    // Add enabled providers that aren't already in the list
    const allAutoProviders = [
      DataSource.YAHOO,
      DataSource.MARKET_DATA_APP,
      DataSource.ALPHA_VANTAGE,
      DataSource.METAL_PRICE_API,
      DataSource.VN_MARKET,
    ];

    allAutoProviders.forEach((provider) => {
      if (
        enabledProviderIds.includes(provider) &&
        provider !== originalDataSource &&
        !options.some((opt) => opt.value === provider)
      ) {
        options.push({ label: getDataSourceLabel(provider, t), value: provider });
      }
    });

    return options;
  }, [asset.dataSource, t, providerSettings]);

  const defaultValues: AssetFormValues = {
    symbol: asset.id,
    name: asset.name ?? "",
    assetClass: asset.assetClass ?? "",
    assetSubClass: asset.assetSubClass ?? "",
    currency: asset.currency,
    dataSource: (asset.dataSource as DataSource) ?? DataSource.YAHOO,
    notes: asset.notes ?? "",
    sectors: formatBreakdownTags(asset.sectorsList),
    countries: formatBreakdownTags(asset.countriesList),
  };

  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues,
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [asset, form]);

  const handleDataSourceChange = async (value: string) => {
    const currentDataSource = form.getValues("dataSource");

    // If there's a callback and the data source is changing, call it for confirmation
    if (onDataSourceChange && value !== currentDataSource) {
      const shouldChange = await onDataSourceChange(value, currentDataSource);
      if (shouldChange) {
        form.setValue("dataSource", value as DataSource);
      }
    } else {
      form.setValue("dataSource", value as DataSource);
    }
  };

  const handleSubmit = async (values: AssetFormValues) => {
    await onSubmit(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="symbol"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("securities.form.symbol.label")}</FormLabel>
                <FormControl>
                  <Input {...field} disabled className="bg-muted/50" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("securities.form.currency.label")}</FormLabel>
                <FormControl>
                  <Input {...field} disabled className="bg-muted/50 uppercase" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>{t("securities.form.name.label")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("securities.form.name.placeholder")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="assetClass"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("securities.form.class.label")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("securities.form.class.placeholder")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="assetSubClass"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("securities.form.subClass.label")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("securities.form.subClass.placeholder")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dataSource"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("securities.form.dataSource.label")}</FormLabel>
                <FormControl>
                  <ResponsiveSelect
                    value={field.value}
                    onValueChange={handleDataSourceChange}
                    options={dataSourceOptions}
                    placeholder={t("securities.form.dataSource.placeholder")}
                    sheetTitle={t("securities.form.dataSource.sheetTitle")}
                    sheetDescription={t("securities.form.dataSource.sheetDescription")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4">
          <FormField
            control={form.control}
            name="sectors"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("securities.form.sectors.label")}</FormLabel>
                <FormControl>
                  <InputTags
                    value={field.value}
                    onChange={(values) => field.onChange(values)}
                    placeholder={t("securities.form.sectors.placeholder")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="countries"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("securities.form.countries.label")}</FormLabel>
                <FormControl>
                  <InputTags
                    value={field.value}
                    onChange={(values) => field.onChange(values)}
                    placeholder={t("securities.form.countries.placeholder")}
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
                <FormLabel>{t("securities.form.notes.label")}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={5}
                    placeholder={t("securities.form.notes.placeholder")}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-3">
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={isSaving}>
              {t("securities.form.buttons.cancel")}
            </Button>
          ) : null}
          <Button type="submit" disabled={isSaving || form.formState.isSubmitting}>
            {isSaving || form.formState.isSubmitting ? (
              <span className="flex items-center gap-2">
                <Icons.Spinner className="h-4 w-4 animate-spin" />{" "}
                {t("securities.form.buttons.saving")}
              </span>
            ) : (
              t("securities.form.buttons.save")
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export const buildAssetUpdatePayload = (values: AssetFormValues): UpdateAssetProfile => ({
  symbol: values.symbol,
  name: values.name || "",
  sectors: values.sectors.length ? JSON.stringify(tagsToBreakdown(values.sectors)) : "",
  countries: values.countries.length ? JSON.stringify(tagsToBreakdown(values.countries)) : "",
  notes: values.notes ?? "",
  assetSubClass: values.assetSubClass || "",
  assetClass: values.assetClass || "",
});
