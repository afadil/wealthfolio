import type { HealthIssue } from "@/lib/types";
import { describe, expect, it } from "vitest";
import { getCategoryConfig } from "./health-page";

const baseIssue: HealthIssue = {
  id: "issue:1",
  severity: "WARNING",
  category: "SETTINGS_CONFIGURATION",
  title: "Issue",
  message: "Issue message",
  affectedCount: 1,
  dataHash: "hash",
  timestamp: "2026-03-01T00:00:00Z",
};

describe("getCategoryConfig", () => {
  it("uses Settings icon for settings configuration issues", () => {
    const category = getCategoryConfig({
      ...baseIssue,
      id: "timezone_missing:abc123",
    });

    expect(category.icon).toBe("Settings");
  });

  it("uses Settings icon for account configuration issues", () => {
    const category = getCategoryConfig({
      ...baseIssue,
      category: "ACCOUNT_CONFIGURATION",
      id: "account_tracking_mode:abc123",
    });

    expect(category.icon).toBe("Settings");
  });
});
