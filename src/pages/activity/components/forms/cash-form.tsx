import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CurrencyInput,
  DatePickerInput,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  MoneyInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthvn/ui";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AccountSelectOption } from "../activity-form";
import {
  ActivityTypeSelector,
  type ActivityType as ActivityTypeUI,
} from "../activity-type-selector";
import { ConfigurationCheckbox } from "./common";
import { cashActivitySchema } from "./schemas";

export type CashFormValues = z.infer<typeof cashActivitySchema>;

export const CashForm = ({ accounts }: { accounts: AccountSelectOption[] }) => {
  const { t } = useTranslation(["activity"]);
  const { control, watch } = useFormContext();
  const activityType = watch("activityType");
  const showCurrency = watch("showCurrencySelect");

  const cashTypes: ActivityTypeUI[] = [
    {
      value: "DEPOSIT",
      label: t("activity:form.deposit"),
      icon: "ArrowDown",
      description: t("activity:form.depositDescription"),
    },
    {
      value: "WITHDRAWAL",
      label: t("activity:form.withdrawal"),
      icon: "ArrowUp",
      description: t("activity:form.withdrawalDescription"),
    },
    {
      value: "TRANSFER",
      label: t("activity:form.transfer"),
      icon: "ArrowRightLeft",
      description: t("activity:form.transferDescription"),
    },
  ];

  const isTransfer = activityType === "TRANSFER";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <ActivityTypeSelector control={control} types={cashTypes} columns={3} />
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
                  <FormLabel>{t("activity:form.amount")}</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} aria-label="Amount" />
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
                  <FormLabel>{t("activity:form.fee")}</FormLabel>
                  <FormControl>
                    <MoneyInput {...field} aria-label="Fee" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Account field */}
          <FormField
            control={control}
            name="accountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {isTransfer ? t("activity:form.fromAccount") : t("activity:form.account")}
                </FormLabel>
                <FormControl>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("activity:form.selectAccount")} />
                    </SelectTrigger>
                    <SelectContent className="max-h-[500px] overflow-y-auto">
                      {accounts.map((account) => (
                        <SelectItem value={account.value} key={account.value}>
                          {account.label}
                          <span className="text-muted-foreground font-light">
                            ({account.currency})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* To Account field - only shown for TRANSFER */}
          {isTransfer && (
            <FormField
              control={control}
              name="toAccountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("activity:form.toAccount")}</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("activity:form.selectDestinationAccount")} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[500px] overflow-y-auto">
                        {accounts.map((account) => (
                          <SelectItem value={account.value} key={account.value}>
                            {account.label}
                            <span className="text-muted-foreground font-light">
                              ({account.currency})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Date field */}
          <FormField
            control={control}
            name="activityDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>{t("activity:form.date")}</FormLabel>
                <DatePickerInput
                  onChange={(date: Date | undefined) => field.onChange(date)}
                  value={field.value}
                  disabled={field.disabled}
                  enableTime={true}
                  timeGranularity="minute"
                />
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Currency field - conditional */}
          {showCurrency && (
            <FormField
              control={control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("activity:form.activityCurrency")}</FormLabel>
                  <FormControl>
                    <CurrencyInput {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Description field */}
          <FormField
            control={control}
            name="comment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("activity:form.description")}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t("activity:form.descriptionPlaceholder")}
                    className="resize-none"
                    rows={3}
                    {...field}
                    value={field.value || ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
};
