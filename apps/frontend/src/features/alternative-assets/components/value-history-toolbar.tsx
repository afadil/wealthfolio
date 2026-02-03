import { Button, Icons } from "@wealthfolio/ui";

interface ValueHistoryToolbarProps {
  selectedRowCount: number;
  hasUnsavedChanges: boolean;
  dirtyCount: number;
  deletedCount: number;
  onAddRow: () => void;
  onDeleteSelected: () => void;
  onSave: () => void;
  onCancel: () => void;
  isLiability?: boolean;
}

export function ValueHistoryToolbar({
  selectedRowCount,
  hasUnsavedChanges,
  dirtyCount,
  deletedCount,
  onAddRow,
  onDeleteSelected,
  onSave,
  onCancel,
  isLiability = false,
}: ValueHistoryToolbarProps) {
  const valueLabel = isLiability ? "Balance" : "Value";

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button variant="default" size="sm" onClick={onAddRow}>
          <Icons.Plus className="mr-2 h-4 w-4" />
          Add {valueLabel}
        </Button>

        {selectedRowCount > 0 && (
          <Button variant="outline" size="sm" onClick={onDeleteSelected}>
            <Icons.Trash className="mr-2 h-4 w-4" />
            Delete ({selectedRowCount})
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {hasUnsavedChanges && (
          <>
            <span className="text-muted-foreground text-sm">
              {dirtyCount > 0 && `${dirtyCount} modified`}
              {dirtyCount > 0 && deletedCount > 0 && ", "}
              {deletedCount > 0 && `${deletedCount} to delete`}
            </span>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={onSave}>
              <Icons.Save className="mr-2 h-4 w-4" />
              Save Changes
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
