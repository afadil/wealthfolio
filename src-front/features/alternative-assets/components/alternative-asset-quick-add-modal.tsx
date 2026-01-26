import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@wealthfolio/ui/components/ui/dialog";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { Checkbox } from "@wealthfolio/ui/components/ui/checkbox";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  CurrencyInput,
  DatePickerInput,
  ResponsiveSelect,
} from "@wealthfolio/ui";
import { cn } from "@/lib/utils";
import { useSettingsContext } from "@/lib/settings-provider";

import {
  METAL_TYPES,
  LIABILITY_TYPES,
} from "./alternative-asset-quick-add-schema";
import { useAlternativeAssetMutations } from "../hooks/use-alternative-asset-mutations";
import {
  AlternativeAssetKind,
  type CreateAlternativeAssetRequest,
  type AlternativeAssetKindApi,
  type Holding,
} from "@/lib/types";

// Asset type configuration using theme colors
const ASSET_TYPES = [
  {
    kind: AlternativeAssetKind.PROPERTY,
    label: "Property",
    description: "Real estate & land",
    icon: Icons.Home,
    iconColor: "text-green-400",
    selectedBg: "bg-green-400/15",
    borderColor: "border-green-400/50",
  },
  {
    kind: AlternativeAssetKind.VEHICLE,
    label: "Vehicle",
    description: "Cars, boats & more",
    icon: Icons.Car,
    iconColor: "text-blue-400",
    selectedBg: "bg-blue-400/15",
    borderColor: "border-blue-400/50",
  },
  {
    kind: AlternativeAssetKind.COLLECTIBLE,
    label: "Collectible",
    description: "Art, watches & rare items",
    icon: Icons.Gem,
    iconColor: "text-purple-400",
    selectedBg: "bg-purple-400/15",
    borderColor: "border-purple-400/50",
  },
  {
    kind: AlternativeAssetKind.PHYSICAL_PRECIOUS,
    label: "Precious Metal",
    description: "Gold, silver & platinum",
    icon: Icons.Coins,
    iconColor: "text-orange-400",
    selectedBg: "bg-orange-400/15",
    borderColor: "border-orange-400/50",
  },
  {
    kind: AlternativeAssetKind.LIABILITY,
    label: "Liability",
    description: "Loans & debt",
    icon: Icons.CreditCard,
    iconColor: "text-red-400",
    selectedBg: "bg-red-400/15",
    borderColor: "border-red-400/50",
  },
  {
    kind: AlternativeAssetKind.OTHER,
    label: "Other Asset",
    description: "Custom assets",
    icon: Icons.Package,
    iconColor: "text-base-500",
    selectedBg: "bg-base-500/15",
    borderColor: "border-base-500/50",
  },
];

// Map internal kind to API kind
const kindToApiKind: Record<AlternativeAssetKind, AlternativeAssetKindApi> = {
  [AlternativeAssetKind.PROPERTY]: "property",
  [AlternativeAssetKind.VEHICLE]: "vehicle",
  [AlternativeAssetKind.COLLECTIBLE]: "collectible",
  [AlternativeAssetKind.PHYSICAL_PRECIOUS]: "precious",
  [AlternativeAssetKind.LIABILITY]: "liability",
  [AlternativeAssetKind.OTHER]: "other",
};

interface FormData {
  kind: AlternativeAssetKind;
  name: string;
  currency: string;
  currentValue: string;
  valueDate: Date;
  purchasePrice?: string;
  purchaseDate?: Date;
  metalType?: string;
  liabilityType?: string;
  hasMortgage?: boolean;
  linkedAssetId?: string;
}

interface AlternativeAssetQuickAddModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind?: AlternativeAssetKind;
  linkableAssets?: Holding[];
  linkedAssetId?: string;
  onAssetCreated?: (response: { assetId: string }) => void;
  onOpenLiabilityQuickAdd?: (linkedAssetId: string) => void;
}

