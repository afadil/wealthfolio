import type {
  ActivityRule,
  ActivityRuleWithNames,
  NewActivityRule,
  UpdateActivityRule,
  ActivityRuleMatch,
} from "@/lib/types";
import { getRunEnv, RUN_ENV, invokeTauri, invokeWeb } from "@/adapters";
import { logger } from "@/adapters";

export const getActivityRules = async (): Promise<ActivityRule[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_activity_rules");
      case RUN_ENV.WEB:
        return invokeWeb("get_activity_rules");
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching activity rules.");
    throw error;
  }
};

export const getActivityRulesWithNames = async (): Promise<ActivityRuleWithNames[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_activity_rules_with_names");
      case RUN_ENV.WEB:
        return invokeWeb("get_activity_rules_with_names");
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching activity rules with names.");
    throw error;
  }
};

export const createActivityRule = async (rule: NewActivityRule): Promise<ActivityRule> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("create_activity_rule", { rule });
      case RUN_ENV.WEB:
        return invokeWeb("create_activity_rule", { rule });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error creating activity rule.");
    throw error;
  }
};

export const updateActivityRule = async (
  id: string,
  update: UpdateActivityRule,
): Promise<ActivityRule> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("update_activity_rule", { id, update });
      case RUN_ENV.WEB:
        return invokeWeb("update_activity_rule", { id, update });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error updating activity rule.");
    throw error;
  }
};

export const deleteActivityRule = async (ruleId: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("delete_activity_rule", { ruleId });
        return;
      case RUN_ENV.WEB:
        await invokeWeb("delete_activity_rule", { ruleId });
        return;
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error deleting activity rule.");
    throw error;
  }
};

export const applyActivityRules = async (
  transactionName: string,
  accountId?: string | null,
): Promise<ActivityRuleMatch | null> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("apply_activity_rules", { transactionName, accountId });
      case RUN_ENV.WEB:
        return invokeWeb("apply_activity_rules", { transactionName, accountId });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error applying activity rules.");
    throw error;
  }
};

export const bulkApplyActivityRules = async (
  transactions: Array<{ name: string; accountId?: string | null }>,
): Promise<Array<ActivityRuleMatch | null>> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("bulk_apply_activity_rules", { transactions });
      case RUN_ENV.WEB:
        return invokeWeb("bulk_apply_activity_rules", { transactions });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error bulk applying activity rules.");
    throw error;
  }
};

export const testActivityRulePattern = async (
  pattern: string,
  matchType: string,
  testText: string,
): Promise<boolean> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("test_activity_rule_pattern", { pattern, matchType, testText });
      case RUN_ENV.WEB:
        return invokeWeb("test_activity_rule_pattern", { pattern, matchType, testText });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error testing activity rule pattern.");
    throw error;
  }
};

// Legacy exports for backwards compatibility
export const getCategoryRules = getActivityRules;
export const getCategoryRulesWithNames = getActivityRulesWithNames;
export const createCategoryRule = createActivityRule;
export const updateCategoryRule = updateActivityRule;
export const deleteCategoryRule = deleteActivityRule;
export const applyCategoryRules = applyActivityRules;
export const bulkApplyCategoryRules = bulkApplyActivityRules;
export const testCategoryRulePattern = testActivityRulePattern;
