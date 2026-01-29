import { useEffect, useMemo } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@wealthfolio/ui/components/ui/form";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Textarea } from "@wealthfolio/ui/components/ui/textarea";
import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  MoneyInput,
  QuantityInput,
  DatePickerInput,
  ResponsiveSelect,
  type ResponsiveSelectOption,
} from "@wealthfolio/ui";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";

import {
  assetDetailsSchema,
  type AssetDetailsFormValues,
  getDefaultDetailsFormValues,
  formValuesToMetadata,
  PROPERTY_TYPES,
  VEHICLE_TYPES,
  COLLECTIBLE_TYPES,
  METAL_TYPES,
  WEIGHT_UNITS,
  LIABILITY_TYPES,
} from "./asset-details-sheet-schema";
import {
  AlternativeAssetKind,
  ALTERNATIVE_ASSET_KIND_DISPLAY_NAMES,
  type Holding,
} from "@/lib/types";

/**
 * Asset data required by the sheet.
 * This can be an Asset or a subset of fields from Holding that we need.
 */
export interface AssetDetailsSheetAsset {
  id: string;
  name: string;
  kind: AlternativeAssetKind;
  currency: string;
  metadata?: Record<string, unknown>;
}

interface AssetDetailsSheetProps {
  /** Whether the sheet is open */
  open: boolean;
  /** Callback when the sheet open state changes */
  onOpenChange: (open: boolean) => void;
  /** The asset to view/edit */
  asset: AssetDetailsSheetAsset | null;
  /** Callback when the user saves changes */
  onSave: (assetId: string, metadata: Record<string, string>) => Promise<void>;
  /** Optional: For displaying linked asset name for liabilities */
  linkedAssetName?: string;
  /** Optional: For liabilities, list of assets that can be linked */
  linkableAssets?: Holding[];
  /** Optional: For properties, list of liabilities linked to this asset */
  linkedLiabilities?: { id: string; name: string; balance?: string }[];
  /** Whether the save operation is in progress */
  isSaving?: boolean;
}

/**
 * A sheet/drawer component for viewing and editing asset details.
 * Displays type-specific fields based on the asset kind.
 */
