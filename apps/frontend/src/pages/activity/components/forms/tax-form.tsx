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
  type AccountSelectOption,
} from "./fields";

export function createTaxFormSchema() {
  return z.object({
    accountId: z.string().min(1, { message: i18n.t("activity.validation.account_required") }),
    activityDate: z.date({ required_error: i18n.t("activity.validation.select_date") }),
    amount: z.coerce
      .number({
        required_error: i18n.t("activity.validation.enter_amount"),
        invalid_type_error: i18n.t("activity.validation.amount_invalid_type"),
      })
      .positive({ message: i18n.t("activity.validation.amount_greater_than_zero") }),
    comment: z.string().optional().nullable(),
    currency: z.string().min(1, { message: i18n.t("activity.validation.currency_required") }),
    subtype: z.string().optional().nullable(),
  });
}

export type TaxFormValues = z.infer<ReturnType<typeof createTaxFormSchema>>;

interface TaxFormProps {
  accounts: AccountSelectOption[];
  defaultValues?: Partial<TaxFormValues>;
  onSubmit: (data: TaxFormValues) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  isEditing?: boolean;
}

export function TaxForm({
  accounts,
  defaultValues,
  onSubmit,
  onCancel,
  isLoading = false,
  isEditing = false,
}: TaxFormProps) {
  const { t, i18n } = useTranslation();
  const taxFormSchema = useMemo(() => createTaxFormSchema(), [i18n.language]);
  const { data: settings } = useSettings();
  const baseCurrency = settings?.baseCurrency;

  // Compute initial account and currency for defaultValues
  const initialAccountId =
    defaultValues?.accountId ?? (accounts.length === 1 ? accounts[0].value : "");
  const initialAccount = accounts.find((a) => a.value === initialAccountId);
  const initialCurrency = defaultValues?.currency?.trim() || initialAccount?.currency;

  const form = useForm<TaxFormValues>({
    resolver: zodResolver(taxFormSchema) as Resolver<TaxFormValues>,
    mode: "onSubmit", // Validate only on submit - works correctly with default values
    defaultValues: {
      accountId: initialAccountId,
      activityDate: new Date(),
      amount: undefined,
      comment: null,
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

            {/* Date Picker */}
            <DatePicker name="activityDate" label={t("activity.form.fields.activityDate")} />

            {/* Amount */}
            <AmountInput name="amount" label={t("activity.form.fields.amount")} currency={currency} />

            {/* Advanced Options */}
            <AdvancedOptionsSection
              currencyName="currency"
              subtypeName="subtype"
              activityType={ActivityType.TAX}
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
            {isEditing ? t("activity.form.update") : t("activity.form.submit.add_tax")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
