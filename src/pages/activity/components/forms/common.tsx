import { useFormContext } from "react-hook-form";
import { AccountSelectOption } from "../activity-form";
import { FormField } from "@wealthvn/ui";
import { FormItem } from "@wealthvn/ui";
import { FormLabel } from "@wealthvn/ui";
import { FormControl } from "@wealthvn/ui";
import { FormMessage } from "@wealthvn/ui";
import { Select } from "@wealthvn/ui";
import { SelectContent } from "@wealthvn/ui";
import { SelectItem } from "@wealthvn/ui";
import { SelectTrigger } from "@wealthvn/ui";
import { SelectValue } from "@wealthvn/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@wealthvn/ui";
import { DatePickerInput } from "@wealthvn/ui";
import { Textarea } from "@/components/ui/textarea";
import TickerSearchInput from "@/components/ticker-search";
import { DataSource } from "@/lib/constants";
import { useTranslation } from "react-i18next";

export interface ConfigurationCheckboxProps {
  showCurrencyOption?: boolean;
  shouldShowSymbolLookup?: boolean;
}

export const ConfigurationCheckbox = ({
  showCurrencyOption = true,
  shouldShowSymbolLookup = true,
}: ConfigurationCheckboxProps) => {
  const { control } = useFormContext();
  const { t } = useTranslation(["activity"]);

  return (
    <div className="flex items-center justify-end space-x-6">
      {shouldShowSymbolLookup && (
        <FormField
          control={control}
          name="assetDataSource"
          render={({ field }) => (
            <FormItem className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="use-lookup-checkbox"
                    className="text-muted-foreground hover:text-foreground cursor-pointer text-sm"
                  >
                    {t("activity:form.skipSymbolLookup")}
                  </label>
                  <Checkbox
                    id="use-lookup-checkbox"
                    checked={field.value === DataSource.MANUAL}
                    onCheckedChange={(checked) => {
                      field.onChange(checked ? DataSource.MANUAL : DataSource.YAHOO);
                    }}
                    defaultChecked={field.value === DataSource.MANUAL}
                    className="h-4 w-4"
                  />
                </div>
              </div>
            </FormItem>
          )}
        />
      )}
      {showCurrencyOption && (
        <FormField
          control={control}
          name="showCurrencySelect"
          render={({ field }) => (
            <FormItem className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <label
                    htmlFor="use-different-currency-checkbox"
                    className="text-muted-foreground hover:text-foreground cursor-pointer text-sm"
                  >
                    {t("activity:form.useDifferentCurrency")}
                  </label>
                  <Checkbox
                    id="use-different-currency-checkbox"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="h-4 w-4"
                  />
                </div>
              </div>
            </FormItem>
          )}
        />
      )}
    </div>
  );
};

export const CommonFields = ({
  accounts,
  isTransfer = false,
}: {
  accounts: AccountSelectOption[];
  isTransfer?: boolean;
}) => {
  const { control, watch } = useFormContext();
  const { t } = useTranslation(["activity"]);
  const showCurrency = watch("showCurrencySelect");

  return (
    <>
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
                      <span className="text-muted-foreground font-light">({account.currency})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
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
    </>
  );
};

export function AssetSymbolInput({
  field,
  isManualAsset,
}: {
  field: { value?: string; onChange: (v: string) => void } & Record<string, unknown>;
  isManualAsset: boolean;
}) {
  const { t } = useTranslation(["activity"]);

  return (
    <FormItem className="-mt-2">
      <FormLabel>{t("activity:form.symbol")}</FormLabel>
      <FormControl>
        {isManualAsset ? (
          <Input
            placeholder={t("activity:form.enterSymbol")}
            className="h-10"
            {...field}
            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
          />
        ) : (
          <TickerSearchInput onSelectResult={field.onChange} {...field} />
        )}
      </FormControl>
      <FormMessage className="text-xs" />
    </FormItem>
  );
}
