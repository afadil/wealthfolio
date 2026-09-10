export type RuleMatchType = "contains" | "starts_with" | "exact" | "regex";

/** Amount condition operator. Compares against the activity's unsigned amount. */
export type RuleAmountOp = "eq" | "gt" | "gte" | "lt" | "lte" | "between";

export interface CategorizationRule {
  id: string;
  name: string;
  pattern: string;
  matchType: RuleMatchType;
  taxonomyId?: string | null;
  categoryId?: string | null;
  activityType?: string | null;
  /** Optional amount condition; amountValue2 is the upper bound for "between". */
  amountOp?: RuleAmountOp | null;
  amountValue?: number | null;
  amountValue2?: number | null;
  priority: number;
  isGlobal: boolean;
  accountId?: string | null;
  /** Preset provenance — NULL/undefined for user-created rules. */
  presetId?: string | null;
  presetRuleKey?: string | null;
  presetVersion?: string | null;
  /** True when the user has edited a preset-sourced rule. */
  presetModified?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NewCategorizationRule {
  id?: string | null;
  name: string;
  pattern: string;
  matchType?: RuleMatchType;
  taxonomyId?: string | null;
  categoryId?: string | null;
  activityType?: string | null;
  amountOp?: RuleAmountOp | null;
  amountValue?: number | null;
  amountValue2?: number | null;
  priority?: number;
  isGlobal?: boolean;
  accountId?: string | null;
  presetId?: string | null;
  presetRuleKey?: string | null;
  presetVersion?: string | null;
}

export interface UpdateCategorizationRule {
  name?: string;
  pattern?: string;
  matchType?: RuleMatchType;
  taxonomyId?: string | null;
  categoryId?: string | null;
  activityType?: string | null;
  /** Explicit null clears the amount condition. */
  amountOp?: RuleAmountOp | null;
  amountValue?: number | null;
  amountValue2?: number | null;
  priority?: number;
  isGlobal?: boolean;
  accountId?: string | null;
}

export interface RulePresetSummary {
  presetId: string;
  presetVersion: string;
  name: string;
  description?: string | null;
  language?: string | null;
  ruleCount: number;
  installed: boolean;
  installedVersion?: string | null;
}

export interface ImportPresetResult {
  presetId: string;
  presetVersion: string;
  added: number;
  updated: number;
  skippedExisting: number;
  skippedUnknownCategory: number;
  total: number;
}

export interface RemovePresetResult {
  presetId: string;
  removed: number;
  keptModified: number;
}
