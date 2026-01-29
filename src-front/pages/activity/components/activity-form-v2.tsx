import { Alert, AlertDescription, AlertTitle } from "@wealthfolio/ui/components/ui/alert";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@wealthfolio/ui/components/ui/sheet";
import type { ActivityDetails } from "@/lib/types";
import { useState, useCallback } from "react";
import { ActivityTypePicker } from "./activity-type-picker";
import { ActivityFormRenderer } from "./activity-form-renderer";
import type { AccountSelectOption } from "./forms/fields";
import { useActivityForm } from "../hooks/use-activity-form";
import { mapActivityTypeToPicker } from "../utils/activity-form-utils";
import type { PickerActivityType } from "../config/activity-form-config";

// Re-export for consumers
export type { AccountSelectOption };

interface ActivityFormV2Props {
  accounts: AccountSelectOption[];
  activity?: Partial<ActivityDetails>;
  open?: boolean;
  onClose?: () => void;
}

export function ActivityFormV2({ accounts, activity, open, onClose }: ActivityFormV2Props) {
  // Derive the editing state and initial type from activity prop
  const isEditing = !!activity?.id;
  const initialType = mapActivityTypeToPicker(activity?.activityType);

  // Local state for selected type (only used when creating new activity)
  const [selectedType, setSelectedType] = useState<PickerActivityType | undefined>(initialType);

  // For editing, always use the activity's type; for new, use local state
  const effectiveSelectedType = isEditing ? initialType : selectedType;

  // Use the activity form hook with the effective type
  const { defaultValues, isLoading, isError, error, handleSubmit } = useActivityForm({
    accounts,
    activity,
    selectedType: effectiveSelectedType,
    onSuccess: onClose,
  });

  // Handle sheet open change - reset state when closing
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        // Reset selected type when sheet closes
        setSelectedType(undefined);
        onClose?.();
      }
    },
    [onClose],
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="flex flex-col overflow-hidden sm:max-w-[625px]">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Update Activity" : "Add Activity"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Update the details of your transaction"
              : "Record a new transaction in your account."}{" "}
            <a
              href="https://wealthfolio.app/docs/concepts/activity-types"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Learn more
            </a>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto py-4">
          {/* Activity Type Picker - only show when creating new activity */}
          {!isEditing && (
            <ActivityTypePicker value={effectiveSelectedType} onSelect={setSelectedType} />
          )}

          {/* When editing, show the activity type as a badge */}
          {isEditing && effectiveSelectedType && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Activity Type:</span>
              <span className="bg-primary/10 text-primary rounded-md px-2 py-1 font-medium">
                {effectiveSelectedType}
              </span>
            </div>
          )}

          {/* Render the appropriate form */}
          <ActivityFormRenderer
            selectedType={effectiveSelectedType}
            accounts={accounts}
            defaultValues={defaultValues}
            onSubmit={handleSubmit}
            onCancel={onClose}
            isLoading={isLoading}
            isEditing={isEditing}
          />

          {/* Display mutation error */}
          {isError && (
            <Alert variant="destructive">
              <Icons.AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{String(error)}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Footer with Cancel button - only show when no form is selected */}
        {!effectiveSelectedType && (
          <SheetFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
