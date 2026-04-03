import { ActivityType } from "@/lib/constants";
import type { ImportMappingData, ImportTemplateData } from "@/lib/types";
import { ImportType } from "@/lib/types";
import type { ParseConfig } from "../context";

export const DEFAULT_ACTIVITY_TEMPLATE_ID = "system_default_activity";

export function createDefaultParseConfig(defaultCurrency = "USD"): ParseConfig {
  return {
    hasHeaderRow: true,
    headerRowIndex: 0,
    delimiter: "auto",
    skipTopRows: 0,
    skipBottomRows: 0,
    skipEmptyRows: true,
    dateFormat: "auto",
    decimalSeparator: "auto",
    thousandsSeparator: "auto",
    defaultCurrency,
  };
}

function createCanonicalActivityMappings(): Record<string, string[]> {
  return Object.fromEntries(
    Object.values(ActivityType)
      .filter((type) => type !== ActivityType.UNKNOWN)
      .map((type) => [type, [type]]),
  );
}

export function createDefaultActivityTemplate(): ImportTemplateData {
  return {
    id: DEFAULT_ACTIVITY_TEMPLATE_ID,
    name: "Default",
    scope: "SYSTEM",
    kind: ImportType.ACTIVITY,
    fieldMappings: {},
    activityMappings: createCanonicalActivityMappings(),
    symbolMappings: {},
    accountMappings: {},
    symbolMappingMeta: {},
  };
}

export function createDefaultActivityMapping(accountId = ""): ImportMappingData {
  return {
    accountId,
    importType: ImportType.ACTIVITY,
    name: "",
    fieldMappings: {},
    activityMappings: createDefaultActivityTemplate().activityMappings,
    symbolMappings: {},
    accountMappings: {},
    symbolMappingMeta: {},
  };
}

export function createEmptyHoldingsMapping(accountId = ""): ImportMappingData {
  return {
    accountId,
    importType: ImportType.HOLDINGS,
    name: "",
    fieldMappings: {},
    activityMappings: {},
    symbolMappings: {},
    accountMappings: {},
    symbolMappingMeta: {},
  };
}

export function prependDefaultActivityTemplate(
  templates: ImportTemplateData[],
): ImportTemplateData[] {
  return [
    createDefaultActivityTemplate(),
    ...templates.filter((template) => template.id !== DEFAULT_ACTIVITY_TEMPLATE_ID),
  ];
}

export function isDefaultActivityTemplateId(templateId: string | null): boolean {
  return templateId === DEFAULT_ACTIVITY_TEMPLATE_ID;
}
