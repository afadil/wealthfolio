import { z } from "zod";
import {
  Card,
  CardContent,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  MoneyInput,
} from "@wealthfolio/ui";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { AccountSelectOption } from "../activity-form";
import {
  ActivityTypeSelector,
  type ActivityType as ActivityTypeUI,
} from "../activity-type-selector";
import { ConfigurationCheckbox, CommonFields } from "./common";
import { cashActivitySchema } from "./schemas";

export type CashFormValues = z.infer<typeof cashActivitySchema>;

export const CashForm = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { t } = useTranslation("activity");
  const { control } = useFormContext();

  const cashTypes: ActivityTypeUI[] = [
    {
      value: "DEPOSIT",
      label: t("type_deposit"),
      icon: "ArrowDown",
      description: t("type_deposit_desc"),
    },
    {
      value: "WITHDRAWAL",
      label: t("type_withdrawal"),
      icon: "ArrowUp",
      description: t("type_withdrawal_desc"),
    },
    {
      value: "TRANSFER_IN",
      label: t("type_transfer_in"),
      icon: "ArrowDown",
      description: t("type_transfer_in_desc"),
    },
    {
      value: "TRANSFER_OUT",
      label: t("type_transfer_out"),
      icon: "ArrowUp",
      description: t("type_transfer_out_desc"),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <ActivityTypeSelector control={control} types={cashTypes} columns={4} />
        </div>
      </div>
      <Card>
        <CardContent className="space-y-6 pt-2">
          <ConfigurationCheckbox showCurrencyOption={true} shouldShowSymbolLookup={false} />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("field_amount")}</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="fee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("field_fee")}</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <CommonFields accounts={accounts} />
        </CardContent>
      </Card>
    </div>
  );
};
