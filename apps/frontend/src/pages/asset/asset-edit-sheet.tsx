import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  ResponsiveSelect,
  type ResponsiveSelectOption,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Label,
  Alert,
  AlertDescription,
} from "@wealthfolio/ui";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@wealthfolio/ui/components/ui/form";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Textarea } from "@wealthfolio/ui/components/ui/textarea";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@wealthfolio/ui/components/ui/tabs";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Skeleton } from "@wealthfolio/ui/components/ui/skeleton";
import { TickerAvatar } from "@/components/ticker-avatar";
import { SingleSelectTaxonomy } from "@/components/classification/single-select-taxonomy";
import { MultiSelectTaxonomy } from "@/components/classification/multi-select-taxonomy";
import { useTaxonomies } from "@/hooks/use-taxonomies";
import { EDITABLE_ASSET_KINDS, ASSET_KIND_DISPLAY_NAMES, type AssetKind } from "@/lib/constants";
import type { Asset, Quote } from "@/lib/types";
import { formatAmount } from "@/lib/utils";
import { useAssetProfileMutations } from "./hooks/use-asset-profile-mutations";

const PROVIDERS = [
  { value: "YAHOO", label: "Yahoo Finance" },
  { value: "ALPHA_VANTAGE", label: "Alpha Vantage" },
  { value: "FINNHUB", label: "Finnhub" },
  { value: "MARKETDATA_APP", label: "MarketData.app" },
] as const;

// Schema for a single provider override (type is derived from asset kind)
const providerOverrideSchema = z.object({
  provider: z.string(),
  symbol: z.string(),
});

// Derive override type from asset kind
function getOverrideTypeForKind(kind: string): "equity_symbol" | "crypto_symbol" | "fx_symbol" {
  switch (kind) {
    case "CRYPTO":
      return "crypto_symbol";
    case "FX_RATE":
      return "fx_symbol";
    default:
      return "equity_symbol";
  }
}

// PricingMode values matching Rust enum
const PricingMode = {
  MARKET: "MARKET",
  MANUAL: "MANUAL",
  DERIVED: "DERIVED",
  NONE: "NONE",
} as const;

type PricingMode = (typeof PricingMode)[keyof typeof PricingMode];

const assetFormSchema = z.object({
  name: z.string().optional(),
  notes: z.string().optional(),
  kind: z.string().optional(),
  exchangeMic: z.string().optional(),
  pricingMode: z.enum([PricingMode.MARKET, PricingMode.MANUAL]),
  providerOverrides: z.array(providerOverrideSchema).optional(),
});

type AssetFormValues = z.infer<typeof assetFormSchema>;
type ProviderOverride = z.infer<typeof providerOverrideSchema>;

// Convert asset kind options from constants
const kindOptions: ResponsiveSelectOption[] = EDITABLE_ASSET_KINDS.map((kind) => ({
  label: ASSET_KIND_DISPLAY_NAMES[kind],
  value: kind,
}));

// Helper to convert provider_overrides JSON to array format for the form
function parseProviderOverrides(
  overrides: Record<string, unknown> | null | undefined,
): ProviderOverride[] {
  if (!overrides) return [];
  const result: ProviderOverride[] = [];
  for (const [provider, value] of Object.entries(overrides)) {
    if (typeof value === "object" && value !== null) {
      const obj = value as Record<string, unknown>;
      const symbol = obj.symbol as string;
      if (symbol) {
        result.push({ provider, symbol });
      }
    }
  }
  return result;
}

