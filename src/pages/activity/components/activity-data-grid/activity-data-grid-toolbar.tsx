import { Button, Icons } from "@wealthfolio/ui";
import type { ChangesSummary } from "./types";

interface ActivityDataGridToolbarProps {
  /** Number of rows currently selected */
  selectedRowCount: number;
  /** Whether there are unsaved changes */
  hasUnsavedChanges: boolean;
  /** Summary of pending changes */
  changesSummary: ChangesSummary;
  /** Whether a save operation is in progress */
  isSaving: boolean;
  /** Handler for adding a new row */
  onAddRow: () => void;
  /** Handler for deleting selected rows */
  onDeleteSelected: () => void;
  /** Handler for saving changes */
  onSave: () => void;
  /** Handler for canceling/discarding changes */
  onCancel: () => void;
}

/**
 * Toolbar component for the activity data grid
 * Displays status, selection info, and action buttons
 */
export function ActivityDataGridToolbar({
  selectedRowCount,
  hasUnsavedChanges,
  changesSummary,
  isSaving,
  onAddRow,
  onDeleteSelected,
  onSave,
  onCancel,
}: ActivityDataGridToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5">
      <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
        {/* Selection info */}
        {selectedRowCount > 0 && (
          <span className="font-medium">
            {selectedRowCount} row{selectedRowCount === 1 ? "" : "s"} selected
          </span>
        )}

        {/* Pending changes info */}
        {hasUnsavedChanges && (
          <div className="flex items-center gap-2">
            <span className="font-medium text-primary">
              {changesSummary.totalPendingChanges} pending change
              {changesSummary.totalPendingChanges === 1 ? "" : "s"}
            </span>
            <div className="h-3.5 w-px bg-border" />
            <div className="flex items-center gap-4">
              {changesSummary.newCount > 0 && (
                <span className="flex items-center gap-1 text-success">
                  <Icons.PlusCircle className="h-3 w-3" />
                  <span className="font-medium">{changesSummary.newCount}</span>
                </span>
              )}
              {changesSummary.updatedCount > 0 && (
                <span className="flex items-center gap-1 text-blue-500 dark:text-blue-400">
                  <Icons.Pencil className="h-3 w-3" />
                  <span className="font-medium">{changesSummary.updatedCount}</span>
                </span>
              )}
              {changesSummary.deletedCount > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <Icons.Trash className="h-3 w-3" />
                  <span className="font-medium">{changesSummary.deletedCount}</span>
                </span>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <Button
          onClick={onAddRow}
          variant="outline"
          size="xs"
          className="shrink-0 rounded-md"
          title="Add transaction"
          aria-label="Add transaction"
        >
          <Icons.Plus className="h-3.5 w-3.5" />
          <span>Add</span>
        </Button>

        {selectedRowCount > 0 && (
          <>
            <div className="mx-1 h-4 w-px bg-border" />
            <Button
              onMouseDown={(e) => e.preventDefault()}
              onClick={onDeleteSelected}
              size="xs"
              variant="destructive"
              className="shrink-0 rounded-md text-xs"
              title="Delete selected"
              aria-label="Delete selected"
              disabled={isSaving}
            >
              <Icons.Trash className="h-3.5 w-3.5" />
              <span>Delete</span>
            </Button>
          </>
        )}

        {hasUnsavedChanges && (
          <>
            <div className="mx-1 h-4 w-px bg-border" />
            <Button
              onClick={onSave}
              size="xs"
              className="shrink-0 rounded-md text-xs"
              title="Save changes"
              aria-label="Save changes"
              disabled={isSaving}
            >
              {isSaving ? (
                <Icons.Spinner className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icons.Save className="h-3.5 w-3.5" />
              )}
              <span>Save</span>
            </Button>

            <Button
              onClick={onCancel}
              size="xs"
              variant="outline"
              className="shrink-0 rounded-md text-xs"
              title="Discard changes"
              aria-label="Discard changes"
              disabled={isSaving}
            >
              <Icons.Undo className="h-3.5 w-3.5" />
              <span>Cancel</span>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
