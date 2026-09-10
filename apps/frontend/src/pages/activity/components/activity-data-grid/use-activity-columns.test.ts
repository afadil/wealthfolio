import { describe, expect, it } from "vitest";
import { shouldDisplaySubtypeInTypeColumn } from "./use-activity-columns";

describe("shouldDisplaySubtypeInTypeColumn", () => {
  it("hides the subtype from Type when the Subtype column is visible", () => {
    expect(shouldDisplaySubtypeInTypeColumn(false, undefined, "INTEREST", "STAKING_REWARD")).toBe(
      false,
    );
  });

  it("shows the subtype with Type when the Subtype column is hidden", () => {
    expect(shouldDisplaySubtypeInTypeColumn(true, undefined, "INTEREST", "STAKING_REWARD")).toBe(
      true,
    );
  });
});
