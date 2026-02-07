import type { ComponentType } from "react";
import { ActivityType, QuoteMode } from "@/lib/constants";
import type { ActivityDetails } from "@/lib/types";
import { BuyForm, type BuyFormValues } from "../components/forms/buy-form";
import { SellForm, type SellFormValues } from "../components/forms/sell-form";
import { DepositForm, type DepositFormValues } from "../components/forms/deposit-form";
import { WithdrawalForm, type WithdrawalFormValues } from "../components/forms/withdrawal-form";
import { DividendForm, type DividendFormValues } from "../components/forms/dividend-form";
import { TransferForm, type TransferFormValues } from "../components/forms/transfer-form";
import { SplitForm, type SplitFormValues } from "../components/forms/split-form";
import { FeeForm, type FeeFormValues } from "../components/forms/fee-form";
import { InterestForm, type InterestFormValues } from "../components/forms/interest-form";
import { TaxForm, type TaxFormValues } from "../components/forms/tax-form";
import type { AccountSelectOption } from "../components/forms/fields";
import type { NewActivityFormValues } from "../components/forms/schemas";

// Picker activity types (TRANSFER_IN/OUT merged into TRANSFER)
export type PickerActivityType =
  | "BUY"
  | "SELL"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "DIVIDEND"
  | "TRANSFER"
  | "SPLIT"
  | "FEE"
  | "INTEREST"
  | "TAX";

// Pure cash activities that need account currency
export const PURE_CASH_ACTIVITY_TYPES = [
  "DEPOSIT",
  "WITHDRAWAL",
  "FEE",
  "INTEREST",
  "TAX",
] as const;

// Form values union type
export type ActivityFormValues =
  | BuyFormValues
  | SellFormValues
  | DepositFormValues
  | WithdrawalFormValues
  | DividendFormValues
  | TransferFormValues
  | SplitFormValues
  | FeeFormValues
  | InterestFormValues
  | TaxFormValues;

// Common form props interface
export interface ActivityFormComponentProps<T> {
  accounts: AccountSelectOption[];
  defaultValues?: Partial<T>;
  onSubmit: (data: T) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  isEditing?: boolean;
}

// Config for each activity type
export interface ActivityTypeConfig<TFormValues = unknown> {
  component: ComponentType<ActivityFormComponentProps<TFormValues>>;
  activityType: string; // The actual ActivityType to submit
  getDefaults: (
    activity: Partial<ActivityDetails> | undefined,
    accounts: AccountSelectOption[],
  ) => Partial<TFormValues>;
  toPayload: (data: TFormValues) => Partial<NewActivityFormValues>;
}

// Base defaults shared by most forms
function getBaseDefaults(
  activity: Partial<ActivityDetails> | undefined,
  accounts: AccountSelectOption[],
) {
  return {
    accountId: activity?.accountId ?? (accounts.length === 1 ? accounts[0].value : ""),
    activityDate: activity?.date ? new Date(activity.date) : new Date(),
    comment: activity?.comment ?? null,
  };
}

// Configuration for each activity type
export const ACTIVITY_FORM_CONFIG: Record<
  PickerActivityType,
  ActivityTypeConfig<ActivityFormValues>
