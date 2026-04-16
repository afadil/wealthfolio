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
  AmountInput,
  createValidatedSubmit,
  DatePicker,
  NotesInput,
  SymbolSearch,
  type AccountSelectOption,
} from "./fields";

export function createInterestFormSchema() {
  return z.object({
    accountId: z.string().min(1, { message: i18n.t("activity.validation.account_required") }),
    activityDate: z.date({ required_error: i18n.t("activity.validation.select_date") }),
    symbol: z.string().optional().nullable(),
    exchangeMic: z.string().nullable().optional(),
    amount: z.coerce
      .number({
        required_error: i18n.t("activity.validation.enter_amount"),
        invalid_type_error: i18n.t("activity.validation.amount_invalid_type"),
      })
      .positive({ message: i18n.t("activity.validation.amount_greater_than_zero") }),
    comment: z.string().optional().nullable(),
    currency: z.string().min(1, { message: i18n.t("activity.validation.currency_required") }),
    fxRate: z.coerce
      .number({
        invalid_type_error: i18n.t("activity.validation.fx_rate_must_be_number"),
      })
      .positive({ message: i18n.t("activity.validation.fx_rate_positive_short") })
      .optional(),
    subtype: z.string().optional().nullable(),
    symbolQuoteCcy: z.string().nullable().optional(),
    symbolInstrumentType: z.string().nullable().optional(),
  });
}

export type InterestFormValues = z.infer<ReturnType<typeof createInterestFormSchema>>;

interface InterestFormProps {
  accounts: AccountSelectOption[];
  defaultValues?: Partial<InterestFormValues>;
  onSubmit: (data: InterestFormValues) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  isEditing?: boolean;
}

export function InterestForm({
  accounts,
  defaultValues,
  onSubmit,
  onCancel,
  isLoading = false,
  isEditing = false,
}: InterestFormProps) {
  const { t, i18n } = useTranslation();
  const interestFormSchema = useMemo(() => createInterestFormSchema(), [i18n.language]);
  const { data: settings } = useSettings();
  const baseCurrency = settings?.baseCurrency;

  // Compute initial account and currency for defaultValues
  const initialAccountId =
    defaultValues?.accountId ?? (accounts.length === 1 ? accounts[0].value : "");
  const initialAccount = accounts.find((a) => a.value === initialAccountId);
  const initialCurrency = defaultValues?.currency?.trim() || initialAccount?.currency;

  const form = useForm<InterestFormValues>({
    resolver: zodResolver(interestFormSchema) as Resolver<InterestFormValues>,
    mode: "onSubmit", // Validate only on submit - works correctly with default values
    defaultValues: {
      accountId: initialAccountId,
      activityDate: new Date(),
      symbol: null,
      amount: undefined,
      comment: null,
      fxRate: undefined,
      subtype: null,
      ...defaultValues,
      currency: defaultValues?.currency?.trim() || initialCurrency,
    },
  });

  const { watch } = form;
  const accountId = watch("accountId");
  const currency = watch("currency");

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

            {/* Optional Symbol (e.g., for bond interest) */}
            <SymbolSearch
              name="symbol"
              label={t("activity.form.fields.symbol_optional")}
              exchangeMicName="exchangeMic"
              currencyName="currency"
              quoteCcyName="symbolQuoteCcy"
              instrumentTypeName="symbolInstrumentType"
            />
            <input type="hidden" {...form.register("symbolQuoteCcy")} />
            <input type="hidden" {...form.register("symbolInstrumentType")} />

            {/* Date Picker */}
            <DatePicker name="activityDate" label={t("activity.form.fields.activityDate")} />

            {/* Amount */}
            <AmountInput name="amount" label={t("activity.form.fields.amount")} currency={currency} />

            {/* Advanced Options */}
            <AdvancedOptionsSection
              currencyName="currency"
              fxRateName="fxRate"
              subtypeName="subtype"
              activityType={ActivityType.INTEREST}
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
            {isEditing ? t("activity.form.update") : t("activity.form.submit.add_interest")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
