import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportFormat, ImportType } from "@/lib/types";
import type { ImportMappingData } from "@/lib/types";
import { MappingHeaderCell } from "./mapping-table-cells";

const mapping: ImportMappingData = {
  accountId: "account-1",
  importType: ImportType.ACTIVITY,
  name: "",
  fieldMappings: {},
  activityMappings: {},
  symbolMappings: {},
  accountMappings: {},
  symbolMappingMeta: {},
};

describe("MappingHeaderCell", () => {
  it("shows the select-column placeholder for an unmapped required field", () => {
    render(
      <MappingHeaderCell
        field={ImportFormat.DATE}
        mapping={mapping}
        headers={["Date", "Amount"]}
        requiredFields={[ImportFormat.DATE]}
        handleColumnMapping={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox")).toHaveTextContent("Select column");
  });
});