> = {
  BUY: {
    component: BuyForm as ComponentType<ActivityFormComponentProps<ActivityFormValues>>,
    activityType: ActivityType.BUY,
    getDefaults: (activity, accounts) => ({
      ...getBaseDefaults(activity, accounts),
      assetId: activity?.assetSymbol ?? activity?.assetId ?? "",
      quantity: activity?.quantity,
      unitPrice: activity?.unitPrice,
      amount: activity?.amount,
      fee: activity?.fee ?? "0",
      quoteMode: activity?.assetQuoteMode === "MANUAL" ? QuoteMode.MANUAL : QuoteMode.MARKET,
      // Advanced options
      currency: activity?.currency,
      fxRate: activity?.fxRate ?? undefined,
      exchangeMic: activity?.exchangeMic,
    }),
    toPayload: (data) => {
      const d = data as BuyFormValues;
      return {
        accountId: d.accountId,
        activityDate: d.activityDate,
        assetId: d.assetId,
        quantity: d.quantity,
        unitPrice: d.unitPrice,
        fee: d.fee,
        comment: d.comment,
        quoteMode: d.quoteMode,
        exchangeMic: d.exchangeMic,
        currency: d.currency,
        fxRate: d.fxRate,
        assetMetadata: d.assetMetadata,
      };
    },
  },

  SELL: {
    component: SellForm as ComponentType<ActivityFormComponentProps<ActivityFormValues>>,
    activityType: ActivityType.SELL,
    getDefaults: (activity, accounts) => ({
      ...getBaseDefaults(activity, accounts),
      assetId: activity?.assetSymbol ?? activity?.assetId ?? "",
      quantity: activity?.quantity,
      unitPrice: activity?.unitPrice,
      amount: activity?.amount,
      fee: activity?.fee ?? "0",
      quoteMode: activity?.assetQuoteMode === "MANUAL" ? QuoteMode.MANUAL : QuoteMode.MARKET,
      // Advanced options
      currency: activity?.currency,
      fxRate: activity?.fxRate ?? undefined,
      exchangeMic: activity?.exchangeMic,
    }),
    toPayload: (data) => {
      const d = data as SellFormValues;
      return {
        accountId: d.accountId,
        activityDate: d.activityDate,
        assetId: d.assetId,
        quantity: d.quantity,
        unitPrice: d.unitPrice,
        fee: d.fee,
        comment: d.comment,
        quoteMode: d.quoteMode,
        exchangeMic: d.exchangeMic,
        currency: d.currency,
        fxRate: d.fxRate,
        assetMetadata: d.assetMetadata,
      };
    },
  },

  DEPOSIT: {
    component: DepositForm as ComponentType<ActivityFormComponentProps<ActivityFormValues>>,
    activityType: ActivityType.DEPOSIT,
    getDefaults: (activity, accounts) => ({
      ...getBaseDefaults(activity, accounts),
      amount: activity?.amount,
      // Advanced options
      currency: activity?.currency,
      fxRate: activity?.fxRate ?? undefined,
    }),
    toPayload: (data) => {
      const d = data as DepositFormValues;
      return {
        accountId: d.accountId,
        activityDate: d.activityDate,
        amount: d.amount,
        comment: d.comment,
        currency: d.currency,
        fxRate: d.fxRate,
      };
    },
  },

  WITHDRAWAL: {
    component: WithdrawalForm as ComponentType<ActivityFormComponentProps<ActivityFormValues>>,
    activityType: ActivityType.WITHDRAWAL,
    getDefaults: (activity, accounts) => ({
      ...getBaseDefaults(activity, accounts),
      amount: activity?.amount,
      // Advanced options
      currency: activity?.currency,
      fxRate: activity?.fxRate ?? undefined,
    }),
    toPayload: (data) => {
      const d = data as WithdrawalFormValues;
      return {
        accountId: d.accountId,
        activityDate: d.activityDate,
        amount: d.amount,
        comment: d.comment,
        currency: d.currency,
        fxRate: d.fxRate,
      };
    },
  },

  DIVIDEND: {
    component: DividendForm as ComponentType<ActivityFormComponentProps<ActivityFormValues>>,
    activityType: ActivityType.DIVIDEND,
    getDefaults: (activity, accounts) => ({
      ...getBaseDefaults(activity, accounts),
      symbol: activity?.assetSymbol ?? activity?.assetId ?? "",
      amount: activity?.amount,
      // Advanced options
      currency: activity?.currency,
      fxRate: activity?.fxRate ?? undefined,
      subtype: activity?.subtype ?? null,
      exchangeMic: activity?.exchangeMic,
    }),
    toPayload: (data) => {
      const d = data as DividendFormValues;
      return {
        accountId: d.accountId,
        activityDate: d.activityDate,
        assetId: d.symbol,
        amount: d.amount,
        comment: d.comment,
        subtype: d.subtype,
        currency: d.currency,
        fxRate: d.fxRate,
        exchangeMic: d.exchangeMic,
      };
    },
  },

  TRANSFER: {
    component: TransferForm as ComponentType<ActivityFormComponentProps<ActivityFormValues>>,
    activityType: ActivityType.TRANSFER_OUT,
    getDefaults: (activity, _accounts) => {
      // Derive transferMode from existing activity data
      const hasSecurityData = !!(activity?.assetSymbol || activity?.assetId);
      const transferMode = hasSecurityData ? "securities" : "cash";
      // Derive isExternal from metadata (if flow.is_external is true)
      const flowMetadata = activity?.metadata?.flow as { is_external?: boolean } | undefined;
      const isExternal = flowMetadata?.is_external === true;
      // Derive direction from activity type
      const direction = activity?.activityType === ActivityType.TRANSFER_IN ? "in" : "out";
      return {
        isExternal,
        direction,
        accountId: isExternal ? (activity?.accountId ?? "") : "",
        fromAccountId: !isExternal ? (activity?.accountId ?? "") : "",
        toAccountId: "",
        activityDate: activity?.date ? new Date(activity.date) : new Date(),
        transferMode,
        amount: activity?.amount,
        assetId: activity?.assetSymbol ?? activity?.assetId ?? null,
        quantity: activity?.quantity ?? null,
        comment: activity?.comment ?? null,
        // Advanced options
        currency: activity?.currency,
        fxRate: activity?.fxRate ?? undefined,
        subtype: activity?.subtype ?? null,
        quoteMode: activity?.assetQuoteMode === "MANUAL" ? QuoteMode.MANUAL : QuoteMode.MARKET,
        exchangeMic: activity?.exchangeMic,
      };
    },
    toPayload: (data) => {
      const d = data as TransferFormValues;
      // For external transfers, use accountId; for internal, use fromAccountId
      const accountId = d.isExternal ? d.accountId : d.fromAccountId;
      return {
        accountId,
        activityDate: d.activityDate,
        amount: d.amount,
        assetId: d.assetId ?? undefined,
        quantity: d.quantity ?? undefined,
        comment: d.comment,
        subtype: d.subtype,
        currency: d.currency,
        fxRate: d.fxRate,
        quoteMode: d.quoteMode,
        exchangeMic: d.exchangeMic,
        assetMetadata: d.assetMetadata,
        // Include external transfer metadata
        ...(d.isExternal && { metadata: { flow: { is_external: true } } }),
      };
    },
  },

  SPLIT: {
    component: SplitForm as ComponentType<ActivityFormComponentProps<ActivityFormValues>>,
    activityType: ActivityType.SPLIT,
    getDefaults: (activity, accounts) => ({
      ...getBaseDefaults(activity, accounts),
      symbol: activity?.assetSymbol ?? activity?.assetId ?? "",
      splitRatio: activity?.amount,
      // Advanced options
      currency: activity?.currency,
      subtype: activity?.subtype ?? null,
      exchangeMic: activity?.exchangeMic,
    }),
    toPayload: (data) => {
      const d = data as SplitFormValues;
      return {
        accountId: d.accountId,
        activityDate: d.activityDate,
        assetId: d.symbol,
        amount: d.splitRatio,
        comment: d.comment,
        subtype: d.subtype,
        currency: d.currency,
        exchangeMic: d.exchangeMic,
      };
    },
  },

  FEE: {
    component: FeeForm as ComponentType<ActivityFormComponentProps<ActivityFormValues>>,
    activityType: ActivityType.FEE,
    getDefaults: (activity, accounts) => ({
      ...getBaseDefaults(activity, accounts),
      amount: activity?.amount,
      // Advanced options
      currency: activity?.currency,
      subtype: activity?.subtype ?? null,
    }),
    toPayload: (data) => {
      const d = data as FeeFormValues;
      return {
        accountId: d.accountId,
        activityDate: d.activityDate,
        amount: d.amount,
        comment: d.comment,
        subtype: d.subtype,
        currency: d.currency,
      };
    },
  },

  INTEREST: {
    component: InterestForm as ComponentType<ActivityFormComponentProps<ActivityFormValues>>,
    activityType: ActivityType.INTEREST,
    getDefaults: (activity, accounts) => ({
      ...getBaseDefaults(activity, accounts),
      amount: activity?.amount,
      // Advanced options
      currency: activity?.currency,
      subtype: activity?.subtype ?? null,
    }),
    toPayload: (data) => {
      const d = data as InterestFormValues;
      return {
        accountId: d.accountId,
        activityDate: d.activityDate,
        amount: d.amount,
        comment: d.comment,
        subtype: d.subtype,
        currency: d.currency,
      };
    },
  },

  TAX: {
    component: TaxForm as ComponentType<ActivityFormComponentProps<ActivityFormValues>>,
    activityType: ActivityType.TAX,
    getDefaults: (activity, accounts) => ({
      ...getBaseDefaults(activity, accounts),
      amount: activity?.amount,
      // Advanced options
      currency: activity?.currency,
      subtype: activity?.subtype ?? null,
    }),
    toPayload: (data) => {
      const d = data as TaxFormValues;
      return {
        accountId: d.accountId,
        activityDate: d.activityDate,
        amount: d.amount,
        comment: d.comment,
        subtype: d.subtype,
        currency: d.currency,
      };
    },
  },
};
