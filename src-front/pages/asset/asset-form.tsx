import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@wealthfolio/ui/components/ui/form";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { InputTags } from "@wealthfolio/ui/components/ui/tag-input";
import { Textarea } from "@wealthfolio/ui/components/ui/textarea";
import { DataSource } from "@/lib/constants";
import { UpdateAssetProfile } from "@/lib/types";
import { ResponsiveSelect, type ResponsiveSelectOption } from "@wealthfolio/ui";

import { ParsedAsset, formatBreakdownTags, tagsToBreakdown } from "./asset-utils";

const assetFormSchema = z.object({
  symbol: z.string().min(1),
  symbolMapping: z.string().optional(),
  name: z.string().optional(),
  assetClass: z.string().optional(),
  assetSubClass: z.string().optional(),
  currency: z.string().min(1),
  dataSource: z.enum([DataSource.YAHOO, DataSource.MANUAL]),
  notes: z.string().optional(),
  sectors: z.array(z.string()),
  countries: z.array(z.string()),
});

export type AssetFormValues = z.infer<typeof assetFormSchema>;

const dataSourceOptions: ResponsiveSelectOption[] = [
  { label: "Yahoo Finance", value: DataSource.YAHOO },
  { label: "Manual", value: DataSource.MANUAL },
];

interface AssetFormProps {
  asset: ParsedAsset;
  onSubmit: (values: AssetFormValues) => Promise<void>;
  onCancel?: () => void;
  isSaving?: boolean;
}

export function AssetForm({ asset, onSubmit, onCancel, isSaving }: AssetFormProps) {
  const defaultValues: AssetFormValues = {
    symbol: asset.id,
    symbolMapping: asset.symbolMapping ?? "",
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
                <FormLabel>Symbol</FormLabel>
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
                <FormLabel>Currency</FormLabel>
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
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Asset display name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="symbolMapping"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Symbol mapping</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Override provider symbol (optional)"
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormDescription>
                  If set, this symbol is used to fetch quotes from your market data provider.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="assetClass"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Class</FormLabel>
                <FormControl>
                  <Input placeholder="Equity, Bond, Cash..." {...field} />
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
                <FormLabel>Sub-class</FormLabel>
                <FormControl>
                  <Input placeholder="ETF, Stock, Fund..." {...field} />
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
                <FormLabel>Data source</FormLabel>
                <FormControl>
                  <ResponsiveSelect
                    value={field.value}
                    onValueChange={field.onChange}
                    options={dataSourceOptions}
                    placeholder="Select a provider"
                    sheetTitle="Pick a data source"
                    sheetDescription="Choose how prices are loaded for this asset."
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
                <FormLabel>Sectors (use sector:weight)</FormLabel>
                <FormControl>
                  <InputTags
                    value={field.value}
                    onChange={(values) => field.onChange(values)}
                    placeholder="Technology:40%, Healthcare:20%"
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
                <FormLabel>Countries (use country:weight)</FormLabel>
                <FormControl>
                  <InputTags
                    value={field.value}
                    onChange={(values) => field.onChange(values)}
                    placeholder="United States:50%, Canada:25%"
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
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea rows={5} placeholder="Add any context or links" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-3">
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" disabled={isSaving || form.formState.isSubmitting}>
            {isSaving || form.formState.isSubmitting ? (
              <span className="flex items-center gap-2">
                <Icons.Spinner className="h-4 w-4 animate-spin" /> Saving
              </span>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export const buildAssetUpdatePayload = (values: AssetFormValues): UpdateAssetProfile => ({
  symbol: values.symbol,
  symbolMapping: values.symbolMapping?.trim() ? values.symbolMapping.trim() : null,
  name: values.name || "",
  sectors: values.sectors.length ? JSON.stringify(tagsToBreakdown(values.sectors)) : "",
  countries: values.countries.length ? JSON.stringify(tagsToBreakdown(values.countries)) : "",
  notes: values.notes ?? "",
  assetSubClass: values.assetSubClass || "",
  assetClass: values.assetClass || "",
});
