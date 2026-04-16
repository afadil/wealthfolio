import { useEffect, useMemo, useState } from "react";
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
import { type LinkableAsset } from "./alternative-asset-quick-add-modal";
import { translateAlternativeAssetKind } from "@/lib/alternative-asset-kind-i18n";
import { AlternativeAssetKind } from "@/lib/types";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

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
  notes?: string | null;
}

/** Represents a liability that can be linked from a property */
export interface LinkedLiability {
  id: string;
  name: string;
  balance?: string;
}

interface AssetDetailsSheetProps {
  /** Whether the sheet is open */
  open: boolean;
  /** Callback when the sheet open state changes */
  onOpenChange: (open: boolean) => void;
  /** The asset to view/edit */
  asset: AssetDetailsSheetAsset | null;
  /** Callback when the user saves changes */
  onSave: (
    assetId: string,
    metadata: Record<string, string>,
    name?: string,
    notes?: string | null,
  ) => Promise<void>;
  /** Optional: For displaying linked asset name for liabilities */
  linkedAssetName?: string;
  /** Optional: For liabilities, list of assets that can be linked */
  linkableAssets?: LinkableAsset[];
  /** Optional: For properties, list of liabilities linked to this asset */
  linkedLiabilities?: LinkedLiability[];
  /** Optional: For properties, list of unlinked mortgages that can be linked */
  availableMortgages?: LinkedLiability[];
  /** Optional: Callback to link a mortgage to this property */
  onLinkMortgage?: (mortgageId: string) => Promise<void>;
  /** Optional: Callback to unlink a mortgage from this property */
  onUnlinkMortgage?: (mortgageId: string) => Promise<void>;
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
  availableMortgages = [],
  onLinkMortgage,
  onUnlinkMortgage,
  isSaving = false,
}: AssetDetailsSheetProps) {
  const { t } = useTranslation("common");
  // Use a fallback kind for the form when asset is null (form state won't be used anyway)
  const assetKind = asset?.kind ?? AlternativeAssetKind.OTHER;
  const assetName = asset?.name ?? "";
  const assetMetadata = asset?.metadata;
  const assetNotes = asset?.notes;

  const form = useForm<AssetDetailsFormValues>({
    resolver: zodResolver(assetDetailsSchema) as Resolver<AssetDetailsFormValues>,
    defaultValues: getDefaultDetailsFormValues(assetKind, assetName, assetMetadata, assetNotes),
  });

  // Reset form when asset changes or sheet opens
  useEffect(() => {
    if (open && asset) {
      form.reset(getDefaultDetailsFormValues(asset.kind, asset.name, asset.metadata, asset.notes));
    }
  }, [open, asset, form]);

  // Build linkable assets options for liability linking
  // NOTE: This must be called before any early returns to maintain hook order
  const linkableAssetOptions: ResponsiveSelectOption[] = useMemo(() => {
    return [
      { value: "__none__", label: t("holdings.asset_details.link_standalone") },
      ...linkableAssets.map((asset) => ({
        value: asset.id,
        label: asset.name,
      })),
    ];
  }, [linkableAssets, t]);

  // Early return if no asset (after all hooks are called)
  if (!asset) {
    return null;
  }

  const handleSubmit = async (values: AssetDetailsFormValues) => {
    try {
      const metadata = formValuesToMetadata(values);
      // Only pass name if it changed
      const nameChanged = values.name !== asset.name ? values.name : undefined;
      // Pass notes separately (it goes to asset.notes, not metadata)
      await onSave(asset.id, metadata, nameChanged, values.notes);
      toast({
        title: t("holdings.asset_details.toast_saved"),
        variant: "success",
      });
      onOpenChange(false);
    } catch (_error) {
      toast({
        title: t("holdings.asset_details.toast_failed"),
        description: t("holdings.asset_details.toast_failed_desc"),
        variant: "destructive",
      });
    }
  };

  const kindDisplayName = translateAlternativeAssetKind(t, asset.kind);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
              <AssetKindIcon kind={asset.kind} className="text-primary" size={20} />
            </div>
            <div className="flex flex-col items-start">
              <SheetTitle className="flex items-center gap-2">
                {t("holdings.asset_details.edit_title", { kind: kindDisplayName })}
                <Badge variant="secondary" className="text-xs font-normal">
                  {kindDisplayName}
                </Badge>
              </SheetTitle>
              <SheetDescription className="text-left">
                {asset.kind === AlternativeAssetKind.LIABILITY
                  ? t("holdings.asset_details.sheet_desc_liability")
                  : t("holdings.asset_details.sheet_desc_standard")}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 pb-8">
            {/* Name Field */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("holdings.asset_details.field_name")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("holdings.asset_details.name_placeholder")}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            {/* Purchase Information - only for assets, not liabilities */}
            {asset.kind !== AlternativeAssetKind.LIABILITY && (
              <>
                <div className="space-y-4">
                  <SectionHeader
                    title={t("holdings.asset_details.purchase_info_title")}
                    description={t("holdings.asset_details.purchase_info_desc")}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="purchasePrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {asset.kind === AlternativeAssetKind.PRECIOUS_METAL
                              ? t("holdings.asset_details.purchase_price_per_unit")
                              : t("holdings.asset_details.purchase_price")}
                          </FormLabel>
                          <FormControl>
                            <MoneyInput
                              ref={field.ref}
                              name={field.name}
                              value={field.value}
                              onValueChange={(value) => field.onChange(value ?? null)}
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
                          <FormLabel>{t("holdings.asset_details.purchase_date")}</FormLabel>
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
              </>
            )}

            {/* Type-specific Fields */}
            <div className="space-y-4">
              <SectionHeader
                title={t("holdings.asset_details.section_kind_details", { kind: kindDisplayName })}
                description={getTypeSpecificDescription(asset.kind, t)}
              />

              {/* Property-specific fields */}
              {asset.kind === AlternativeAssetKind.PROPERTY && <PropertyFields form={form} />}

              {/* Vehicle-specific fields */}
              {asset.kind === AlternativeAssetKind.VEHICLE && <VehicleFields form={form} />}

              {/* Collectible-specific fields */}
              {asset.kind === AlternativeAssetKind.COLLECTIBLE && <CollectibleFields form={form} />}

              {/* Precious Metal-specific fields */}
              {asset.kind === AlternativeAssetKind.PRECIOUS_METAL && (
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
            {asset.kind === AlternativeAssetKind.PROPERTY && (
              <PropertyMortgageSection
                linkedLiabilities={linkedLiabilities}
                availableMortgages={availableMortgages}
                onLinkMortgage={onLinkMortgage}
                onUnlinkMortgage={onUnlinkMortgage}
              />
            )}

            <Separator />

            {/* Notes Section */}
            <div className="space-y-4">
              <SectionHeader
                title={t("holdings.asset_details.notes_title")}
                description={t("holdings.asset_details.notes_desc")}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder={t("holdings.asset_details.notes_placeholder")}
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
                {t("holdings.asset_details.cancel")}
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Icons.Check className="mr-2 h-4 w-4" />
                )}
                {t("holdings.asset_details.save")}
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

