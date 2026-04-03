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
