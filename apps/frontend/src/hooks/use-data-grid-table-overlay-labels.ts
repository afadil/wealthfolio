import type {
  DataGridContextMenuLabels,
  DataGridPasteDialogLabels,
  DataGridSearchLabels,
} from "@wealthfolio/ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/**
 * i18n for data grid context menu, paste dialog, and Ctrl+F search (see `activity.data_grid.*`).
 */
export function useDataGridTableOverlayLabels(): {
  contextMenuLabels: Partial<DataGridContextMenuLabels>;
  pasteDialogLabels: Partial<DataGridPasteDialogLabels>;
  searchLabels: Partial<DataGridSearchLabels>;
} {
  const { t } = useTranslation("common");

  return useMemo(
    () => ({
      contextMenuLabels: {
        copy: t("activity.data_grid.context_copy"),
        cut: t("activity.data_grid.context_cut"),
        paste: t("activity.data_grid.context_paste"),
        clear: t("activity.data_grid.context_clear"),
        deleteRows: t("activity.data_grid.context_delete_rows"),
        toastCellsCleared: (count: number) =>
          count === 1
            ? t("activity.data_grid.toast_cells_cleared_one", { count })
            : t("activity.data_grid.toast_cells_cleared_other", { count }),
        toastRowsDeleted: (count: number) =>
          count === 1
            ? t("activity.data_grid.toast_rows_deleted_one", { count })
            : t("activity.data_grid.toast_rows_deleted_other", { count }),
      },
      pasteDialogLabels: {
        title: t("activity.data_grid.paste_dialog.title"),
        description: (rowsNeeded: number) =>
          rowsNeeded === 1
            ? t("activity.data_grid.paste_dialog.description_one", { count: rowsNeeded })
            : t("activity.data_grid.paste_dialog.description_other", { count: rowsNeeded }),
        expandTitle: t("activity.data_grid.paste_dialog.expand_title"),
        expandDescription: (rowsNeeded: number) =>
          rowsNeeded === 1
            ? t("activity.data_grid.paste_dialog.expand_description_one", { count: rowsNeeded })
            : t("activity.data_grid.paste_dialog.expand_description_other", { count: rowsNeeded }),
        fitTitle: t("activity.data_grid.paste_dialog.fit_title"),
        fitDescription: t("activity.data_grid.paste_dialog.fit_description"),
        cancel: t("activity.data_grid.paste_dialog.cancel"),
        continue: t("activity.data_grid.paste_dialog.continue"),
      },
      searchLabels: {
        placeholder: t("activity.data_grid.search_placeholder"),
        noResults: t("activity.data_grid.search_no_results"),
        typeToSearch: t("activity.data_grid.search_type_to_search"),
        matchProgress: (current: number, total: number) =>
          t("activity.data_grid.search_match_progress", { current, total }),
        ariaPreviousMatch: t("activity.data_grid.search_aria_previous"),
        ariaNextMatch: t("activity.data_grid.search_aria_next"),
        ariaCloseSearch: t("activity.data_grid.search_aria_close"),
      },
    }),
    [t],
  );
}
