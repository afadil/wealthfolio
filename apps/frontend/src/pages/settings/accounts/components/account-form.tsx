import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@wealthfolio/ui/components/ui/button";
import { Checkbox } from "@wealthfolio/ui/components/ui/checkbox";

import { newAccountSchema } from "@/lib/schemas";
import {
  CurrencyInput,
  RadioGroup,
  RadioGroupItem,
  ResponsiveSelect,
  type ResponsiveSelectOption,
} from "@wealthfolio/ui";
import { Alert, AlertDescription } from "@wealthfolio/ui/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@wealthfolio/ui/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@wealthfolio/ui/components/ui/form";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Input } from "@wealthfolio/ui/components/ui/input";

import { useAccountMutations } from "./use-account-mutations";

// Input type (what the form receives)
type AccountFormInput = z.input<typeof newAccountSchema>;
// Output type after zod parsing (with defaults applied)
type AccountFormOutput = z.output<typeof newAccountSchema>;

interface AccountFormlProps {
  defaultValues?: AccountFormInput;
  onSuccess?: () => void;
}

export function AccountForm({ defaultValues, onSuccess = () => undefined }: AccountFormlProps) {
  const { t } = useTranslation("common");
  const accountTypes: ResponsiveSelectOption[] = useMemo(
    () => [
      { label: t("settings.accounts.type_securities"), value: "SECURITIES" },
      { label: t("settings.accounts.type_cash"), value: "CASH" },
      { label: t("settings.accounts.type_crypto"), value: "CRYPTOCURRENCY" },
    ],
    [t],
  );
  const { createAccountMutation, updateAccountMutation } = useAccountMutations({ onSuccess });

  // Track initial tracking mode to detect changes
  const initialTrackingMode = defaultValues?.trackingMode;
  const needsSetup = initialTrackingMode === "NOT_SET" || initialTrackingMode === undefined;

  // State for mode switch confirmation dialog
  const [showModeConfirmation, setShowModeConfirmation] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<AccountFormOutput | null>(null);

  const form = useForm<AccountFormInput, unknown, AccountFormOutput>({
    resolver: zodResolver(newAccountSchema),
    defaultValues: {
      ...defaultValues,
      // Don't default to any mode if account needs setup (must come after spread)
      trackingMode: needsSetup ? undefined : defaultValues?.trackingMode,
    },
  });

  const currentTrackingMode = form.watch("trackingMode");

  // Perform the actual submit (after confirmation if needed)
  // Returns a promise when updating so it can be chained with other operations
  const doSubmit = useCallback(
    (data: AccountFormOutput, options?: { async?: boolean }) => {
      const { id, trackingMode, ...rest } = data;

      if (id) {
        if (options?.async) {
          return updateAccountMutation.mutateAsync({
            id,
            trackingMode,
            ...rest,
          });
        }
        return updateAccountMutation.mutate({ id, trackingMode, ...rest });
      }
      return createAccountMutation.mutate({ trackingMode, ...rest });
    },
    [createAccountMutation, updateAccountMutation],
  );

  function onSubmit(data: AccountFormOutput) {
    // Check if this is an existing account (update) and mode is switching from HOLDINGS to TRANSACTIONS
    const isExistingAccount = !!data.id;
    const isSwitchingFromHoldingsToTransactions =
      !needsSetup && initialTrackingMode === "HOLDINGS" && data.trackingMode === "TRANSACTIONS";

    if (isExistingAccount && isSwitchingFromHoldingsToTransactions) {
      // Show confirmation dialog
      setPendingFormData(data);
      setShowModeConfirmation(true);
      return;
    }

    // Otherwise, submit directly
    doSubmit(data);
  }

  // Handle confirmation dialog actions
  const handleConfirmModeSwitch = async () => {
    setShowModeConfirmation(false);
    if (pendingFormData?.id) {
      try {
        // Save all account details including tracking mode
        await doSubmit(pendingFormData, { async: true });
      } finally {
        setPendingFormData(null);
      }
    }
  };

  const handleCancelModeSwitch = () => {
    setShowModeConfirmation(false);
    setPendingFormData(null);
    // Revert the tracking mode in the form
    form.setValue("trackingMode", initialTrackingMode);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <DialogHeader>
          <DialogTitle>
            {defaultValues?.id
              ? t("settings.accounts.form_title_update")
              : t("settings.accounts.form_title_add")}
          </DialogTitle>
          <DialogDescription>
            {defaultValues?.id
              ? t("settings.accounts.form_desc_update")
              : t("settings.accounts.form_desc_add")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 p-4">
          <input type="hidden" name="id" />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("settings.accounts.label_name")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("settings.accounts.placeholder_name")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="group"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("settings.accounts.label_group")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("settings.accounts.placeholder_group")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="accountType"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>{t("settings.accounts.label_type")}</FormLabel>
                <FormControl>
                  <ResponsiveSelect
                    value={field.value}
                    onValueChange={field.onChange}
                    options={accountTypes}
                    placeholder={t("settings.accounts.placeholder_type")}
                    sheetTitle={t("settings.accounts.sheet_type_title")}
                    sheetDescription={t("settings.accounts.sheet_type_desc")}
                    triggerClassName="h-11"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {!defaultValues?.id ? (
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>{t("settings.accounts.label_currency")}</FormLabel>
                  <FormControl>
                    <CurrencyInput
                      value={field.value}
                      onChange={(value: string) => field.onChange(value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}

          <FormField
            control={form.control}
            name="trackingMode"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel>{t("settings.accounts.label_tracking")}</FormLabel>
                {needsSetup && !currentTrackingMode && (
                  <Alert
                    variant="warning"
                    className="px-3 py-2.5 [&>svg]:left-3 [&>svg]:top-2.5 [&>svg~*]:pl-6"
                  >
                    <Icons.AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      {t("settings.accounts.setup_alert")}{" "}
                      <a
                        href="https://wealthfolio.app/docs/concepts/activity-types"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground underline"
                      >
                        {t("settings.accounts.learn_more")}
                      </a>
                    </AlertDescription>
                  </Alert>
                )}
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    value={field.value}
                    className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                  >
                    <label
                      className={`hover:bg-accent relative flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                        field.value === "TRANSACTIONS"
                          ? "border-primary bg-primary/5"
                          : "border-muted"
                      }`}
                    >
                      <RadioGroupItem value="TRANSACTIONS" className="mt-0.5" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{t("settings.accounts.tracking_tx_title")}</span>
                        <span className="text-muted-foreground text-xs">
                          {t("settings.accounts.tracking_tx_desc")}
                        </span>
                      </div>
                    </label>
                    <label
                      className={`hover:bg-accent relative flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                        field.value === "HOLDINGS" ? "border-primary bg-primary/5" : "border-muted"
                      }`}
                    >
                      <RadioGroupItem value="HOLDINGS" className="mt-0.5" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{t("settings.accounts.tracking_hold_title")}</span>
                        <span className="text-muted-foreground text-xs">
                          {t("settings.accounts.tracking_hold_desc")}
                        </span>
                      </div>
                    </label>
                  </RadioGroup>
                </FormControl>
                {field.value === "HOLDINGS" && (
                  <Alert
                    variant="warning"
                    className="px-3 py-2.5 [&>svg]:left-3 [&>svg]:top-2.5 [&>svg~*]:pl-6"
                  >
                    <Icons.AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      {t("settings.accounts.holdings_warning")}{" "}
                      <a
                        href="https://wealthfolio.app/docs/concepts/activity-types"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground underline"
                      >
                        {t("settings.accounts.learn_more")}
                      </a>
                    </AlertDescription>
                  </Alert>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex items-center space-x-3 space-y-0 rounded-lg border p-3">
                <FormControl>
                  <Checkbox
                    checked={!field.value}
                    onCheckedChange={(checked) => field.onChange(!checked)}
                  />
                </FormControl>
                <FormLabel className="text-sm font-normal">
                  {t("settings.accounts.hide_label")}
                  <span className="text-muted-foreground ml-1 text-xs font-normal">
                    {t("settings.accounts.hide_hint")}
                  </span>
                </FormLabel>
                <FormMessage />
              </FormItem>
            )}
          />

          {defaultValues?.id && (
            <FormField
              control={form.control}
              name="isArchived"
              render={({ field }) => (
                <FormItem className="border-destructive/30 flex items-center space-x-3 space-y-0 rounded-lg border p-3">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="text-sm font-normal">
                    {t("settings.accounts.archive_label")}
                    <span className="text-muted-foreground ml-1 text-xs font-normal">
                      {t("settings.accounts.archive_hint")}
                    </span>
                  </FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
        <DialogFooter className="gap-2">
          <DialogTrigger asChild>
            <Button variant="outline">{t("settings.shared.cancel")}</Button>
          </DialogTrigger>
          <Button type="submit" disabled={needsSetup && !currentTrackingMode}>
            {defaultValues?.id ? (
              <Icons.Save className="h-4 w-4" />
            ) : (
              <Icons.Plus className="h-4 w-4" />
            )}
            <span>
              {defaultValues?.id
                ? t("settings.accounts.submit_update")
                : t("settings.accounts.submit_add")}
            </span>
          </Button>
        </DialogFooter>
      </form>

      {/* Mode Switch Confirmation Dialog */}
      <AlertDialog open={showModeConfirmation} onOpenChange={setShowModeConfirmation}>
        <AlertDialogContent className="max-w-105 gap-0 overflow-hidden p-0">
          <div className="px-5 pb-4 pt-5">
            <AlertDialogHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100/30 dark:bg-orange-100/20">
                  <Icons.ArrowRightLeft className="h-4 w-4 text-orange-500 dark:text-orange-300" />
                </div>
                <AlertDialogTitle className="text-base font-semibold">
                  {t("settings.accounts.switch_mode_title")}
                </AlertDialogTitle>
              </div>
              <AlertDialogDescription>{t("settings.accounts.switch_mode_desc")}</AlertDialogDescription>
            </AlertDialogHeader>

            {/* Checklist */}
            <div className="mt-4 rounded-lg border border-orange-100/40 bg-orange-100/30 p-3 dark:border-orange-100/20 dark:bg-orange-100/20">
              <p className="mb-2 text-xs font-medium text-orange-600 dark:text-orange-200">
                {t("settings.accounts.switch_checklist_title")}
              </p>
              <ul className="space-y-2 text-[13px]">
                <li className="flex items-start gap-2">
                  <Icons.Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500 dark:text-orange-300" />
                  <span className="text-orange-500 dark:text-orange-200">
                    {t("settings.accounts.switch_item_complete")}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Icons.Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500 dark:text-orange-300" />
                  <span className="text-orange-500 dark:text-orange-200">
                    {t("settings.accounts.switch_item_accurate")}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Icons.AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-600 dark:text-orange-300" />
                  <span className="text-orange-500 dark:text-orange-200">
                    {t("settings.accounts.switch_item_gaps")}
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <AlertDialogFooter className="bg-muted/30 border-t px-5 py-3">
            <AlertDialogCancel onClick={handleCancelModeSwitch}>
              {t("settings.accounts.switch_keep_holdings")}
            </AlertDialogCancel>
            <Button onClick={handleConfirmModeSwitch}>{t("settings.accounts.switch_confirm")}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  );
}
