import { toast } from "@/components/ui/use-toast";
import { ActivityType } from "@/lib/constants";
import { Account, ActivityImport } from "@/lib/types";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
} from "@wealthvn/ui";
import { useCallback, useEffect, useState } from "react";
import { FormProvider, useForm, type Resolver } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useActivityImportMutations } from "../../import/hooks/use-activity-import-mutations";
import { BulkHoldingsForm } from "./bulk-holdings-form";
import { bulkHoldingsFormSchema } from "./schemas";
import { searchTicker } from "@/commands/market-data";

type BulkHoldingsFormValues = z.infer<typeof bulkHoldingsFormSchema>;

interface BulkHoldingsModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const BulkHoldingsModal = ({ open, onClose, onSuccess }: BulkHoldingsModalProps) => {
  const { t } = useTranslation(["activity", "common"]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [manualHoldings, setManualHoldings] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<BulkHoldingsFormValues>({
    resolver: zodResolver(bulkHoldingsFormSchema) as Resolver<BulkHoldingsFormValues>,
    mode: "onSubmit",
    defaultValues: {
      accountId: "",
      activityDate: new Date(),
      currency: "",
      isDraft: false,
      comment: "",
      holdings: [
        {
          id: "1",
          ticker: "",
          name: "",
          assetId: "",
        },
      ],
    },
  });

  // Watch holdings for UI state management
  const watchedHoldings = form.watch("holdings");
  const hasValidHoldings =
    watchedHoldings?.some(
      (holding) =>
        holding.ticker && Number(holding.sharesOwned) > 0 && Number(holding.averageCost) > 0,
    ) || false;

  // Reset form when modal is closed and handle initial focus
  useEffect(() => {
    if (!open) {
      form.reset();
      setSelectedAccount(null);
    } else {
      // When modal opens, focus the account field with proper timing
      // Use a longer delay to ensure modal is fully rendered
      const timeoutId = setTimeout(() => {
        form.setFocus("accountId");
      }, 150);

      return () => clearTimeout(timeoutId);
    }
    return; // Explicit return for all code paths
  }, [open, form]);

  // Account change handler
  const handleAccountChange = useCallback(
    (account: Account | null) => {
      setSelectedAccount(account);
      form.setValue("accountId", account?.id || "", {
        shouldValidate: true,
        shouldDirty: true,
      });

      // Sync currency with selected account
      form.setValue("currency", account?.currency || "USD", {
        shouldValidate: false,
        shouldDirty: true,
      });
    },
    [form],
  );

  const { confirmImportMutation } = useActivityImportMutations({
    onSuccess: () => {
      toast({
        title: t("activity:form.importSuccessTitle"),
        description: t("activity:form.importSuccessDescription"),
        variant: "default",
      });
      form.reset();
      setSelectedAccount(null);
      setIsSubmitting(false);
      onSuccess?.();
      onClose();
    },
    onError: () => {
      setIsSubmitting(false);
    },
  });

  // Function to check if a symbol exists in market data
  const checkSymbolExists = useCallback(async (symbol: string): Promise<boolean> => {
    try {
      const results = await searchTicker(symbol);
      return results && results.length > 0;
    } catch (error) {
      // Log error for debugging
      console.error("Ticker search failed for symbol:", symbol, error);
      // If search fails, assume symbol doesn't exist
      return false;
    }
  }, []);

  const handleSubmit = useCallback(
    async (data: BulkHoldingsFormValues) => {
      // Set immediate loading state
      setIsSubmitting(true);

      try {
        // Validate holdings data
        const validHoldings = data.holdings.filter(
          (holding) =>
            holding.ticker?.trim() &&
            Number(holding.sharesOwned) > 0 &&
            Number(holding.averageCost) > 0,
        );

        if (!validHoldings.length) {
          toast({
            title: t("activity:form.noValidHoldings"),
            description: t("activity:form.noValidHoldingsDescription"),
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }

        // Check which symbols exist in market data
        const symbolChecks = await Promise.all(
          validHoldings.map(async (holding) => {
            const symbol = holding.ticker.toUpperCase().trim();
            const isAlreadyMarkedManual = manualHoldings.has(holding.id);
            const symbolExists = await checkSymbolExists(symbol);

            // Mark as manual if either: already marked as manual OR symbol doesn't exist in market data
            const shouldBeManual = isAlreadyMarkedManual || !symbolExists;

            return { holding, shouldBeManual };
          }),
        );

        // Transform to ActivityImport format
        const activitiesToImport: ActivityImport[] = symbolChecks.map(
          ({ holding, shouldBeManual }) => ({
            accountId: data.accountId,
            activityType: ActivityType.ADD_HOLDING,
            symbol: holding.ticker.toUpperCase().trim(),
            quantity: Number(holding.sharesOwned),
            unitPrice: Number(holding.averageCost),
            date: data.activityDate,
            currency: data.currency || selectedAccount?.currency || "USD",
            fee: 0,
            isDraft: false,
            isValid: true,
            comment: data.comment || `Bulk import - ${validHoldings.length} holdings`,
            assetDataSource: shouldBeManual ? "MANUAL" : undefined,
          }),
        );

        confirmImportMutation.mutate({ activities: activitiesToImport });
      } catch (error) {
        console.error("Error submitting bulk holdings:", error);
        setIsSubmitting(false);
      }
    },
    [confirmImportMutation, selectedAccount, manualHoldings, checkSymbolExists],
  );

  const handleFormError = useCallback(
    (errors: Record<string, any>) => {
      // Get the first error message to display
      const firstError = Object.values(errors)[0];
      const errorMessage = firstError?.message || t("activity:form.checkFormErrors");

      toast({
        title: t("activity:form.formValidationFailed"),
        description: errorMessage,
        variant: "destructive",
      });
    },
    [t],
  );

  const isSubmitDisabled =
    isSubmitting ||
    confirmImportMutation.isPending ||
    !hasValidHoldings ||
    !selectedAccount ||
    !form.formState.isValid;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("activity:form.bulkHoldingsTitle")}</DialogTitle>
          <DialogDescription>{t("activity:form.bulkHoldingsDescription")}</DialogDescription>
        </DialogHeader>

        <FormProvider {...form}>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit, handleFormError)} className="space-y-6">
              <div className="py-4">
                <BulkHoldingsForm
                  onAccountChange={handleAccountChange}
                  onManualHoldingsChange={setManualHoldings}
                />
              </div>

              {/* Display validation errors */}
              {Object.keys(form.formState.errors).length > 0 && (
                <div className="border-destructive/50 bg-destructive/10 rounded-lg border p-4">
                  <h4 className="text-destructive mb-2 text-sm font-medium">
                    {t("activity:form.pleaseFixErrors")}
                  </h4>
                  <ul className="text-destructive/80 space-y-1 text-sm">
                    {form.formState.errors.accountId && (
                      <li>• {form.formState.errors.accountId.message}</li>
                    )}
                    {form.formState.errors.activityDate && (
                      <li>• {form.formState.errors.activityDate.message}</li>
                    )}
                    {form.formState.errors.holdings && (
                      <li>• {form.formState.errors.holdings.message}</li>
                    )}
                  </ul>
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  {t("common:actions.cancel")}
                </Button>
                <Button type="submit" disabled={isSubmitDisabled}>
                  {confirmImportMutation.isPending
                    ? t("activity:form.importing")
                    : isSubmitting
                      ? t("activity:form.validating")
                      : t("activity:form.confirm")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
};
