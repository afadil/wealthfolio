import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icons,
} from "@wealthfolio/ui";
import type { Table } from "@tanstack/react-table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ChangesSummary, LocalTransaction } from "./types";

// Columns that can be toggled (exclude select, status indicator, actions)
const TOGGLEABLE_COLUMNS = [
  "activityType",
  "subtype",
  "instrumentType",
  "activityStatus",
  "date",
  "assetSymbol",
  "quantity",
  "unitPrice",
  "amount",
  "fee",
  "fxRate",
  "accountName",
  "currency",
  "comment",
];

interface ActivityDataGridToolbarProps {
  /** Number of rows currently selected */
  selectedRowCount: number;
  /** Number of selected rows that are pending review (synced/draft) */
  selectedPendingCount: number;
  /** Whether there are unsaved changes */
  hasUnsavedChanges: boolean;
  /** Summary of pending changes */
  changesSummary: ChangesSummary;
  /** Whether a save operation is in progress */
  isSaving: boolean;
  /** Table instance for column visibility */
  table: Table<LocalTransaction>;
  /** Handler for adding a new row */
  onAddRow: () => void;
  /** Handler for deleting selected rows */
  onDeleteSelected: () => void;
  /** Handler for approving selected synced activities */
  onApproveSelected: () => void;
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
  selectedPendingCount,
  hasUnsavedChanges,
  changesSummary,
  isSaving,
  table,
  onAddRow,
  onDeleteSelected,
  onApproveSelected,
  onSave,
  onCancel,
}: ActivityDataGridToolbarProps) {
  const { t } = useTranslation("common");
  const columnDisplayNames = useMemo(
    () =>
      Object.fromEntries(
        TOGGLEABLE_COLUMNS.map((id) => [id, t(`activity.data_grid.col.${id}`)]),
      ) as Record<string, string>,
    [t],
  );

  // Prevent mousedown from bubbling to document, which would clear DataGrid selection
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className="bg-muted/20 flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-1.5"
      onMouseDown={handleMouseDown}
    >
      <div className="text-muted-foreground flex items-center gap-2.5 text-xs">
        {/* Selection info */}
        {selectedRowCount > 0 && (
          <span className="font-medium">
            {t(
              selectedRowCount === 1
                ? "activity.data_grid.selection_summary_one"
                : "activity.data_grid.selection_summary_other",
              { count: selectedRowCount },
            )}
          </span>
        )}

        {/* Pending changes info */}
        {hasUnsavedChanges && (
          <div className="flex items-center gap-2">
            <span className="text-primary font-medium">
              {t(
                changesSummary.totalPendingChanges === 1
                  ? "activity.data_grid.pending_one"
                  : "activity.data_grid.pending_other",
                { count: changesSummary.totalPendingChanges },
              )}
            </span>
            <div className="bg-border h-3.5 w-px" />
            <div className="flex items-center gap-4">
              {changesSummary.newCount > 0 && (
                <span className="text-success flex items-center gap-1">
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
                <span className="text-destructive flex items-center gap-1">
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
          title={t("activity.data_grid.add_transaction")}
          aria-label={t("activity.data_grid.add_transaction")}
        >
          <Icons.Plus className="h-3.5 w-3.5" />
          <span>{t("activity.data_grid.add")}</span>
        </Button>

        {/* Column visibility dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="xs"
              className="shrink-0 rounded-md px-2"
              title={t("activity.data_grid.toggle_columns")}
              aria-label={t("activity.data_grid.toggle_columns")}
            >
              <Icons.Settings2 className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs">{t("activity.data_grid.toggle_columns")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {table
              .getAllColumns()
              .filter((column) => TOGGLEABLE_COLUMNS.includes(column.id))
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="text-xs"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {columnDisplayNames[column.id] || column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {selectedRowCount > 0 && (
          <>
            <div className="bg-border mx-1 h-4 w-px" />
            {selectedPendingCount > 0 && (
              <Button
                onClick={onApproveSelected}
                size="xs"
                variant="outline"
                className="shrink-0 rounded-md border-green-200 bg-green-50 text-xs text-green-700 hover:bg-green-100 hover:text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40"
                title={t("activity.data_grid.approve_synced")}
                aria-label={t("activity.data_grid.approve_synced")}
                disabled={isSaving}
              >
                <Icons.CheckCircle className="h-3.5 w-3.5" />
                <span>{t("activity.data_grid.approve_count", { count: selectedPendingCount })}</span>
              </Button>
            )}
            <Button
              onClick={onDeleteSelected}
              size="xs"
              variant="destructive"
              className="shrink-0 rounded-md text-xs"
              title={t("activity.data_grid.delete_selected")}
              aria-label={t("activity.data_grid.delete_selected")}
              disabled={isSaving}
            >
              <Icons.Trash className="h-3.5 w-3.5" />
              <span>{t("activity.data_grid.delete")}</span>
            </Button>
          </>
        )}

        {hasUnsavedChanges && (
          <>
            <div className="bg-border mx-1 h-4 w-px" />
            <Button
              onClick={onSave}
              size="xs"
              className="shrink-0 rounded-md text-xs"
              title={t("activity.data_grid.save_changes")}
              aria-label={t("activity.data_grid.save_changes")}
              disabled={isSaving}
            >
              {isSaving ? (
                <Icons.Spinner className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icons.Save className="h-3.5 w-3.5" />
              )}
              <span>{t("activity.data_grid.save")}</span>
            </Button>

            <Button
              onClick={onCancel}
              size="xs"
              variant="outline"
              className="shrink-0 rounded-md text-xs"
              title={t("activity.data_grid.discard_changes")}
              aria-label={t("activity.data_grid.discard_changes")}
              disabled={isSaving}
            >
              <Icons.Undo className="h-3.5 w-3.5" />
              <span>{t("activity.form.cancel")}</span>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
