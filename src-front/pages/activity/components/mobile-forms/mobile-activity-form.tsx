import { logger } from "@/adapters";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Form } from "@wealthfolio/ui/components/ui/form";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui/components/ui/sheet";
import { DataSource } from "@/lib/constants";
import type { ActivityDetails } from "@/lib/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm, type Resolver, type SubmitHandler } from "react-hook-form";
import { useActivityMutations } from "../../hooks/use-activity-mutations";
import type { AccountSelectOption } from "../activity-form";
import { newActivitySchema, type NewActivityFormValues } from "../forms/schemas";
import { MobileActivitySteps } from "./mobile-activity-steps";

interface MobileActivityFormProps {
  accounts: AccountSelectOption[];
  activity?: Partial<ActivityDetails>;
  open?: boolean;
  onClose?: () => void;
}

export function MobileActivityForm({ accounts, activity, open, onClose }: MobileActivityFormProps) {
  const [currentStep, setCurrentStep] = useState(activity?.id ? 2 : 1);
  const { addActivityMutation, updateActivityMutation } = useActivityMutations(onClose);

  const isValidActivityType = (
    type: string | undefined,
  ): type is NewActivityFormValues["activityType"] => {
    return type
      ? [
          "BUY",
          "SELL",
          "DEPOSIT",
          "WITHDRAWAL",
          "INTEREST",
          "DIVIDEND",
          "SPLIT",
          "TRANSFER_IN",
          "TRANSFER_OUT",
          "FEE",
          "TAX",
          "ADJUSTMENT",
        ].includes(type)
      : false;
  };

  const defaultValues: Partial<NewActivityFormValues> = {
    id: activity?.id,
    accountId: activity?.accountId ?? "",
    activityType: isValidActivityType(activity?.activityType) ? activity.activityType : undefined,
    amount: activity?.amount,
    quantity: activity?.quantity,
    unitPrice: activity?.unitPrice,
    fee: activity?.fee ?? 0,
    comment: activity?.comment ?? null,
    assetId: activity?.assetId,
    activityDate: activity?.date
      ? new Date(activity.date)
      : (() => {
          const date = new Date();
          date.setHours(16, 0, 0, 0);
          return date;
        })(),
    currency: activity?.currency ?? "",
    assetDataSource: activity?.assetDataSource ?? DataSource.YAHOO,
    showCurrencySelect: false,
  };

  const form = useForm<NewActivityFormValues>({
    resolver: zodResolver(newActivitySchema) as Resolver<NewActivityFormValues>,
    defaultValues: defaultValues as any,
  });

  const isLoading = addActivityMutation.isPending || updateActivityMutation.isPending;

  const onSubmit: SubmitHandler<NewActivityFormValues> = async (data) => {
    try {
      const { showCurrencySelect: _showCurrencySelect, id, ...submitData } = data;
      const account = accounts.find((a) => a.value === submitData.accountId);

      // For cash activities and fees, set assetId to $CASH-accountCurrency
      if (
        ["DEPOSIT", "WITHDRAWAL", "INTEREST", "FEE", "TAX", "TRANSFER_IN", "TRANSFER_OUT"].includes(
          submitData.activityType,
        )
      ) {
        if (account) {
          submitData.assetId = `$CASH-${account.currency}`;
        }
      }

      if (
        "assetDataSource" in submitData &&
        submitData.assetDataSource === DataSource.MANUAL &&
        account
      ) {
        submitData.currency = submitData.currency ?? account.currency;
      }

      if (id) {
        await updateActivityMutation.mutateAsync({ id, ...submitData });
      } else {
        await addActivityMutation.mutateAsync(submitData);
      }

      // Reset form and step after successful submission
      form.reset(defaultValues);
      setCurrentStep(1);
    } catch (error) {
      logger.error(
        `Mobile Activity Form Submit Error: ${JSON.stringify({ error, formValues: form.getValues() })}`,
      );
      return;
    }
  };

  const handleNext = async () => {
    const fields = getFieldsForStep(currentStep);
    // @ts-expect-error - field names are validated dynamically based on activity type
    const isValid = await form.trigger(fields);

    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, 2));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const getFieldsForStep = (step: number): string[] => {
    switch (step) {
      case 1:
        return ["activityType"];
      case 2: {
        const activityType = form.watch("activityType");
        const baseFields = ["accountId", "activityDate"];
        if (["BUY", "SELL"].includes(activityType ?? "")) {
          return [...baseFields, "assetId", "quantity", "unitPrice", "fee"];
        }
        if (["DEPOSIT", "WITHDRAWAL", "TRANSFER_IN", "TRANSFER_OUT"].includes(activityType ?? "")) {
          return [...baseFields, "amount", "fee"];
        }
        if (["DIVIDEND", "INTEREST"].includes(activityType ?? "")) {
          return [...baseFields, "assetId", "amount"];
        }
        return ["amount", ...baseFields];
      }
      default:
        return [];
    }
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="mx-1 flex h-[90vh] flex-col rounded-t-4xl p-0">
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex flex-col items-center space-y-2">
            <SheetTitle>{activity?.id ? "Update Activity" : "Add Activity"}</SheetTitle>
            {!activity?.id && (
              <div className="flex gap-1.5">
                {[1, 2].map((step) => (
                  <div
                    key={step}
                    className={`h-1.5 w-10 rounded-full transition-colors ${
                      step === currentStep
                        ? "bg-primary"
                        : step < currentStep
                          ? "bg-primary/50"
                          : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            )}
            {activity?.id && <SheetDescription>Update transaction details</SheetDescription>}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full flex-col">
                <MobileActivitySteps
                  currentStep={currentStep}
                  accounts={accounts}
                  isEditing={!!activity?.id}
                />
              </form>
            </Form>
          </div>
        </div>

        <SheetFooter className="mt-auto border-t px-6 py-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="flex w-full gap-3">
            {currentStep > 1 && !activity?.id && (
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={handleBack}
                className="flex-1"
              >
                <Icons.ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            )}

            {currentStep < 2 ? (
              <Button
                type="button"
                size="default"
                onClick={handleNext}
                className="flex-1 font-medium"
                disabled={!form.watch("activityType") && currentStep === 1}
              >
                Next
                <Icons.ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="default"
                onClick={form.handleSubmit(onSubmit)}
                className="flex-1 font-medium"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Icons.Check className="mr-2 h-4 w-4" />
                )}
                {activity?.id ? "Update" : "Add"} Activity
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
