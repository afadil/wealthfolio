import { describe, expect, it } from "vitest";
import { ActivityType } from "@/lib/constants";
import type { ImportTemplateData } from "@/lib/types";
import {
  DEFAULT_ACTIVITY_TEMPLATE_ID,
  createDefaultActivityMapping,
  createDefaultParseConfig,
  createDefaultActivityTemplate,
  createEmptyHoldingsMapping,
  prependDefaultActivityTemplate,
} from "./default-activity-template";

describe("default-activity-template", () => {
  it.each(Object.values(ActivityType).filter((type) => type !== ActivityType.UNKNOWN))(
    "includes canonical %s identity mappings",
    (type) => {
      expect(createDefaultActivityTemplate().activityMappings[type]).toEqual([type]);
    },
  );

  it("creates a clean default activity mapping state", () => {
    expect(createDefaultActivityMapping("acc-1")).toMatchObject({
      accountId: "acc-1",
      name: "",
      fieldMappings: {},
      symbolMappings: {},
      accountMappings: {},
    });
  });

  it("creates the baseline parse config for no-template imports", () => {
    expect(createDefaultParseConfig("CAD")).toMatchObject({
      delimiter: "auto",
      dateFormat: "auto",
      skipTopRows: 0,
      skipBottomRows: 0,
      defaultCurrency: "CAD",
    });
  });

  it("creates an empty holdings mapping for template clear/reset", () => {
    expect(createEmptyHoldingsMapping("acc-1")).toMatchObject({
      accountId: "acc-1",
      importType: "CSV_HOLDINGS",
      fieldMappings: {},
      symbolMappings: {},
    });
  });

  it("prepends the code-defined default template once", () => {
    const templates: ImportTemplateData[] = [
      createDefaultActivityTemplate(),
      {
        id: "user-template",
        name: "Broker CSV",
        scope: "USER",
        kind: "CSV_ACTIVITY",
        fieldMappings: {},
        activityMappings: {},
        symbolMappings: {},
        accountMappings: {},
        symbolMappingMeta: {},
      },
    ];

    const merged = prependDefaultActivityTemplate(templates);

    expect(merged[0]?.id).toBe(DEFAULT_ACTIVITY_TEMPLATE_ID);
    expect(merged.filter((template) => template.id === DEFAULT_ACTIVITY_TEMPLATE_ID)).toHaveLength(
      1,
    );
  });
});
