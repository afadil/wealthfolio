import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useState, useCallback } from "react";

import { Button } from "@wealthfolio/ui/components/ui/button";
import { Switch } from "@wealthfolio/ui/components/ui/switch";

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
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import { newAccountSchema } from "@/lib/schemas";
import {
  CurrencyInput,
  RadioGroup,
  RadioGroupItem,
  ResponsiveSelect,
  type ResponsiveSelectOption,
} from "@wealthfolio/ui";
import { Alert, AlertDescription } from "@wealthfolio/ui/components/ui/alert";

import { useAccountMutations } from "./use-account-mutations";
import { setTrackingMode } from "@/lib/types";

const accountTypes: ResponsiveSelectOption[] = [
  { label: "Securities", value: "SECURITIES" },
  { label: "Cash", value: "CASH" },
  { label: "Crypto", value: "CRYPTOCURRENCY" },
];

// Input type (what the form receives)
type AccountFormInput = z.input<typeof newAccountSchema>;
// Output type after zod parsing (with defaults applied)
type AccountFormOutput = z.output<typeof newAccountSchema>;

interface AccountFormlProps {
  defaultValues?: AccountFormInput;
  onSuccess?: () => void;
}

export function AccountForm({ defaultValues, onSuccess = () => undefined }: AccountFormlProps) {
  const { createAccountMutation, updateAccountMutation, switchTrackingModeMutation } =
    useAccountMutations({ onSuccess });

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
      const { id, trackingMode, meta, ...rest } = data;
      // Merge trackingMode into the meta JSON field
      const updatedMeta = setTrackingMode(meta, trackingMode);

      if (id) {
        if (options?.async) {
          return updateAccountMutation.mutateAsync({ id, trackingMode, ...rest, meta: updatedMeta });
        }
        return updateAccountMutation.mutate({ id, trackingMode, ...rest, meta: updatedMeta });
      }
      return createAccountMutation.mutate({ trackingMode, ...rest, meta: updatedMeta });
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
        // First save all account details (name, group, type, etc.)
        await doSubmit(pendingFormData, { async: true });
        // Then switch tracking mode (which updates snapshot sources)
        await switchTrackingModeMutation.mutateAsync({
          accountId: pendingFormData.id,
          newMode: pendingFormData.trackingMode,
        });
      } finally {
        setPendingFormData(null);
      }
    }
  };

  const handleCancelModeSwitch = () => {
    setShowModeConfirmation(false);
    setPendingFormData(null);
    // Revert the tracking mode in the form
    form.setValue("trackingMode", initialTrackingMode!);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <DialogHeader>
          <DialogTitle> {defaultValues?.id ? "Update Account" : "Add Account"}</DialogTitle>
          <DialogDescription>
            {defaultValues?.id
              ? "Update account information"
              : " Add an investment account to track."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 p-4">
          <input type="hidden" name="id" />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account Name</FormLabel>
                <FormControl>
                  <Input placeholder="Account display name" {...field} />
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
                <FormLabel>Account Group</FormLabel>
                <FormControl>
                  <Input placeholder="Retirement, 401K, RRSP, TFSA,..." {...field} />
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
                <FormLabel>Account Type</FormLabel>
                <FormControl>
                  <ResponsiveSelect
                    value={field.value}
                    onValueChange={field.onChange}
                    options={accountTypes}
                    placeholder="Select an account type"
                    sheetTitle="Select Account Type"
                    sheetDescription="Choose the account type that best matches."
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
                  <FormLabel>Currency</FormLabel>
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
                <FormLabel>Tracking Mode</FormLabel>
                {needsSetup && !currentTrackingMode && (
                  <Alert variant="warning" className="py-2.5 px-3 [&>svg]:top-2.5 [&>svg]:left-3 [&>svg~*]:pl-6">
                    <Icons.AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Choose how to track this account. This affects what data you enter and what
                      metrics are available.{" "}
                      <a
                        href="https://wealthfolio.app/docs/concepts/activity-types"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground"
                      >
                        Learn more
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
                      className={`relative flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors hover:bg-accent ${
                        field.value === "TRANSACTIONS"
                          ? "border-primary bg-primary/5"
                          : "border-muted"
                      }`}
                    >
                      <RadioGroupItem value="TRANSACTIONS" className="mt-0.5" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">Transactions</span>
                        <span className="text-xs text-muted-foreground">
                          Track every trade for performance analytics
                        </span>
                      </div>
                    </label>
                    <label
                      className={`relative flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors hover:bg-accent ${
                        field.value === "HOLDINGS" ? "border-primary bg-primary/5" : "border-muted"
                      }`}
                    >
                      <RadioGroupItem value="HOLDINGS" className="mt-0.5" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">Holdings</span>
                        <span className="text-xs text-muted-foreground">
                          Add holdings directly as snapshots
                        </span>
                      </div>
                    </label>
                  </RadioGroup>
                </FormControl>
                {field.value === "HOLDINGS" && (
                  <Alert variant="warning" className="py-2.5 px-3 [&>svg]:top-2.5 [&>svg]:left-3 [&>svg~*]:pl-6">
                    <Icons.AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Performance metrics will be limited without transaction history.{" "}
                      <a
                        href="https://wealthfolio.app/docs/concepts/activity-types"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground"
                      >
                        Learn more
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
              <FormItem className="flex items-center">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="space-y-0 pl-2"> Is Active</FormLabel>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <DialogFooter className="gap-2">
          <DialogTrigger asChild>
            <Button variant="outline">Cancel</Button>
          </DialogTrigger>
          <Button type="submit" disabled={needsSetup && !currentTrackingMode}>
            {defaultValues?.id ? (
              <Icons.Save className="h-4 w-4" />
            ) : (
              <Icons.Plus className="h-4 w-4" />
            )}
            <span>{defaultValues?.id ? "Update Account" : "Add Account"}</span>
          </Button>
        </DialogFooter>
      </form>

      {/* Mode Switch Confirmation Dialog */}
      <AlertDialog open={showModeConfirmation} onOpenChange={setShowModeConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Icons.AlertTriangle className="h-5 w-5 text-amber-500" />
              Switch to Transactions tracking?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your existing holdings snapshots will be replaced when Wealthfolio calculates history
              from transactions. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelModeSwitch}>Cancel</AlertDialogCancel>
            <Button onClick={handleConfirmModeSwitch}>Switch to Transactions</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  );
}