export function AlternativeAssetQuickAddModal({
  open,
  onOpenChange,
  defaultKind,
  linkableAssets = [],
  linkedAssetId: initialLinkedAssetId,
  onAssetCreated,
  onOpenLiabilityQuickAdd,
}: AlternativeAssetQuickAddModalProps) {
  const { settings } = useSettingsContext();
  const baseCurrency = settings?.baseCurrency ?? "USD";

  const [step, setStep] = useState<1 | 2>(1);
  const [hasMortgageChecked, setHasMortgageChecked] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    kind: defaultKind || AlternativeAssetKind.PROPERTY,
    name: "",
    currency: baseCurrency,
    currentValue: "",
    valueDate: new Date(),
    linkedAssetId: initialLinkedAssetId,
  });

  const { createMutation } = useAlternativeAssetMutations({
    onCreateSuccess: (response) => {
      onAssetCreated?.(response);

      if (hasMortgageChecked && onOpenLiabilityQuickAdd) {
        onOpenLiabilityQuickAdd(response.assetId);
      }

      onOpenChange(false);
    },
  });

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      // Skip step 1 if a defaultKind is provided
      setStep(defaultKind ? 2 : 1);
      setHasMortgageChecked(false);
      setFormData({
        kind: defaultKind || AlternativeAssetKind.PROPERTY,
        name: "",
        currency: baseCurrency,
        currentValue: "",
        valueDate: new Date(),
        linkedAssetId: initialLinkedAssetId,
      });
    }
  }, [open, defaultKind, initialLinkedAssetId, baseCurrency]);

  const selectedAssetType = useMemo(
    () => ASSET_TYPES.find((t) => t.kind === formData.kind),
    [formData.kind]
  );

  const handleAssetTypeSelect = useCallback((kind: AlternativeAssetKind) => {
    setFormData((prev) => ({
      ...prev,
      kind,
    }));
  }, []);

  const updateFormData = useCallback(
    (field: keyof FormData, value: string | boolean | Date) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const canProceed = useMemo(() => {
    if (step === 1) return true;
    return formData.name.trim() && formData.currentValue;
  }, [step, formData.name, formData.currentValue]);

  const handleSubmit = async () => {
    if (!canProceed) return;

    const metadata: Record<string, string> = {};

    if (formData.kind === AlternativeAssetKind.PHYSICAL_PRECIOUS) {
      if (formData.metalType) metadata.metal_type = formData.metalType;
    }

    if (
      formData.kind === AlternativeAssetKind.LIABILITY &&
      formData.liabilityType
    ) {
      metadata.liability_type = formData.liabilityType;
    }

    const request: CreateAlternativeAssetRequest = {
      kind: kindToApiKind[formData.kind],
      name: formData.name,
      currency: formData.currency,
      currentValue: formData.currentValue,
      valueDate: formatDateToISO(formData.valueDate),
      purchasePrice: formData.purchasePrice || undefined,
      purchaseDate: formData.purchaseDate
        ? formatDateToISO(formData.purchaseDate)
        : undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      linkedAssetId: formData.linkedAssetId || undefined,
    };

    setHasMortgageChecked(formData.hasMortgage ?? false);

    await createMutation.mutateAsync(request);
  };

  // Build linkable assets options for liability form
  const linkableAssetOptions = useMemo(() => {
    return [
      { value: "", label: "None (standalone liability)" },
      ...linkableAssets.map((asset) => ({
        value: asset.id,
        label: asset.instrument?.name ?? asset.id,
      })),
    ];
  }, [linkableAssets]);

  const getValueLabel = () => {
    if (formData.kind === AlternativeAssetKind.LIABILITY)
      return "Current Balance";
    return "Current Value";
  };

  const getPlaceholder = () => {
    switch (formData.kind) {
      case AlternativeAssetKind.PROPERTY:
        return "Beach House, City Apartment...";
      case AlternativeAssetKind.VEHICLE:
        return "Tesla Model 3, Porsche 911...";
      case AlternativeAssetKind.PHYSICAL_PRECIOUS:
        return "Gold Bars, Silver Coins...";
      case AlternativeAssetKind.LIABILITY:
        return "Home Mortgage, Car Loan...";
      case AlternativeAssetKind.COLLECTIBLE:
        return "Rolex Daytona, Picasso Print...";
      default:
        return "Asset name...";
    }
  };

  const isSubmitting = createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden border-border/50 bg-card p-0 shadow-2xl sm:max-w-[560px]">
        {/* Header with progress indicator */}
        <DialogHeader className="border-b border-border/50 px-6 pb-4 pt-6">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold tracking-tight text-foreground">
              {step === 1 ? "Add New Asset" : selectedAssetType?.label}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "h-2 w-8 rounded-full transition-colors duration-300",
                  step >= 1 ? "bg-primary" : "bg-muted"
                )}
              />
              <div
                className={cn(
                  "h-2 w-8 rounded-full transition-colors duration-300",
                  step >= 2 ? "bg-primary" : "bg-muted"
                )}
              />
            </div>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {step === 1
              ? "Select the type of asset you want to add"
              : formData.kind === AlternativeAssetKind.LIABILITY
                ? "Add a liability to track against your net worth"
                : "Enter the details for your asset"}
          </p>
        </DialogHeader>

        {/* Content area with animations */}
        <div className="relative min-h-[380px]">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="p-6"
              >
                {/* Asset Type Grid */}
                <div className="grid grid-cols-2 gap-3">
                  {ASSET_TYPES.map((type) => {
                    const Icon = type.icon;
                    const isSelected = formData.kind === type.kind;

                    return (
                      <motion.button
                        key={type.kind}
                        type="button"
                        onClick={() => handleAssetTypeSelect(type.kind)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={cn(
                          "relative flex flex-col items-start rounded-xl border-2 p-4 text-left transition-all duration-200",
                          "hover:shadow-md",
                          isSelected
                            ? cn(type.borderColor, type.selectedBg)
                            : "border-border/50 bg-secondary/30 hover:border-border hover:bg-secondary/50"
                        )}
                      >
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute right-2 top-2"
                          >
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                              <Icons.Check className="h-3 w-3 text-primary-foreground" />
                            </div>
                          </motion.div>
                        )}
                        <div
                          className={cn(
                            "mb-3 flex h-10 w-10 items-center justify-center rounded-lg",
                            isSelected ? type.selectedBg : "bg-muted"
                          )}
                        >
                          <Icon className={cn("h-5 w-5", type.iconColor)} />
                        </div>
                        <span
                          className={cn(
                            "text-sm font-medium",
                            isSelected ? "text-foreground" : "text-foreground/80"
                          )}
                        >
                          {type.label}
                        </span>
                        <span className="text-muted-foreground mt-0.5 text-xs">
                          {type.description}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="space-y-5 p-6"
              >
                {/* Type-specific fields */}
                {formData.kind === AlternativeAssetKind.PHYSICAL_PRECIOUS && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">
                      Metal Type
                    </Label>
                    <ResponsiveSelect
                      value={formData.metalType || "gold"}
                      onValueChange={(v) => updateFormData("metalType", v)}
                      options={METAL_TYPES.map((metal) => ({
                        value: metal.value,
                        label: metal.label,
                      }))}
                      placeholder="Select metal"
                      sheetTitle="Select Metal Type"
                    />
                  </div>
                )}

                {formData.kind === AlternativeAssetKind.LIABILITY && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">
                      Liability Type
                    </Label>
                    <ResponsiveSelect
                      value={formData.liabilityType || "mortgage"}
                      onValueChange={(v) => updateFormData("liabilityType", v)}
                      options={LIABILITY_TYPES.map((type) => ({
                        value: type.value,
                        label: type.label,
                      }))}
                      placeholder="Select type"
                      sheetTitle="Select Liability Type"
                    />
                  </div>
                )}

                {/* Name field */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">
                    Name
                  </Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => updateFormData("name", e.target.value)}
                    placeholder={getPlaceholder()}
                    className="h-11"
                  />
                </div>

                {/* Currency row */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">
                    Currency
                  </Label>
                  <CurrencyInput
                    value={formData.currency}
                    onChange={(v) => updateFormData("currency", v)}
                    placeholder="Select currency"
                  />
                </div>

                {/* Value and Date row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">
                      {getValueLabel()}
                    </Label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={formData.currentValue}
                        onChange={(e) =>
                          updateFormData("currentValue", e.target.value)
                        }
                        placeholder="0.00"
                        min="0"
                        step="any"
                        className="h-11"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">
                      {formData.kind === AlternativeAssetKind.LIABILITY
                        ? "Balance Date"
                        : "Value Date"}
                    </Label>
                    <DatePickerInput
                      value={formData.valueDate}
                      onChange={(date) =>
                        date && updateFormData("valueDate", date)
                      }
                    />
                  </div>
                </div>

                {/* Purchase Price and Date (optional, for gain calculation) - only for assets, not liabilities */}
                {formData.kind !== AlternativeAssetKind.LIABILITY && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">
                        Purchase Price
                        <span className="text-muted-foreground ml-1 text-xs font-normal">
                          (optional)
                        </span>
                      </Label>
                      <div className="relative">
                        <Input
                          type="number"
                          value={formData.purchasePrice || ""}
                          onChange={(e) =>
                            updateFormData("purchasePrice", e.target.value)
                          }
                          placeholder="0.00"
                          min="0"
                          step="any"
                          className="h-11"
                        />
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Used to calculate unrealized gain
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">
                        Purchase Date
                        <span className="text-muted-foreground ml-1 text-xs font-normal">
                          (optional)
                        </span>
                      </Label>
                      <DatePickerInput
                        value={formData.purchaseDate}
                        onChange={(date) =>
                          date && updateFormData("purchaseDate", date)
                        }
                      />
                    </div>
                  </div>
                )}

                {/* Mortgage checkbox for property */}
                {formData.kind === AlternativeAssetKind.PROPERTY && (
                  <div className="flex items-center space-x-3 pt-2">
                    <Checkbox
                      id="hasMortgage"
                      checked={formData.hasMortgage}
                      onCheckedChange={(checked) =>
                        updateFormData("hasMortgage", checked as boolean)
                      }
                    />
                    <label
                      htmlFor="hasMortgage"
                      className="cursor-pointer text-sm text-foreground"
                    >
                      I have a mortgage/loan on this property
                    </label>
                  </div>
                )}

                {/* Link to asset for liability */}
                {formData.kind === AlternativeAssetKind.LIABILITY &&
                  linkableAssets.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">
                        Link to Asset (optional)
                      </Label>
                      <ResponsiveSelect
                        value={formData.linkedAssetId || ""}
                        onValueChange={(v) =>
                          updateFormData("linkedAssetId", v === "" ? "" : v)
                        }
                        options={linkableAssetOptions}
                        placeholder="None (standalone liability)"
                        sheetTitle="Link to Asset"
                        sheetDescription="Link this liability to a property or vehicle for grouped display"
                      />
                    </div>
                  )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer with navigation */}
        <div className="border-t border-border/50 bg-muted/30 px-6 py-4">
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => (step === 1 ? onOpenChange(false) : setStep(1))}
              disabled={isSubmitting}
              className="text-muted-foreground hover:text-foreground"
            >
              {step === 1 ? (
                "Cancel"
              ) : (
                <>
                  <Icons.ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </>
              )}
            </Button>
            <Button
              onClick={() => (step === 1 ? setStep(2) : handleSubmit())}
              disabled={!canProceed || isSubmitting}
              className="min-w-[140px]"
            >
              {isSubmitting ? (
                <>
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : step === 1 ? (
                <>
                  Continue
                  <Icons.ArrowRight className="ml-2 h-4 w-4" />
                </>
              ) : formData.kind === AlternativeAssetKind.LIABILITY ? (
                "Add Liability"
              ) : (
                "Create Asset"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper to format date to ISO string (YYYY-MM-DD)
function formatDateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
