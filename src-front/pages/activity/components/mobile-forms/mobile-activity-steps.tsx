import { useFormContext } from "react-hook-form";
import type { AccountSelectOption } from "../forms/fields";
import type { NewActivityFormValues } from "../forms/schemas";
import { MobileActivityTypeStep } from "./mobile-activity-type-step";
import { MobileDetailsStep } from "./mobile-details-step";

interface MobileActivityStepsProps {
  currentStep: number;
  accounts: AccountSelectOption[];
  isEditing: boolean;
}

export function MobileActivitySteps({
  currentStep,
  accounts,
  isEditing,
}: MobileActivityStepsProps) {
  const { watch } = useFormContext<NewActivityFormValues>();
  const activityType = watch("activityType");

  if (isEditing) {
    return <MobileDetailsStep activityType={activityType} accounts={accounts} />;
  }

  return (
    <div className="h-full">
      {currentStep === 1 && <MobileActivityTypeStep />}
      {currentStep === 2 && activityType && (
        <MobileDetailsStep activityType={activityType} accounts={accounts} />
      )}
    </div>
  );
}