export function AssetDetailsSheet({
  open,
  onOpenChange,
  asset,
  onSave,
  linkedAssetName,
  linkableAssets = [],
  linkedLiabilities = [],
  isSaving = false,
}: AssetDetailsSheetProps) {
  // Use a fallback kind for the form when asset is null (form state won't be used anyway)
  const assetKind = asset?.kind ?? AlternativeAssetKind.OTHER;
  const assetMetadata = asset?.metadata;

  const form = useForm<AssetDetailsFormValues>({
    resolver: zodResolver(assetDetailsSchema) as Resolver<AssetDetailsFormValues>,
    defaultValues: getDefaultDetailsFormValues(assetKind, assetMetadata),
  });

  // Reset form when asset changes or sheet opens
  useEffect(() => {
    if (open && asset) {
      form.reset(getDefaultDetailsFormValues(asset.kind, asset.metadata));
    }
  }, [open, asset, form]);

  // Build linkable assets options for liability linking
  // NOTE: This must be called before any early returns to maintain hook order
  const linkableAssetOptions: ResponsiveSelectOption[] = useMemo(() => {
    return [
      { value: "__none__", label: "None (standalone liability)" },
      ...linkableAssets.map((holding) => ({
        value: holding.id,
        label: holding.instrument?.name ?? holding.id,
      })),
    ];
  }, [linkableAssets]);

  // Early return if no asset (after all hooks are called)
  if (!asset) {
    return null;
  }

  const handleSubmit = async (values: AssetDetailsFormValues) => {
    try {
      const metadata = formValuesToMetadata(values);
      await onSave(asset.id, metadata);
      toast({
        title: "Details saved successfully",
        variant: "success",
      });
      onOpenChange(false);
    } catch (_error) {
      toast({
        title: "Failed to save details",
        description: "Please try again or report an issue if the problem persists.",
        variant: "destructive",
      });
    }
  };

  const kindDisplayName = ALTERNATIVE_ASSET_KIND_DISPLAY_NAMES[asset.kind] || asset.kind;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
              <AssetKindIcon kind={asset.kind} className="text-primary h-5 w-5" />
            </div>
            <div className="flex flex-col items-start">
              <SheetTitle className="flex items-center gap-2">
                {asset.name}
                <Badge variant="secondary" className="text-xs font-normal">
                  {kindDisplayName}
                </Badge>
              </SheetTitle>
              <SheetDescription className="text-left">
                {asset.kind === AlternativeAssetKind.LIABILITY
                  ? "Edit liability details and linking"
                  : "Add purchase information and other details"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 pb-8">
            {/* Common Fields Section */}
            <div className="space-y-4">
              <SectionHeader
                title="Purchase Information"
                description="Optional purchase details for gain/loss tracking"
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="purchasePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {asset.kind === AlternativeAssetKind.PHYSICAL_PRECIOUS
                          ? "Purchase Price (per unit)"
                          : "Purchase Price"}
                      </FormLabel>
                      <FormControl>
                        <MoneyInput
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                          }
                          placeholder="0.00"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="purchaseDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purchase Date</FormLabel>
                      <FormControl>
                        <DatePickerInput
                          value={field.value ?? undefined}
                          onChange={(date) => field.onChange(date ?? null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* Type-specific Fields */}
            <div className="space-y-4">
              <SectionHeader
                title={`${kindDisplayName} Details`}
                description={getTypeSpecificDescription(asset.kind)}
              />

              {/* Property-specific fields */}
              {asset.kind === AlternativeAssetKind.PROPERTY && <PropertyFields form={form} />}

              {/* Vehicle-specific fields */}
              {asset.kind === AlternativeAssetKind.VEHICLE && <VehicleFields form={form} />}

              {/* Collectible-specific fields */}
              {asset.kind === AlternativeAssetKind.COLLECTIBLE && <CollectibleFields form={form} />}

              {/* Precious Metal-specific fields */}
              {asset.kind === AlternativeAssetKind.PHYSICAL_PRECIOUS && (
                <PreciousMetalFields form={form} />
              )}

              {/* Liability-specific fields */}
              {asset.kind === AlternativeAssetKind.LIABILITY && (
                <LiabilityFields
                  form={form}
                  linkableAssetOptions={linkableAssetOptions}
                  linkedAssetName={linkedAssetName}
                />
              )}

              {/* Other asset fields */}
              {asset.kind === AlternativeAssetKind.OTHER && <OtherFields form={form} />}
            </div>

            {/* Linked Liabilities Display (for properties) */}
            {asset.kind === AlternativeAssetKind.PROPERTY && linkedLiabilities.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <SectionHeader
                    title="Linked Liabilities"
                    description="Debts associated with this property"
                  />
                  <div className="bg-muted/30 space-y-2 rounded-lg border p-3">
                    {linkedLiabilities.map((liability) => (
                      <div key={liability.id} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{liability.name}</span>
                        {liability.balance && (
                          <span className="text-muted-foreground">-{liability.balance}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Notes Section */}
            <div className="space-y-4">
              <SectionHeader title="Notes" description="Additional information about this asset" />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="Add any notes about this asset..."
                        className="min-h-[100px] resize-none"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <SheetFooter className="gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Icons.Check className="mr-2 h-4 w-4" />
                )}
                Save Details
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold">{title}</h4>
      {description && <p className="text-muted-foreground text-xs">{description}</p>}
    </div>
  );
}

function AssetKindIcon({ kind, className }: { kind: AlternativeAssetKind; className?: string }) {
  switch (kind) {
    case AlternativeAssetKind.PROPERTY:
      return <Icons.Building className={className} />;
    case AlternativeAssetKind.VEHICLE:
      return <Icons.Car className={className} />;
    case AlternativeAssetKind.COLLECTIBLE:
      return <Icons.Gem className={className} />;
    case AlternativeAssetKind.PHYSICAL_PRECIOUS:
      return <Icons.Coins className={className} />;
    case AlternativeAssetKind.LIABILITY:
      return <Icons.CreditCard className={className} />;
    default:
      return <Icons.Package className={className} />;
  }
}

function getTypeSpecificDescription(kind: AlternativeAssetKind): string {
  switch (kind) {
    case AlternativeAssetKind.PROPERTY:
      return "Property address and type information";
    case AlternativeAssetKind.VEHICLE:
      return "Vehicle make, model, or description";
    case AlternativeAssetKind.COLLECTIBLE:
      return "Collectible type and description";
    case AlternativeAssetKind.PHYSICAL_PRECIOUS:
      return "Metal type and unit information";
    case AlternativeAssetKind.LIABILITY:
      return "Loan terms and linked asset information";
    default:
      return "Additional details for this asset";
  }
}

// ============================================================================
// Type-Specific Field Components
// ============================================================================

function PropertyFields({ form }: { form: ReturnType<typeof useForm<AssetDetailsFormValues>> }) {
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="address"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Address</FormLabel>
            <FormControl>
              <Input
                placeholder="123 Main Street, City, State ZIP"
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value || null)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="propertyType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Property Type</FormLabel>
            <FormControl>
              <ResponsiveSelect
                value={field.value ?? ""}
                onValueChange={(val) => field.onChange(val || null)}
                options={PROPERTY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                placeholder="Select property type"
                sheetTitle="Property Type"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function VehicleFields({ form }: { form: ReturnType<typeof useForm<AssetDetailsFormValues>> }) {
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="vehicleType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Vehicle Type</FormLabel>
            <FormControl>
              <ResponsiveSelect
                value={field.value ?? ""}
                onValueChange={(val) => field.onChange(val || null)}
                options={VEHICLE_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                placeholder="Select vehicle type"
                sheetTitle="Vehicle Type"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Make/Model/Year</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g., 2023 Tesla Model 3"
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value || null)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function CollectibleFields({ form }: { form: ReturnType<typeof useForm<AssetDetailsFormValues>> }) {
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="collectibleType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Collectible Type</FormLabel>
            <FormControl>
              <ResponsiveSelect
                value={field.value ?? ""}
                onValueChange={(val) => field.onChange(val || null)}
                options={COLLECTIBLE_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                placeholder="Select collectible type"
                sheetTitle="Collectible Type"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g., Rolex Submariner, 2020 vintage"
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value || null)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function PreciousMetalFields({
  form,
}: {
  form: ReturnType<typeof useForm<AssetDetailsFormValues>>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="metalType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Metal Type</FormLabel>
              <FormControl>
                <ResponsiveSelect
                  value={field.value ?? ""}
                  onValueChange={(val) => field.onChange(val || null)}
                  options={METAL_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                  placeholder="Select metal"
                  sheetTitle="Metal Type"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="unit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Unit</FormLabel>
              <FormControl>
                <ResponsiveSelect
                  value={field.value ?? ""}
                  onValueChange={(val) => field.onChange(val || null)}
                  options={WEIGHT_UNITS.map((t) => ({ value: t.value, label: t.label }))}
                  placeholder="Select unit"
                  sheetTitle="Weight Unit"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g., American Gold Eagles, 1oz coins"
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value || null)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function LiabilityFields({
  form,
  linkableAssetOptions,
  linkedAssetName,
}: {
  form: ReturnType<typeof useForm<AssetDetailsFormValues>>;
  linkableAssetOptions: ResponsiveSelectOption[];
  linkedAssetName?: string;
}) {
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="liabilityType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Liability Type</FormLabel>
            <FormControl>
              <ResponsiveSelect
                value={field.value ?? ""}
                onValueChange={(val) => field.onChange(val || null)}
                options={LIABILITY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                placeholder="Select liability type"
                sheetTitle="Liability Type"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="originalAmount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Original Amount</FormLabel>
              <FormControl>
                <MoneyInput
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                  }
                  placeholder="0.00"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="interestRate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Interest Rate (%)</FormLabel>
              <FormControl>
                <QuantityInput
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                  }
                  placeholder="0.00"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="originationDate"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Origination Date</FormLabel>
            <FormControl>
              <DatePickerInput
                value={field.value ?? undefined}
                onChange={(date) => field.onChange(date ?? null)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Linked Asset Display/Selector */}
      {linkableAssetOptions.length > 1 ? (
        <FormField
          control={form.control}
          name="linkedAssetId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Linked Asset</FormLabel>
              <FormControl>
                <ResponsiveSelect
                  value={field.value ?? "__none__"}
                  onValueChange={(val) => field.onChange(val === "__none__" ? null : val)}
                  options={linkableAssetOptions}
                  placeholder="Select asset to link"
                  sheetTitle="Link to Asset"
                  sheetDescription="Link this liability to a property or vehicle for grouped display"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : linkedAssetName ? (
        <div className="space-y-2">
          <FormLabel>Linked Asset</FormLabel>
          <div className="bg-muted/30 flex items-center gap-2 rounded-lg border p-3">
            <Icons.Link className="text-muted-foreground h-4 w-4" />
            <span className="text-sm font-medium">{linkedAssetName}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OtherFields({ form }: { form: ReturnType<typeof useForm<AssetDetailsFormValues>> }) {
  return (
    <FormField
      control={form.control}
      name="description"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Description</FormLabel>
          <FormControl>
            <Input
              placeholder="Describe this asset..."
              value={field.value ?? ""}
              onChange={(e) => field.onChange(e.target.value || null)}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