// Helper to convert form array back to JSON format (type is derived from asset kind)
function serializeProviderOverrides(
  overrides: ProviderOverride[],
  assetKind: string,
): Record<string, unknown> | null {
  if (!overrides || overrides.length === 0) return null;
  const overrideType = getOverrideTypeForKind(assetKind);
  const result: Record<string, unknown> = {};
  for (const override of overrides) {
    if (override.provider && override.symbol) {
      result[override.provider] = {
        type: overrideType,
        symbol: override.symbol,
      };
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

type EditTab = "general" | "classification" | "market-data";

// Extracted component for pricing mode toggle with controlled popover
// Uses "Automatic Updates" toggle: ON = automatic, OFF = manual (more intuitive)
function PricingModeToggle({
  isManualMode,
  onConfirm,
}: {
  isManualMode: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isAutomatic = !isManualMode;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <Label className="text-sm font-medium">Automatic Updates</Label>
          <p className="text-muted-foreground text-xs">
            {isAutomatic
              ? "Prices sync automatically from market data providers."
              : "Automatic syncing is off. You manage prices manually."}
          </p>
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="shrink-0">
              <Switch checked={isAutomatic} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[360px] p-4" align="end">
            <div className="space-y-4">
              <h4 className="font-medium">
                {isAutomatic ? "Disable Automatic Updates?" : "Enable Automatic Updates?"}
              </h4>
              {isAutomatic ? (
                <>
                  <p className="text-muted-foreground text-sm">
                    Turning this off will stop automatic price updates. You'll need to enter and
                    maintain price data yourself.
                  </p>
                  <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                    Automatic price updates will be disabled.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground text-sm">
                    Turning this on will enable price fetching from market data providers. Your
                    manually entered quotes will be preserved but may be overwritten on sync.
                  </p>
                  <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                    Manual quotes may be replaced by provider data.
                  </p>
                </>
              )}
              <div className="flex justify-end space-x-2">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    onConfirm();
                    setOpen(false);
                  }}
                >
                  Confirm
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

interface AssetEditSheetProps {
  asset: Asset | null;
  latestQuote?: Quote | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: EditTab;
}

export function AssetEditSheet({
  asset,
  latestQuote,
  open,
  onOpenChange,
  defaultTab = "general",
}: AssetEditSheetProps) {
  const [activeTab, setActiveTab] = useState<EditTab>(defaultTab);
  const { data: taxonomies = [], isLoading: isTaxonomiesLoading } = useTaxonomies();
  const { updateAssetProfileMutation } = useAssetProfileMutations();

  // Split taxonomies by selection type
  const { singleSelectTaxonomies, multiSelectTaxonomies } = useMemo(() => {
    const sorted = [...taxonomies].sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      singleSelectTaxonomies: sorted.filter((t) => t.isSingleSelect),
      multiSelectTaxonomies: sorted.filter((t) => !t.isSingleSelect),
    };
  }, [taxonomies]);

  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: {
      name: asset?.name ?? "",
      notes: asset?.notes ?? "",
      kind: asset?.kind ?? "SECURITY",
      exchangeMic: asset?.exchangeMic ?? "",
      pricingMode: asset?.pricingMode === "MANUAL" ? PricingMode.MANUAL : PricingMode.MARKET,
      providerOverrides: parseProviderOverrides(
        asset?.providerOverrides as Record<string, unknown> | null,
      ),
    },
  });

  const {
    fields: overrideFields,
    append: appendOverride,
    remove: removeOverride,
  } = useFieldArray({
    control: form.control,
    name: "providerOverrides",
  });

  // Reset form when asset changes
  useEffect(() => {
    if (asset) {
      form.reset({
        name: asset.name ?? "",
        notes: asset.notes ?? "",
        kind: asset.kind ?? "SECURITY",
        exchangeMic: asset.exchangeMic ?? "",
        pricingMode: asset.pricingMode === "MANUAL" ? PricingMode.MANUAL : PricingMode.MARKET,
        providerOverrides: parseProviderOverrides(
          asset.providerOverrides as Record<string, unknown> | null,
        ),
      });
    }
  }, [asset, form]);

  // Reset tab when sheet opens
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
    }
  }, [open, defaultTab]);

  const handleSave = useCallback(
    async (values: AssetFormValues) => {
      if (!asset) return;

      // Serialize provider overrides back to JSON format (type derived from asset kind)
      const assetKind = values.kind ?? asset.kind ?? "SECURITY";
      const serializedOverrides = serializeProviderOverrides(
        values.providerOverrides ?? [],
        assetKind,
      );

      try {
        // Update profile with all fields including pricing mode
        await updateAssetProfileMutation.mutateAsync({
          id: asset.id,
          symbol: asset.symbol,
          name: values.name || "",
          notes: values.notes ?? "",
          kind: values.kind as AssetKind | undefined,
          exchangeMic: values.exchangeMic || null,
          pricingMode: values.pricingMode,
          providerOverrides: serializedOverrides,
        });

        onOpenChange(false);
      } catch {
        // Error toast is shown by mutation's onError callback
        // Keep sheet open so user can retry
      }
    },
    [asset, updateAssetProfileMutation, onOpenChange],
  );

  const isManualMode = form.watch("pricingMode") === PricingMode.MANUAL;
  const isSaving = updateAssetProfileMutation.isPending;

  // Check if current asset kind is system-managed (shouldn't allow editing)
  const isSystemManagedKind = asset?.kind === "CASH" || asset?.kind === "FX_RATE";

  if (!asset) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex h-full w-full flex-col sm:max-w-2xl">
        <SheetHeader className="shrink-0 pb-4">
          <div className="flex items-center gap-3">
            <TickerAvatar symbol={asset.symbol} className="size-10" />
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-lg">{asset.symbol}</SheetTitle>
              <SheetDescription className="truncate text-sm">
                {asset.name || "Edit asset"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as EditTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="classification">Classification</TabsTrigger>
            <TabsTrigger value="market-data">Market Data</TabsTrigger>
          </TabsList>

          <div className="min-h-0 flex-1 overflow-y-auto pt-4">
            {/* General Tab */}
            <TabsContent value="general" className="mt-0 h-full">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSave)} className="space-y-6">
                  {/* Read-only fields */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Symbol</label>
                      <Input value={asset.symbol} disabled className="bg-muted/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Currency</label>
                      <Input value={asset.currency} disabled className="bg-muted/50 uppercase" />
                    </div>
                  </div>

                  {/* Editable fields */}
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
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
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea rows={10} placeholder="Add any context or links" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Asset Type and Exchange */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="kind"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Asset Type</FormLabel>
                          <FormControl>
                            <ResponsiveSelect
                              value={field.value ?? "SECURITY"}
                              onValueChange={field.onChange}
                              options={kindOptions}
                              placeholder="Select type"
                              sheetTitle="Asset Type"
                              sheetDescription="Select the type of asset"
                              disabled={isSystemManagedKind}
                              triggerClassName="h-11"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="exchangeMic"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Exchange (MIC)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., XNYS, XTSE"
                              {...field}
                              className="uppercase"
                            />
                          </FormControl>
                          <p className="text-muted-foreground text-xs">
                            ISO 10383 Market Identifier Code
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onOpenChange(false)}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? (
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
            </TabsContent>

            {/* Classification Tab */}
            <TabsContent value="classification" className="mt-0 h-full">
              <div className="space-y-8 pb-8">
                {isTaxonomiesLoading && <ClassificationSkeleton />}

                {!isTaxonomiesLoading &&
                  singleSelectTaxonomies.length === 0 &&
                  multiSelectTaxonomies.length === 0 && (
                    <div className="py-8 text-center">
                      <p className="text-muted-foreground text-sm">
                        No taxonomies configured. Create taxonomies in Settings to classify assets.
                      </p>
                    </div>
                  )}

                {!isTaxonomiesLoading &&
                  singleSelectTaxonomies.map((taxonomy) => (
                    <SingleSelectTaxonomy
                      key={taxonomy.id}
                      taxonomyId={taxonomy.id}
                      assetId={asset.id}
                      label={taxonomy.name}
                    />
                  ))}

                {!isTaxonomiesLoading &&
                  multiSelectTaxonomies.map((taxonomy) => (
                    <MultiSelectTaxonomy
                      key={taxonomy.id}
                      taxonomyId={taxonomy.id}
                      assetId={asset.id}
                      label={taxonomy.name}
                    />
                  ))}
              </div>
            </TabsContent>

            {/* Market Data Tab */}
            <TabsContent value="market-data" className="mt-0 h-full">
              <div className="space-y-6 pb-8">
                <Form {...form}>
                  <div className="space-y-6">
                    {/* Latest Quote Card - First */}
                    <div className="bg-muted/30 rounded-lg border p-4">
                      {latestQuote ? (
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-xl font-semibold">
                              {formatAmount(latestQuote.close, latestQuote.currency)}
                            </p>
                            <p className="text-muted-foreground text-xs">Latest price</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {new Date(latestQuote.timestamp).toLocaleDateString()}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {new Date(latestQuote.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                          <div>
                            <Badge variant="secondary" className="text-xs">
                              {latestQuote.dataSource}
                            </Badge>
                            <p className="text-muted-foreground mt-1 text-xs">Source</p>
                          </div>
                        </div>
                      ) : (
                        <Alert variant="destructive" className="border-0 bg-transparent p-0">
                          <Icons.AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            Unable to fetch price data for this asset. Check if the symbol is
                            correct or try adding a symbol mapping below.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>

                    {/* Pricing Mode Toggle Card */}
                    <PricingModeToggle
                      isManualMode={isManualMode}
                      onConfirm={() => {
                        form.setValue(
                          "pricingMode",
                          isManualMode ? PricingMode.MARKET : PricingMode.MANUAL,
                        );
                      }}
                    />

                    {/* Symbol Mapping - Only show for automatic pricing */}
                    {!isManualMode && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-sm font-medium">Symbol Mapping</label>
                            <p className="text-muted-foreground text-xs">
                              Use a different ticker for specific providers if the default doesn't
                              work.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => appendOverride({ provider: "YAHOO", symbol: "" })}
                          >
                            <Icons.Plus className="mr-1 h-3 w-3" />
                            Add
                          </Button>
                        </div>

                        {overrideFields.length === 0 ? (
                          <div className="rounded-lg border border-dashed p-6 text-center">
                            <Icons.Link className="text-muted-foreground/50 mx-auto h-8 w-8" />
                            <p className="text-muted-foreground mt-2 text-sm">
                              No symbol mappings configured
                            </p>
                            <p className="text-muted-foreground text-xs">
                              Using "{asset.symbol}" for all providers.
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-lg border">
                            <table className="w-full">
                              <thead>
                                <tr className="bg-muted/50 border-b">
                                  <th className="text-muted-foreground px-4 py-2 text-left text-xs font-medium">
                                    Provider
                                  </th>
                                  <th className="text-muted-foreground px-4 py-2 text-left text-xs font-medium">
                                    Symbol
                                  </th>
                                  <th className="w-10"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {overrideFields.map((field, index) => (
                                  <tr key={field.id} className="border-b last:border-b-0">
                                    <td className="px-4 py-2">
                                      <FormField
                                        control={form.control}
                                        name={`providerOverrides.${index}.provider`}
                                        render={({ field: providerField }) => (
                                          <FormItem className="space-y-0">
                                            <FormControl>
                                              <ResponsiveSelect
                                                value={providerField.value}
                                                onValueChange={providerField.onChange}
                                                options={PROVIDERS.map((p) => ({
                                                  label: p.label,
                                                  value: p.value,
                                                }))}
                                                placeholder="Select provider"
                                                sheetTitle="Data Provider"
                                                sheetDescription="Select the data provider for this symbol mapping"
                                              />
                                            </FormControl>
                                          </FormItem>
                                        )}
                                      />
                                    </td>
                                    <td className="px-4 py-2">
                                      <FormField
                                        control={form.control}
                                        name={`providerOverrides.${index}.symbol`}
                                        render={({ field: symbolField }) => (
                                          <FormItem className="space-y-0">
                                            <FormControl>
                                              <Input
                                                placeholder="e.g., SHOP.TO"
                                                {...symbolField}
                                                className="h-9 uppercase"
                                              />
                                            </FormControl>
                                          </FormItem>
                                        )}
                                      />
                                    </td>
                                    <td className="px-2 py-2">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => removeOverride(index)}
                                      >
                                        <Icons.Close className="h-4 w-4" />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Save Actions */}
                    <div className="flex justify-end gap-3 border-t pt-4">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={form.handleSubmit(handleSave)}
                        disabled={isSaving}
                      >
                        {isSaving ? (
                          <span className="flex items-center gap-2">
                            <Icons.Spinner className="h-4 w-4 animate-spin" /> Saving
                          </span>
                        ) : (
                          "Save changes"
                        )}
                      </Button>
                    </div>
                  </div>
                </Form>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function ClassificationSkeleton() {
  return (
    <div className="space-y-8">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={`single-${i}`} className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-7 w-16 rounded-full" />
            ))}
          </div>
        </div>
      ))}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={`multi-${i}`} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}

export default AssetEditSheet;
