import i18n from "@/i18n/i18n";
import { useSettings } from "@/hooks/use-settings";
import { ActivityType } from "@/lib/constants";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Card, CardContent } from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { useMemo } from "react";
import { FormProvider, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
  AccountSelect,
  AdvancedOptionsSection,
  createValidatedSubmit,
  DatePicker,
  NotesInput,
  QuantityInput,
  SymbolSearch,
  type AccountSelectOption,
} from "./fields";

export function createSplitFormSchema() {
  return z.object({
    accountId: z.string().min(1, { message: i18n.t("activity.validation.account_required") }),
    symbol: z.string().min(1, { message: i18n.t("activity.validation.enter_symbol") }),
    exchangeMic: z.string().nullable().optional(),
    activityDate: z.date({ required_error: i18n.t("activity.validation.select_date") }),
    splitRatio: z.coerce
      .number({
        required_error: i18n.t("activity.validation.enter_split_ratio"),
        invalid_type_error: i18n.t("activity.validation.split_ratio_must_be_number"),
      })
      .positive({ message: i18n.t("activity.validation.split_ratio_greater_than_zero") }),
    comment: z.string().optional().nullable(),
    currency: z.string().min(1, { message: i18n.t("activity.validation.currency_required") }),
    subtype: z.string().optional().nullable(),
    symbolQuoteCcy: z.string().nullable().optional(),
    symbolInstrumentType: z.string().nullable().optional(),
  });
}

export type SplitFormValues = z.infer<ReturnType<typeof createSplitFormSchema>>;

interface SplitFormProps {
  accounts: AccountSelectOption[];
  defaultValues?: Partial<SplitFormValues>;
  onSubmit: (data: SplitFormValues) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  isEditing?: boolean;
  /** Whether to show manual symbol input instead of search */
  isManualSymbol?: boolean;
  /** Asset currency (from selected symbol) for advanced options */
  assetCurrency?: string;
}

export function SplitForm({
  accounts,
  defaultValues,
  onSubmit,
  onCancel,
  isLoading = false,
  isEditing = false,
  isManualSymbol = false,
  assetCurrency,
}: SplitFormProps) {
  const { t, i18n } = useTranslation("common");
  const splitFormSchema = useMemo(() => createSplitFormSchema(), [i18n.language]);
  const { data: settings } = useSettings();
  const baseCurrency = settings?.baseCurrency;

  // Compute initial account and currency for defaultValues
  const initialAccountId =
    defaultValues?.accountId ?? (accounts.length === 1 ? accounts[0].value : "");
  const initialAccount = accounts.find((a) => a.value === initialAccountId);
  const initialCurrency =
    defaultValues?.currency?.trim() || assetCurrency?.trim() || initialAccount?.currency;

  const form = useForm<SplitFormValues>({
    resolver: zodResolver(splitFormSchema) as Resolver<SplitFormValues>,
    mode: "onSubmit", // Validate only on submit - works correctly with default values
    defaultValues: {
      accountId: initialAccountId,
      symbol: "",
      activityDate: new Date(),
      splitRatio: undefined,
      comment: null,
      subtype: null,
      ...defaultValues,
      currency: defaultValues?.currency?.trim() || initialCurrency,
    },
  });

  const { watch } = form;
  const accountId = watch("accountId");

  // Get account currency from selected account
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.value === accountId),
    [accounts, accountId],
  );
  const accountCurrency = selectedAccount?.currency;

  const handleSubmit = createValidatedSubmit(form, async (data) => {
    await onSubmit(data);
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-6 pt-4">
            {/* Account Selection */}
            <AccountSelect name="accountId" accounts={accounts} currencyName="currency" />

            {/* Symbol Search/Input */}
            <SymbolSearch
              name="symbol"
              label={t("activity.form.fields.symbol")}
              isManualAsset={isManualSymbol}
              exchangeMicName="exchangeMic"
              currencyName="currency"
              quoteCcyName="symbolQuoteCcy"
              instrumentTypeName="symbolInstrumentType"
            />
            <input type="hidden" {...form.register("symbolQuoteCcy")} />
            <input type="hidden" {...form.register("symbolInstrumentType")} />

            {/* Date Picker */}
            <DatePicker name="activityDate" label={t("activity.form.fields.activityDate")} />

            {/* Split Ratio */}
            <QuantityInput
              name="splitRatio"
              label={t("activity.form.fields.splitRatio")}
              placeholder={t("activity.form.split_ratio_placeholder")}
            />

            {/* Advanced Options */}
            <AdvancedOptionsSection
              currencyName="currency"
              subtypeName="subtype"
              activityType={ActivityType.SPLIT}
              assetCurrency={assetCurrency}
              accountCurrency={accountCurrency}
              baseCurrency={baseCurrency}
            />

            {/* Notes */}
            <NotesInput name="comment" />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              {t("activity.form.cancel")}
            </Button>
          )}
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? (
              <Icons.Check className="mr-2 h-4 w-4" />
            ) : (
              <Icons.Plus className="mr-2 h-4 w-4" />
            )}
            {isEditing ? t("activity.form.update") : t("activity.form.submit.add_split")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
