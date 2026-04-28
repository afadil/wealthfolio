import { describe, expect, it } from "vitest";
import { ActivityType, ImportFormat } from "@/lib/constants";
import { createDraftActivities } from "./draft-utils";

const headers = [
  ImportFormat.DATE,
  ImportFormat.ACTIVITY_TYPE,
  ImportFormat.AMOUNT,
  ImportFormat.CURRENCY,
];

const baseMapping = {
  fieldMappings: {
    [ImportFormat.DATE]: ImportFormat.DATE,
    [ImportFormat.ACTIVITY_TYPE]: ImportFormat.ACTIVITY_TYPE,
    [ImportFormat.AMOUNT]: ImportFormat.AMOUNT,
    [ImportFormat.CURRENCY]: ImportFormat.CURRENCY,
  },
  activityMappings: {},
  symbolMappings: {},
  accountMappings: {},
};

const parseConfig = {
  dateFormat: "auto",
  decimalSeparator: "auto",
  thousandsSeparator: "auto",
  defaultCurrency: "USD",
};

function createSingleDraft(row: string[]) {
  const [draft] = createDraftActivities([row], headers, baseMapping, parseConfig, "account-1");
  expect(draft).toBeDefined();
  return draft;
}

function createSingleDraftWithMapping(row: string[], activityMappings: Record<string, string[]>) {
  const [draft] = createDraftActivities(
    [row],
    headers,
    { ...baseMapping, activityMappings },
    parseConfig,
    "account-1",
  );
  expect(draft).toBeDefined();
  return draft;
}

describe("createDraftActivities explicit activity mapping", () => {
  it("falls back to the selected account when a CSV account value is not valid", () => {
    const [draft] = createDraftActivities(
      [["2024-03-15", "DEPOSIT", "1000.00", "USD", "stale-account"]],
      [...headers, ImportFormat.ACCOUNT],
      {
        ...baseMapping,
        fieldMappings: {
          ...baseMapping.fieldMappings,
          [ImportFormat.ACCOUNT]: ImportFormat.ACCOUNT,
        },
      },
      parseConfig,
      "account-1",
      new Set(["account-1"]),
    );

    expect(draft.accountId).toBe("account-1");
  });

  it("keeps a CSV account value when it is a valid account id", () => {
    const [draft] = createDraftActivities(
      [["2024-03-15", "DEPOSIT", "1000.00", "USD", "account-2"]],
      [...headers, ImportFormat.ACCOUNT],
      {
        ...baseMapping,
        fieldMappings: {
          ...baseMapping.fieldMappings,
          [ImportFormat.ACCOUNT]: ImportFormat.ACCOUNT,
        },
      },
      parseConfig,
      "account-1",
      new Set(["account-1", "account-2"]),
    );

    expect(draft.accountId).toBe("account-2");
  });

  it("keeps explicitly mapped withdrawal labels when amount is positive", () => {
    const draft = createSingleDraftWithMapping(["2024-03-15", "WITHDRAWAL", "1000.00", "USD"], {
      [ActivityType.WITHDRAWAL]: ["WITHDRAWAL"],
    });

    expect(draft.activityType).toBe(ActivityType.WITHDRAWAL);
    expect(draft.amount).toBe("1000.00");
  });

  it("keeps explicitly mapped deposit labels when amount is negative", () => {
    const draft = createSingleDraftWithMapping(["2024-03-15", "DEPOSIT", "-1000.00", "USD"], {
      [ActivityType.DEPOSIT]: ["DEPOSIT"],
    });

    expect(draft.activityType).toBe(ActivityType.DEPOSIT);
    expect(draft.amount).toBe("1000.00");
  });

  it("does not infer transfer direction from sign", () => {
    const draft = createSingleDraftWithMapping(["2024-03-15", "TRANSFER", "-250.00", "USD"], {
      [ActivityType.TRANSFER_IN]: ["TRANSFER"],
    });

    expect(draft.activityType).toBe(ActivityType.TRANSFER_IN);
    expect(draft.amount).toBe("250.00");
  });

  it("marks rows as invalid until the activity type is explicitly mapped", () => {
    const draft = createSingleDraft(["2024-03-15", "WITHDRAWAL", "1000.00", "USD"]);

    expect(draft.activityType).toBeUndefined();
    expect(draft.status).toBe("error");
    expect(draft.errors.activityType).toContain("Activity type is required");
  });
});
