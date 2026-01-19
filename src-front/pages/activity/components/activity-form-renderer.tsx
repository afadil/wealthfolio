import type { AccountSelectOption } from "./forms/fields";
import {
  ACTIVITY_FORM_CONFIG,
  type ActivityFormValues,
  type PickerActivityType,
} from "../config/activity-form-config";

interface ActivityFormRendererProps {
  selectedType: PickerActivityType | undefined;
  accounts: AccountSelectOption[];
  defaultValues: Partial<ActivityFormValues> | undefined;
  onSubmit: (data: ActivityFormValues) => void | Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  isEditing?: boolean;
}

/**
 * Renders the appropriate form component based on selected activity type.
 * Uses strategy pattern - form component is looked up from config.
 */
export function ActivityFormRenderer({
  selectedType,
  accounts,
  defaultValues,
  onSubmit,
  onCancel,
  isLoading,
  isEditing,
}: ActivityFormRendererProps) {
  if (!selectedType) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        Select an activity type above to continue
      </div>
    );
  }

  const config = ACTIVITY_FORM_CONFIG[selectedType];
  const FormComponent = config.component;

  // Key forces re-mount when type changes, ensuring clean form state
  return (
    <FormComponent
      key={selectedType}
      accounts={accounts}
      defaultValues={defaultValues}
      onSubmit={onSubmit}
      onCancel={onCancel}
      isLoading={isLoading}
      isEditing={isEditing}
    />
  );
}