function AssetKindIcon({
  kind,
  className,
  size = 20,
}: {
  kind: AlternativeAssetKind;
  className?: string;
  size?: number;
}) {
  switch (kind) {
    case AlternativeAssetKind.PROPERTY:
      return <Icons.RealEstateDuotone size={size} className={className} />;
    case AlternativeAssetKind.VEHICLE:
      return <Icons.VehicleDuotone size={size} className={className} />;
    case AlternativeAssetKind.COLLECTIBLE:
      return <Icons.CollectibleDuotone size={size} className={className} />;
    case AlternativeAssetKind.PRECIOUS_METAL:
      return <Icons.PreciousDuotone size={size} className={className} />;
    case AlternativeAssetKind.LIABILITY:
      return <Icons.LiabilityDuotone size={size} className={className} />;
    default:
      return <Icons.OtherAssetDuotone size={size} className={className} />;
  }
}

function getTypeSpecificDescription(
  kind: AlternativeAssetKind,
  t: TFunction<"common">,
): string {
  switch (kind) {
    case AlternativeAssetKind.PROPERTY:
      return t("holdings.asset_details.type_desc.property");
    case AlternativeAssetKind.VEHICLE:
      return t("holdings.asset_details.type_desc.vehicle");
    case AlternativeAssetKind.COLLECTIBLE:
      return t("holdings.asset_details.type_desc.collectible");
    case AlternativeAssetKind.PRECIOUS_METAL:
      return t("holdings.asset_details.type_desc.precious_metal");
    case AlternativeAssetKind.LIABILITY:
      return t("holdings.asset_details.type_desc.liability");
    default:
      return t("holdings.asset_details.type_desc.other");
  }
}

// ============================================================================
// Type-Specific Field Components
// ============================================================================

