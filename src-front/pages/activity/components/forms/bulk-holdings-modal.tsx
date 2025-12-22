import { toast } from "@/components/ui/use-toast";
import { ActivityType, DataSource } from "@/lib/constants";
import { Account, ActivityBulkMutationRequest, ActivityCreate } from "@/lib/types";
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
} from "@wealthfolio/ui";
import { useCallback, useEffect, useState } from "react";
import { FormProvider, useForm, type Resolver, type SubmitHandler } from "react-hook-form";
import { z } from "zod";
import { useActivityMutations } from "../../hooks/use-activity-mutations";
import { BulkHoldingsForm } from "./bulk-holdings-form";
import { bulkHoldingsFormSchema } from "./schemas";

type BulkHoldingsFormValues = z.infer<typeof bulkHoldingsFormSchema>;

interface BulkHoldingsModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const BulkHoldingsModal = ({ open, onClose, onSuccess }: BulkHoldingsModalProps) => {
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const { saveActivitiesMutation } = useActivityMutations();

  const form = useForm<BulkHoldingsFormValues>({
    resolver: zodResolver(bulkHoldingsFormSchema) as Resolver<BulkHoldingsFormValues>,
    mode: "onSubmit",
    defaultValues: {
      accountId: "",
      activityDate: new Date(),
      currency: "USD",
      isDraft: false,
      comment: "",
      holdings: [
        {
          id: "1",
          ticker: "",
          name: "",
          assetId: "",
          assetDataSource: DataSource.YAHOO,
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
    },
    [form],
  );

  const handleSubmit: SubmitHandler<BulkHoldingsFormValues> = useCallback(
    async (data) => {
      // Validate holdings data
      const validHoldings = data.holdings.filter(
        (holding) =>
          holding.ticker?.trim() &&
          Number(holding.sharesOwned) > 0 &&
          Number(holding.averageCost) > 0,
      );

      if (!validHoldings.length) {
        toast({
          title: "No valid holdings",
          description:
            "Please add at least one valid holding with ticker, shares, and average cost.",
          variant: "destructive",
        });
        return;
      }

      const activityDate =
        data.activityDate instanceof Date ? data.activityDate : new Date(data.activityDate);
      const currency = data.currency || selectedAccount?.currency || "USD";

      const creates: ActivityCreate[] = validHoldings.map((holding) => ({
        accountId: data.accountId,
        activityType: ActivityType.ADD_HOLDING,
        activityDate: activityDate.toISOString(),
        assetId: (holding.assetId || holding.ticker || "").toUpperCase().trim(),
        assetDataSource: holding.assetDataSource ?? DataSource.YAHOO,
        quantity: Number(holding.sharesOwned),
        unitPrice: Number(holding.averageCost),
        amount: Number(holding.sharesOwned) * Number(holding.averageCost),
        currency,
        fee: 0,
        isDraft: data.isDraft ?? false,
        comment: data.comment?.trim() || undefined,
      }));

      const request: ActivityBulkMutationRequest = { creates };

      try {
        await saveActivitiesMutation.mutateAsync(request);
        toast({
          title: "Holdings saved",
          description: "Your holdings have been added to this account.",
          variant: "success",
        });
        form.reset();
        setSelectedAccount(null);
        onSuccess?.();
        onClose();
      } catch {
        // Error handling is managed by the mutation hook toast.
      }
    },
    [form, onClose, onSuccess, saveActivitiesMutation, selectedAccount],
  );

  const handleFormError = useCallback((errors: Record<string, any>) => {
    // Get the first error message to display
    const firstError = Object.values(errors)[0];
    const errorMessage = firstError?.message || "Please check the form for errors.";

    toast({
      title: "Form validation failed",
      description: errorMessage,
      variant: "destructive",
    });
  }, []);

  const isSubmitDisabled =
    saveActivitiesMutation.isPending ||
    !hasValidHoldings ||
    !selectedAccount ||
    !form.formState.isValid;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Portfolio</DialogTitle>
          <DialogDescription>
            Quickly add multiple holdings to your portfolio. Enter your current positions with
            ticker symbols, quantities, and average costs.
          </DialogDescription>
        </DialogHeader>

        <FormProvider {...form}>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit, handleFormError)} className="space-y-6">
              <div className="py-4">
                <BulkHoldingsForm onAccountChange={handleAccountChange} />
              </div>

              {/* Display validation errors */}
              {Object.keys(form.formState.errors).length > 0 && (
                <div className="border-destructive/50 bg-destructive/10 rounded-lg border p-4">
                  <h4 className="text-destructive mb-2 text-sm font-medium">
                    Please fix the following errors:
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
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitDisabled}>
                  {saveActivitiesMutation.isPending ? "Saving..." : "Confirm"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
};
