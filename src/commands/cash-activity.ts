import { Activity, ActivityCreate, ActivitySearchResponse, ActivityUpdate } from "@/lib/types";
import { getRunEnv, RUN_ENV, invokeTauri, invokeWeb, logger } from "@/adapters";

// Cash-specific activity types
export const CASH_ACTIVITY_TYPES = [
  "DEPOSIT",
  "WITHDRAWAL",
  "TRANSFER_IN",
  "TRANSFER_OUT",
] as const;

export type CashActivityType = (typeof CASH_ACTIVITY_TYPES)[number];

interface CashActivityFilters {
  accountIds?: string[];
  activityTypes?: CashActivityType[];
  categoryIds?: string[];
  eventIds?: string[];
  recurrenceTypes?: string[];
  search?: string;
  isCategorized?: boolean;
  hasEvent?: boolean;
  hasRecurrence?: boolean;
  amountMin?: number;
  amountMax?: number;
  startDate?: string;
  endDate?: string;
}

interface Sort {
  id: string;
  desc: boolean;
}

export const searchCashActivities = async (
  page: number,
  pageSize: number,
  filters: CashActivityFilters,
  sort: Sort,
): Promise<ActivitySearchResponse> => {
  try {
    // Use the existing search_activities endpoint with cash activity type filter
    const activityTypeFilter =
      filters.activityTypes && filters.activityTypes.length > 0
        ? filters.activityTypes
        : CASH_ACTIVITY_TYPES;

    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("search_activities", {
          page,
          pageSize,
          accountIdFilter: filters.accountIds,
          activityTypeFilter,
          categoryIdFilter: filters.categoryIds,
          eventIdFilter: filters.eventIds,
          recurrenceFilter: filters.recurrenceTypes,
          assetIdKeyword: filters.search,
          isCategorizedFilter: filters.isCategorized,
          hasEventFilter: filters.hasEvent,
          hasRecurrenceFilter: filters.hasRecurrence,
          amountMinFilter: filters.amountMin,
          amountMaxFilter: filters.amountMax,
          startDateFilter: filters.startDate,
          endDateFilter: filters.endDate,
          sort,
        });
      case RUN_ENV.WEB:
        return invokeWeb("search_activities", {
          page,
          pageSize,
          accountIdFilter: filters.accountIds,
          activityTypeFilter,
          categoryIdFilter: filters.categoryIds,
          eventIdFilter: filters.eventIds,
          recurrenceFilter: filters.recurrenceTypes,
          assetIdKeyword: filters.search,
          isCategorizedFilter: filters.isCategorized,
          hasEventFilter: filters.hasEvent,
          hasRecurrenceFilter: filters.hasRecurrence,
          amountMinFilter: filters.amountMin,
          amountMaxFilter: filters.amountMax,
          startDateFilter: filters.startDate,
          endDateFilter: filters.endDate,
          sort,
        });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error fetching cash activities.");
    throw error;
  }
};

export const createCashActivity = async (activity: ActivityCreate): Promise<Activity> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("create_activity", { activity });
      case RUN_ENV.WEB:
        return invokeWeb("create_activity", { activity });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error creating cash activity.");
    throw error;
  }
};

export const updateCashActivity = async (activity: ActivityUpdate): Promise<Activity> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("update_activity", { activity });
      case RUN_ENV.WEB:
        return invokeWeb("update_activity", { activity });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error updating cash activity.");
    throw error;
  }
};

export const deleteCashActivity = async (activityId: string): Promise<Activity> => {
  try {
    switch (getRunEnv()) {
      case RUN_ENV.DESKTOP:
        return invokeTauri("delete_activity", { activityId });
      case RUN_ENV.WEB:
        return invokeWeb("delete_activity", { activityId });
      default:
        throw new Error(`Unsupported`);
    }
  } catch (error) {
    logger.error("Error deleting cash activity.");
    throw error;
  }
};

export interface NewTransfer {
  sourceAccountId: string;
  destinationAccountId: string;
  sourceCurrency: string;
  destinationCurrency: string;
  date: string;
  amount: number;
  name?: string;
  description?: string;
  categoryId?: string | null;
  subCategoryId?: string | null;
  eventId?: string | null;
}

export const createTransfer = async (
  transfer: NewTransfer,
): Promise<{ sourceActivity: Activity; destinationActivity: Activity }> => {
  try {
    // Create TRANSFER_OUT on source account (negative)
    const sourceActivity: ActivityCreate = {
      accountId: transfer.sourceAccountId,
      activityType: "TRANSFER_OUT",
      activityDate: transfer.date,
      assetId: `$CASH-${transfer.sourceCurrency}`,
      currency: transfer.sourceCurrency,
      amount: -Math.abs(transfer.amount),
      quantity: 1,
      unitPrice: Math.abs(transfer.amount),
      isDraft: false,
      comment: transfer.description,
      name: transfer.name,
      categoryId: transfer.categoryId,
      subCategoryId: transfer.subCategoryId,
      eventId: transfer.eventId,
    };

    // Create TRANSFER_IN on destination account (positive)
    const destinationActivity: ActivityCreate = {
      accountId: transfer.destinationAccountId,
      activityType: "TRANSFER_IN",
      activityDate: transfer.date,
      assetId: `$CASH-${transfer.destinationCurrency}`,
      currency: transfer.destinationCurrency,
      amount: Math.abs(transfer.amount),
      quantity: 1,
      unitPrice: Math.abs(transfer.amount),
      isDraft: false,
      comment: transfer.description,
      name: transfer.name,
      categoryId: transfer.categoryId,
      subCategoryId: transfer.subCategoryId,
      eventId: transfer.eventId,
    };

    const sourceResult = await createCashActivity(sourceActivity);
    const destinationResult = await createCashActivity(destinationActivity);

    return {
      sourceActivity: sourceResult,
      destinationActivity: destinationResult,
    };
  } catch (error) {
    logger.error("Error creating transfer.");
    throw error;
  }
};
