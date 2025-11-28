import type { Category, CategoryWithChildren, NewCategory, UpdateCategory } from "@/lib/types";
import { getRunEnv, RUN_ENV, invokeTauri, invokeWeb } from "@/adapters";
import { logger } from "@/adapters";

export const getCategories = async (): Promise<Category[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_categories");
      case RUN_ENV.WEB:
        return invokeWeb("get_categories");
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching categories.");
    throw error;
  }
};

export const getCategoriesHierarchical = async (): Promise<CategoryWithChildren[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_categories_hierarchical");
      case RUN_ENV.WEB:
        return invokeWeb("get_categories_hierarchical");
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching hierarchical categories.");
    throw error;
  }
};

export const getExpenseCategories = async (): Promise<CategoryWithChildren[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_expense_categories");
      case RUN_ENV.WEB:
        return invokeWeb("get_expense_categories");
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching expense categories.");
    throw error;
  }
};

export const getIncomeCategories = async (): Promise<CategoryWithChildren[]> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("get_income_categories");
      case RUN_ENV.WEB:
        return invokeWeb("get_income_categories");
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching income categories.");
    throw error;
  }
};

export const createCategory = async (category: NewCategory): Promise<Category> => {
  try {
    // Ensure isIncome is a proper boolean (not 0/1 from database)
    const normalizedCategory = {
      ...category,
      isIncome: !!category.isIncome, // Double negation ensures true boolean
    };

    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("create_category", { category: normalizedCategory });
      case RUN_ENV.WEB:
        return invokeWeb("create_category", { category: normalizedCategory });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error creating category.");
    throw error;
  }
};

export const updateCategory = async (id: string, update: UpdateCategory): Promise<Category> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("update_category", { id, update });
      case RUN_ENV.WEB:
        return invokeWeb("update_category", { id, update });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error updating category.");
    throw error;
  }
};

export const deleteCategory = async (categoryId: string): Promise<void> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        await invokeTauri("delete_category", { categoryId });
        return;
      case RUN_ENV.WEB:
        await invokeWeb("delete_category", { categoryId });
        return;
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error deleting category.");
    throw error;
  }
};
