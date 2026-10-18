import type { Table } from "@tanstack/react-table";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActivityDataGridToolbar } from "./activity-data-grid-toolbar";
import type { LocalTransaction } from "./types";

const toggleVisibility = vi.fn();
const table = {
  getAllColumns: () => [{ id: "activityType", getIsVisible: () => true, toggleVisibility }],
} as unknown as Table<LocalTransaction>;

describe("ActivityDataGridToolbar", () => {
  it("opens the column menu and toggles a column", async () => {
    render(
      <ActivityDataGridToolbar
        selectedRowCount={0}
        selectedPendingCount={0}
        hasUnsavedChanges={false}
        changesSummary={{ newCount: 0, updatedCount: 0, deletedCount: 0, totalPendingChanges: 0 }}
        isSaving={false}
        table={table}
        onAddRow={vi.fn()}
        onDeleteSelected={vi.fn()}
        onApproveSelected={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Toggle columns" }));

    const menu = await screen.findByRole("menu");
    expect(menu).toHaveTextContent("Toggle columns");
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: "Type" }));
    expect(toggleVisibility).toHaveBeenCalledWith(false);
  });
});
