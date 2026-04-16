import type { DataGridColumnHeaderMenuLabels } from "@wealthfolio/ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/**
 * Shared labels for the data grid column header menu (sort / pin / hide / resize).
 * Keys live under `activity.data_grid.*` in `common` (reused app-wide for any `useDataGrid`).
 */
export function useDataGridColumnHeaderMenuLabels(): Partial<DataGridColumnHeaderMenuLabels> {
  const { t } = useTranslation("common");

  return useMemo(
    () => ({
      sortAsc: t("activity.data_grid.sort_asc"),
      sortDesc: t("activity.data_grid.sort_desc"),
      removeSort: t("activity.data_grid.remove_sort"),
      pinToLeft: t("activity.data_grid.pin_to_left"),
      unpinFromLeft: t("activity.data_grid.unpin_from_left"),
      pinToRight: t("activity.data_grid.pin_to_right"),
      unpinFromRight: t("activity.data_grid.unpin_from_right"),
      hideColumn: t("activity.data_grid.hide_column"),
      resizeColumnAria: (columnLabel: string) =>
        t("activity.data_grid.resize_column_aria", { label: columnLabel }),
    }),
    [t],
  );
}
