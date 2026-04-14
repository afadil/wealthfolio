import i18n from "@/i18n/i18n";
import { AlternativeAssetKind } from "@/lib/types";
import * as z from "zod";

// Metal types for precious metals
export const METAL_TYPES = [
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
  { value: "platinum", label: "Platinum" },
  { value: "palladium", label: "Palladium" },
] as const;

// Weight units for precious metals
export const WEIGHT_UNITS = [
  { value: "oz", label: "Troy Ounce (oz)" },
  { value: "g", label: "Gram (g)" },
  { value: "kg", label: "Kilogram (kg)" },
] as const;

// Liability types
export const LIABILITY_TYPES = [
  { value: "mortgage", label: i18n.t("asset.alternative.quick_add.liability_option.mortgage") },
  { value: "auto_loan", label: i18n.t("asset.alternative.quick_add.liability_option.auto_loan") },
  {
    value: "student_loan",
    label: i18n.t("asset.alternative.quick_add.liability_option.student_loan"),
  },
  {
    value: "credit_card",
    label: i18n.t("asset.alternative.quick_add.liability_option.credit_card"),
  },
  {
    value: "personal_loan",
    label: i18n.t("asset.alternative.quick_add.liability_option.personal_loan"),
  },
  { value: "heloc", label: i18n.t("asset.alternative.quick_add.liability_option.heloc") },
  { value: "other", label: i18n.t("asset.alternative.quick_add.liability_option.other") },
] as const;

// Asset type options for the type selector
export const ASSET_KIND_OPTIONS = [
  { value: AlternativeAssetKind.PROPERTY, label: "Property" },
  { value: AlternativeAssetKind.VEHICLE, label: "Vehicle" },
  { value: AlternativeAssetKind.COLLECTIBLE, label: "Collectible" },
  { value: AlternativeAssetKind.PRECIOUS_METAL, label: "Precious Metal" },
  { value: AlternativeAssetKind.LIABILITY, label: "Liability" },
  { value: AlternativeAssetKind.OTHER, label: "Other" },
] as const;

// Zod schema for the quick add form
export const alternativeAssetQuickAddSchema = z
  .object({
    // Asset type
    kind: z.enum([
      AlternativeAssetKind.PROPERTY,
      AlternativeAssetKind.VEHICLE,
      AlternativeAssetKind.COLLECTIBLE,
      AlternativeAssetKind.PRECIOUS_METAL,
      AlternativeAssetKind.LIABILITY,
      AlternativeAssetKind.OTHER,
    ]),

    // Common fields
    name: z
      .string()
      .min(1, i18n.t("alternativeAsset.quickAdd.validation.name_required"))
      .max(100, i18n.t("alternativeAsset.quickAdd.validation.name_max")),
    currency: z.string().min(1, i18n.t("alternativeAsset.quickAdd.validation.currency_required")),
    quantity: z.coerce
      .number({
        required_error: i18n.t("alternativeAsset.quickAdd.validation.quantity_required"),
        invalid_type_error: i18n.t("alternativeAsset.quickAdd.validation.quantity_invalid_type"),
      })
      .positive(i18n.t("alternativeAsset.quickAdd.validation.quantity_positive")),
    currentValue: z.coerce
      .number({
        required_error: i18n.t("alternativeAsset.quickAdd.validation.value_required"),
        invalid_type_error: i18n.t("alternativeAsset.quickAdd.validation.value_invalid_type"),
      })
      .positive(i18n.t("alternativeAsset.quickAdd.validation.value_positive")),
    valueDate: z.date({
      required_error: i18n.t("alternativeAsset.quickAdd.validation.value_date_required"),
    }),

    // Property-specific: has mortgage checkbox
    hasMortgage: z.boolean().optional(),

    // Precious metal-specific fields
    metalType: z.enum(["gold", "silver", "platinum", "palladium"]).optional(),
    weightUnit: z.enum(["oz", "g", "kg"]).optional(),

    // Liability-specific fields
    liabilityType: z
      .enum([
        "mortgage",
        "auto_loan",
        "student_loan",
        "credit_card",
        "personal_loan",
        "heloc",
        "other",
      ])
      .optional(),
    linkedAssetId: z.string().optional(),
  })
  .refine(
    (data) => {
      // Precious metals require metal type and weight unit
      if (data.kind === AlternativeAssetKind.PRECIOUS_METAL) {
        return !!data.metalType && !!data.weightUnit;
      }
      return true;
    },
    {
      message: i18n.t("alternativeAsset.quickAdd.validation.metal_type_unit_required"),
      path: ["metalType"],
    },
  );

export type AlternativeAssetQuickAddFormValues = z.infer<typeof alternativeAssetQuickAddSchema>;

// Default form values
export const getDefaultFormValues = (): AlternativeAssetQuickAddFormValues => ({
  kind: AlternativeAssetKind.PROPERTY,
  name: "",
  currency: "USD",
  quantity: 1,
  currentValue: 0,
  valueDate: new Date(),
  hasMortgage: false,
  metalType: undefined,
  weightUnit: "oz",
  liabilityType: undefined,
  linkedAssetId: undefined,
});