function PropertyFields({ form }: { form: ReturnType<typeof useForm<AssetDetailsFormValues>> }) {
  const { t } = useTranslation("common");
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="address"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("holdings.asset_details.address")}</FormLabel>
            <FormControl>
              <Input
                placeholder={t("holdings.asset_details.address_placeholder")}
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
            <FormLabel>{t("holdings.asset_details.property_type")}</FormLabel>
            <FormControl>
              <ResponsiveSelect
                value={field.value ?? ""}
                onValueChange={(val) => field.onChange(val || null)}
                options={PROPERTY_TYPES.map((opt) => ({ value: opt.value, label: opt.label }))}
                placeholder={t("holdings.asset_details.select_property_type")}
                sheetTitle={t("holdings.asset_details.sheet_title_property_type")}
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
  const { t } = useTranslation("common");
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="vehicleType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("holdings.asset_details.vehicle_type")}</FormLabel>
            <FormControl>
              <ResponsiveSelect
                value={field.value ?? ""}
                onValueChange={(val) => field.onChange(val || null)}
                options={VEHICLE_TYPES.map((opt) => ({ value: opt.value, label: opt.label }))}
                placeholder={t("holdings.asset_details.select_vehicle_type")}
                sheetTitle={t("holdings.asset_details.sheet_title_vehicle_type")}
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
            <FormLabel>{t("holdings.asset_details.make_model_year")}</FormLabel>
            <FormControl>
              <Input
                placeholder={t("holdings.asset_details.vehicle_description_ph")}
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
  const { t } = useTranslation("common");
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="collectibleType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("holdings.asset_details.collectible_type")}</FormLabel>
            <FormControl>
              <ResponsiveSelect
                value={field.value ?? ""}
                onValueChange={(val) => field.onChange(val || null)}
                options={COLLECTIBLE_TYPES.map((opt) => ({ value: opt.value, label: opt.label }))}
                placeholder={t("holdings.asset_details.select_collectible_type")}
                sheetTitle={t("holdings.asset_details.sheet_title_collectible_type")}
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
            <FormLabel>{t("holdings.asset_details.description")}</FormLabel>
            <FormControl>
              <Input
                placeholder={t("holdings.asset_details.collectible_description_ph")}
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
  const { t } = useTranslation("common");
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="metalType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("holdings.asset_details.metal_type")}</FormLabel>
            <FormControl>
              <ResponsiveSelect
                value={field.value ?? ""}
                onValueChange={(val) => field.onChange(val || null)}
                options={METAL_TYPES.map((opt) => ({ value: opt.value, label: opt.label }))}
                placeholder={t("holdings.asset_details.select_metal")}
                sheetTitle={t("holdings.asset_details.sheet_title_metal_type")}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("holdings.asset_details.quantity")}</FormLabel>
              <FormControl>
                <QuantityInput
                  ref={field.ref}
                  name={field.name}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value ?? null)}
                  placeholder="0"
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
              <FormLabel>{t("holdings.asset_details.unit")}</FormLabel>
              <FormControl>
                <ResponsiveSelect
                  value={field.value ?? ""}
                  onValueChange={(val) => field.onChange(val || null)}
                  options={WEIGHT_UNITS.map((opt) => ({ value: opt.value, label: opt.label }))}
                  placeholder={t("holdings.asset_details.select_unit")}
                  sheetTitle={t("holdings.asset_details.sheet_title_weight_unit")}
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
            <FormLabel>{t("holdings.asset_details.description")}</FormLabel>
            <FormControl>
              <Input
                placeholder={t("holdings.asset_details.precious_description_ph")}
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
  const { t } = useTranslation("common");
  const liabilityTypeOptions = useMemo(
    () =>
      LIABILITY_TYPES.map((opt) => ({
        value: opt.value,
        label: t(`asset.alternative.quick_add.liability_option.${opt.value}`),
      })),
    [t],
  );
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="liabilityType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("holdings.asset_details.liability_type")}</FormLabel>
            <FormControl>
              <ResponsiveSelect
                value={field.value ?? ""}
                onValueChange={(val) => field.onChange(val || null)}
                options={liabilityTypeOptions}
                placeholder={t("holdings.asset_details.select_liability_type")}
                sheetTitle={t("holdings.asset_details.sheet_title_liability_type")}
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
              <FormLabel>{t("holdings.asset_details.original_amount")}</FormLabel>
              <FormControl>
                <MoneyInput
                  ref={field.ref}
                  name={field.name}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value ?? null)}
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
              <FormLabel>{t("holdings.asset_details.interest_rate")}</FormLabel>
              <FormControl>
                <QuantityInput
                  ref={field.ref}
                  name={field.name}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value ?? null)}
                  placeholder="0.00"
                  maxDecimalPlaces={2}
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
            <FormLabel>{t("holdings.asset_details.origination_date")}</FormLabel>
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
      <FormField
        control={form.control}
        name="linkedAssetId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("holdings.linked_asset.label")}</FormLabel>
            {linkableAssetOptions.length > 1 ? (
              <FormControl>
                <ResponsiveSelect
                  value={field.value ?? "__none__"}
                  onValueChange={(val) => field.onChange(val === "__none__" ? null : val)}
                  options={linkableAssetOptions}
                  placeholder={t("holdings.asset_details.link_asset_placeholder")}
                  sheetTitle={t("holdings.asset_details.link_asset_sheet_title")}
                  sheetDescription={t("holdings.asset_details.link_asset_sheet_desc")}
                />
              </FormControl>
            ) : linkedAssetName ? (
              <div className="bg-muted/30 flex items-center gap-2 rounded-lg border p-3">
                <Icons.Link className="text-muted-foreground h-4 w-4" />
                <span className="text-sm font-medium">{linkedAssetName}</span>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("holdings.asset_details.no_linkable_assets")}
              </p>
            )}
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function OtherFields({ form }: { form: ReturnType<typeof useForm<AssetDetailsFormValues>> }) {
  const { t } = useTranslation("common");
  return (
    <FormField
      control={form.control}
      name="description"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t("holdings.asset_details.description")}</FormLabel>
          <FormControl>
            <Input
              placeholder={t("holdings.asset_details.other_description_ph")}
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

/**
 * Section for managing mortgage links on a property.
 * Shows linked mortgages with unlink option and allows linking available mortgages.
 */
function PropertyMortgageSection({
  linkedLiabilities,
  availableMortgages,
  onLinkMortgage,
  onUnlinkMortgage,
}: {
  linkedLiabilities: LinkedLiability[];
  availableMortgages: LinkedLiability[];
  onLinkMortgage?: (mortgageId: string) => Promise<void>;
  onUnlinkMortgage?: (mortgageId: string) => Promise<void>;
}) {
  const { t } = useTranslation("common");
  const [isLinking, setIsLinking] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [showLinkSelect, setShowLinkSelect] = useState(false);
  const [selectedMortgageId, setSelectedMortgageId] = useState<string>("");

  const handleLink = async () => {
    if (!selectedMortgageId || !onLinkMortgage) return;
    setIsLinking(true);
    try {
      await onLinkMortgage(selectedMortgageId);
      setSelectedMortgageId("");
      setShowLinkSelect(false);
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async (mortgageId: string) => {
    if (!onUnlinkMortgage) return;
    setUnlinkingId(mortgageId);
    try {
      await onUnlinkMortgage(mortgageId);
    } finally {
      setUnlinkingId(null);
    }
  };

  // Don't show anything if there are no linked liabilities and no available mortgages
  if (linkedLiabilities.length === 0 && availableMortgages.length === 0) {
    return null;
  }

  return (
    <>
      <Separator />
      <div className="space-y-4">
        <SectionHeader
          title={t("holdings.asset_details.mortgage_section_title")}
          description={t("holdings.asset_details.mortgage_section_desc")}
        />

        {/* Display linked liabilities with unlink option */}
        {linkedLiabilities.length > 0 && (
          <div className="bg-muted/30 space-y-2 rounded-lg border p-3">
            {linkedLiabilities.map((liability) => (
              <div key={liability.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Icons.Link className="text-muted-foreground h-4 w-4" />
                  <span className="font-medium">{liability.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {liability.balance && (
                    <span className="text-muted-foreground">-{liability.balance}</span>
                  )}
                  {onUnlinkMortgage && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUnlink(liability.id)}
                      disabled={unlinkingId === liability.id}
                      className="h-7 px-2"
                    >
                      {unlinkingId === liability.id ? (
                        <Icons.Spinner className="h-3 w-3 animate-spin" />
                      ) : (
                        <Icons.X className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Link existing mortgage section */}
        {availableMortgages.length > 0 && onLinkMortgage && (
          <div className="space-y-3">
            {!showLinkSelect ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowLinkSelect(true)}
                className="w-full"
              >
                <Icons.Link className="mr-2 h-4 w-4" />
                {t("holdings.asset_details.link_existing_mortgage")}
              </Button>
            ) : (
              <div className="space-y-2">
                <ResponsiveSelect
                  value={selectedMortgageId}
                  onValueChange={setSelectedMortgageId}
                  options={availableMortgages.map((m) => ({
                    value: m.id,
                    label: m.name + (m.balance ? ` (${m.balance})` : ""),
                  }))}
                  placeholder={t("holdings.asset_details.select_mortgage_placeholder")}
                  sheetTitle={t("holdings.asset_details.link_mortgage_sheet_title")}
                  sheetDescription={t("holdings.asset_details.link_mortgage_sheet_desc")}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowLinkSelect(false);
                      setSelectedMortgageId("");
                    }}
                    className="flex-1"
                  >
                    {t("holdings.asset_details.cancel")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleLink}
                    disabled={!selectedMortgageId || isLinking}
                    className="flex-1"
                  >
                    {isLinking ? (
                      <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Icons.Check className="mr-2 h-4 w-4" />
                    )}
                    {t("holdings.asset_details.link_action")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
