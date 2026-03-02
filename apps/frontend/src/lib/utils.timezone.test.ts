import { describe, expect, it } from "vitest";

import { formatDateTime, resolveDisplayTimezone } from "./utils";

describe("timezone formatting", () => {
  it("formats with configured timezone", () => {
    const instant = "2025-01-01T00:30:00Z";
    const timezone = "America/Los_Angeles";

    const expectedDate = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: timezone,
    }).format(new Date(instant));

    const formatted = formatDateTime(instant, timezone);
    expect(formatted.date).toBe(expectedDate);
  });

  it("falls back to browser timezone for invalid configured timezone", () => {
    const instant = "2025-01-01T00:30:00Z";
    const fallbackTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    expect(resolveDisplayTimezone("Mars/Phobos")).toBe(fallbackTimezone);

    const expectedDate = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: fallbackTimezone,
    }).format(new Date(instant));

    const formatted = formatDateTime(instant, "Mars/Phobos");
    expect(formatted.date).toBe(expectedDate);
  });
});
