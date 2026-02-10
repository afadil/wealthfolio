import { describe, expect, it } from "vitest";
import { ActivityType } from "@/lib/constants";
import { findMappedActivityType, getSmartDefault } from "./activity-type-mapping";

describe("activity-type-mapping", () => {
  it("maps transfer out labels to TRANSFER_OUT before generic TRANSFER", () => {
    expect(getSmartDefault("TRANSFER OUT")).toBe(ActivityType.TRANSFER_OUT);
    expect(getSmartDefault("TRANSFER-OUT")).toBe(ActivityType.TRANSFER_OUT);
    expect(getSmartDefault("TRANSFER_OUT")).toBe(ActivityType.TRANSFER_OUT);
  });

  it("keeps generic transfer mapping for ambiguous transfer labels", () => {
    expect(getSmartDefault("TRANSFER")).toBe(ActivityType.TRANSFER_IN);
    expect(getSmartDefault("TRANSFER BETWEEN ACCOUNTS")).toBe(ActivityType.TRANSFER_IN);
  });

  it("prioritizes explicit mappings over smart defaults", () => {
    const mapped = findMappedActivityType("TRANSFER OUT", {
      [ActivityType.DEPOSIT]: ["TRANSFER OUT"],
    });
    expect(mapped).toBe(ActivityType.DEPOSIT);
  });
});
