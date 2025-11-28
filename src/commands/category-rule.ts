import type {
  CategoryRule,
  CategoryRuleWithNames,
  NewCategoryRule,
  UpdateCategoryRule,
  CategoryMatch,
} from "@/lib/types";
import { getRunEnv, RUN_ENV, invokeTauri, invokeWeb } from "@/adapters";
import { logger } from "@/adapters";

export const getCategoryRules = async (): Promise<CategoryRule[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_category_rules");
      case RUN_ENV.WEB:
        return invokeWeb("get_category_rules");
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching category rules.");
    throw error;
  }
};

export const getCategoryRulesWithNames = async (): Promise<CategoryRuleWithNames[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_category_rules_with_names");
      case RUN_ENV.WEB:
        return invokeWeb("get_category_rules_with_names");
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching category rules with names.");
    throw error;
  }
};

export const createCategoryRule = async (rule: NewCategoryRule): Promise<CategoryRule> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("create_category_rule", { rule });
      case RUN_ENV.WEB:
        return invokeWeb("create_category_rule", { rule });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error creating category rule.");
    throw error;
  }
};

export const updateCategoryRule = async (
  id: string,
  update: UpdateCategoryRule,
): Promise<CategoryRule> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("update_category_rule", { id, update });
      case RUN_ENV.WEB:
        return invokeWeb("update_category_rule", { id, update });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error updating category rule.");
    throw error;
  }
};

export const deleteCategoryRule = async (ruleId: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("delete_category_rule", { ruleId });
        return;
      case RUN_ENV.WEB:
        await invokeWeb("delete_category_rule", { ruleId });
        return;
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error deleting category rule.");
    throw error;
  }
};

export const applyCategoryRules = async (
  transactionName: string,
  accountId?: string | null,
): Promise<CategoryMatch | null> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("apply_category_rules", { transactionName, accountId });
      case RUN_ENV.WEB:
        return invokeWeb("apply_category_rules", { transactionName, accountId });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error applying category rules.");
    throw error;
  }
};

export const bulkApplyCategoryRules = async (
  transactions: Array<{ name: string; accountId?: string | null }>,
): Promise<Array<CategoryMatch | null>> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("bulk_apply_category_rules", { transactions });
      case RUN_ENV.WEB:
        return invokeWeb("bulk_apply_category_rules", { transactions });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error bulk applying category rules.");
    throw error;
  }
};

export const testCategoryRulePattern = async (
  pattern: string,
  matchType: string,
  testText: string,
): Promise<boolean> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("test_category_rule_pattern", { pattern, matchType, testText });
      case RUN_ENV.WEB:
        return invokeWeb("test_category_rule_pattern", { pattern, matchType, testText });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error testing category rule pattern.");
    throw error;
  }
};
