import { useEffect } from "react";
import { useUnsavedChangesContext } from "@/context/unsaved-changes-context";

interface UseUnsavedChangesOptions {
  hasUnsavedChanges: boolean;
  message?: string;
}

export function useUnsavedChanges({
  hasUnsavedChanges,
  message = "You have unsaved changes. Are you sure you want to leave? Your changes will be lost.",
}: UseUnsavedChangesOptions) {
  const { setHasUnsavedChanges, setMessage } = useUnsavedChangesContext();

  // Sync local state with context
  useEffect(() => {
    setHasUnsavedChanges(hasUnsavedChanges);
  }, [hasUnsavedChanges, setHasUnsavedChanges]);

  // Set custom message
  useEffect(() => {
    setMessage(message);
  }, [message, setMessage]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      setHasUnsavedChanges(false);
    };
  }, [setHasUnsavedChanges]);

  // Return empty component since dialog is now in the provider
  return {
    UnsavedChangesDialog: () => null,
  };
}
