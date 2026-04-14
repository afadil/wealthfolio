import { Button, Icons } from "@wealthfolio/ui";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("common");
  const addLabel = isLiability
    ? t("holdings.value_history.add_balance")
    : t("holdings.value_history.add_value");

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button variant="default" size="sm" onClick={onAddRow}>
          <Icons.Plus className="mr-2 h-4 w-4" />
          {addLabel}
        </Button>

        {selectedRowCount > 0 && (
          <Button variant="outline" size="sm" onClick={onDeleteSelected}>
            <Icons.Trash className="mr-2 h-4 w-4" />
            {t("holdings.value_history.delete_selected", { count: selectedRowCount })}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {hasUnsavedChanges && (
          <>
            <span className="text-muted-foreground text-sm">
              {dirtyCount > 0 && t("holdings.value_history.modified_count", { count: dirtyCount })}
              {dirtyCount > 0 && deletedCount > 0 && ", "}
              {deletedCount > 0 &&
                t("holdings.value_history.to_delete_count", { count: deletedCount })}
            </span>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t("holdings.value_history.cancel")}
            </Button>
            <Button variant="default" size="sm" onClick={onSave}>
              <Icons.Save className="mr-2 h-4 w-4" />
              {t("holdings.value_history.save_changes")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
