import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSettingsContext } from "@/lib/settings-provider";
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
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Textarea } from "@wealthfolio/ui/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wealthfolio/ui/components/ui/collapsible";
import { Icons, CurrencyInput } from "@wealthfolio/ui";
import type { SymbolSearchResult } from "@/lib/types";

// Simplified asset types for the form
const ASSET_TYPE_OPTIONS = [
  { value: "SECURITY", label: "Security (Stock, ETF, Bond)" },
  { value: "CRYPTO", label: "Cryptocurrency" },
  { value: "OTHER", label: "Other" },
] as const;

const customAssetSchema = z.object({
  symbol: z
    .string()
    .min(1, "Symbol is required")
    .max(20, "Symbol must be 20 characters or less")
    .transform((val) => val.toUpperCase().trim()),
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less"),
  assetType: z.enum(["SECURITY", "CRYPTO", "OTHER"]),
  currency: z.string().min(1, "Currency is required"),
  notes: z.string().optional(),
  isin: z
    .string()
    .optional()
    .transform((val) => val?.trim() || undefined),
  cusip: z
    .string()
    .optional()
    .transform((val) => val?.trim() || undefined),
});

type CustomAssetFormValues = z.infer<typeof customAssetSchema>;

interface CreateCustomAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssetCreated: (quoteSummary: SymbolSearchResult) => void;
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { settings } = useSettingsContext();

  // Use provided defaultCurrency, or fall back to settings base currency
  const currency = defaultCurrency || settings?.baseCurrency || "USD";

  const form = useForm<CustomAssetFormValues>({
    resolver: zodResolver(customAssetSchema),
    defaultValues: {
      symbol: defaultSymbol.toUpperCase(),
      name: "",
      assetType: "SECURITY",
      currency,
      notes: "",
      isin: "",
      cusip: "",
    },
  });

  // Reset form with correct currency when dialog opens or currency changes
  useEffect(() => {
    if (open) {
      form.reset({
        symbol: defaultSymbol.toUpperCase(),
        name: "",
        assetType: "SECURITY",
        currency,
        notes: "",
        isin: "",
        cusip: "",
      });
    }
  }, [open, currency, defaultSymbol, form]);

  const handleSubmit = (values: CustomAssetFormValues) => {
    // Create a SymbolSearchResult-like object for the custom asset
    // The actual asset creation happens when the activity is created
    const quoteSummary: SymbolSearchResult = {
      symbol: values.symbol,
      longName: values.name,
      shortName: values.name,
      exchange: "MANUAL",
      quoteType: values.assetType === "CRYPTO" ? "CRYPTOCURRENCY" : "EQUITY",
      index: "MANUAL",
      typeDisplay: "Custom Asset",
      dataSource: "MANUAL",
      score: 0,
      // Include currency so SymbolSearch can set it in the form
      currency: values.currency,
      // We don't set exchangeMic - this will result in SEC:SYMBOL:UNKNOWN for the asset ID
    };

    onAssetCreated(quoteSummary);
    onOpenChange(false);
    form.reset();
    setShowAdvanced(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
    form.reset();
    setShowAdvanced(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Custom Asset</DialogTitle>
          <DialogDescription>
            You'll maintain prices manually, or map to a market ticker later for automatic updates.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="symbol"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Symbol / Ticker</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., MYCOIN"
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
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., My Custom Coin" {...field} />
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
                    <FormLabel>Asset Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ASSET_TYPE_OPTIONS.map((option) => (
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
                    <FormLabel>Currency</FormLabel>
                    <FormControl>
                      <CurrencyInput {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any notes about this asset..."
                      className="resize-none"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between">
                  <span className="text-muted-foreground text-sm">Advanced Options</span>
                  <Icons.ChevronDown
                    className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="isin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ISIN</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., US0378331005" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cusip"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CUSIP</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 037833100" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="submit">Create Asset</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
