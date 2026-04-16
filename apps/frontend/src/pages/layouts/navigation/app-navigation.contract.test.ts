import { describe, expect, it } from "vitest";
import i18n from "@/i18n/i18n";
import { createStaticNavigation } from "./app-navigation";
import { buildSettingsSections } from "@/pages/settings/settings-layout";

/**
 * Regression guard: top-level routes that must remain reachable from the main nav.
 * If you intentionally remove a feature from the shell, update this list in the same PR.
 */
const REQUIRED_PRIMARY_HREFS = ["/fire-planner"] as const;

/** Settings sidebar uses path segments relative to `/settings`. */
const REQUIRED_SETTINGS_SEGMENT_HREFS = ["fire-planner"] as const;

describe("navigation contract", () => {
  it("exposes required items in primary static navigation", () => {
    const staticNavigation = createStaticNavigation(i18n.getFixedT("en", "common"));
    const hrefs = staticNavigation.primary.map((l) => l.href);
    for (const required of REQUIRED_PRIMARY_HREFS) {
      expect(hrefs).toContain(required);
    }
  });

  it("exposes FIRE Planner under settings sidebar", () => {
    const segments = buildSettingsSections().flatMap((s) => s.items.map((i) => i.href));
    for (const required of REQUIRED_SETTINGS_SEGMENT_HREFS) {
      expect(segments).toContain(required);
    }
  });
});
