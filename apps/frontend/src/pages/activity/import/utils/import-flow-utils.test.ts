import { describe, expect, it } from "vitest";
import { mergeDetectedParseConfig, shouldUseSavedHoldingsMapping } from "./import-flow-utils";

describe("import-flow-utils", () => {
  it("keeps the final detected parse config after a template re-parse", () => {
    expect(
      mergeDetectedParseConfig(
        {
          hasHeaderRow: true,
          headerRowIndex: 0,
          delimiter: ",",
          skipTopRows: 2,
          skipBottomRows: 0,
          skipEmptyRows: true,
          dateFormat: "DD/MM/YYYY",
          decimalSeparator: ",",
          thousandsSeparator: ".",
          defaultCurrency: "CAD",
        },
        {
          delimiter: ";",
          dateFormat: "YYYY-MM-DD",
        },
      ),
    ).toMatchObject({
      delimiter: ";",
      dateFormat: "YYYY-MM-DD",
      skipTopRows: 2,
      decimalSeparator: ",",
      defaultCurrency: "CAD",
    });
  });

  it("restores saved holdings mappings unless the user explicitly cleared templates", () => {
    expect(shouldUseSavedHoldingsMapping(false)).toBe(true);
    expect(shouldUseSavedHoldingsMapping(true)).toBe(false);
  });
});
