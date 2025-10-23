import { searchActivities } from "@/commands/activity";
import { TickerAvatar } from "@/components/ticker-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePersistentState } from "@/hooks/use-persistent-state";
import {
  calculateActivityValue,
  isCashActivity,
  isCashTransfer,
  isFeeActivity,
  isIncomeActivity,
  isSplitActivity,
} from "@/lib/activity-utils";
import { ActivityType, ActivityTypeNames } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import { Account, ActivityDetails, ActivitySearchResponse } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { useInfiniteQuery } from "@tanstack/react-query";
import { formatAmount, Separator } from "@wealthfolio/ui";
import { debounce } from "lodash";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityMobileFilterSheet } from "./activity-mobile-filter-sheet";
import { ActivityOperations } from "./activity-operations";

const fetchSize = 25;

interface ActivityTableMobileProps {
  accounts: Account[];
  handleEdit: (activity?: ActivityDetails) => void;
  handleDelete: (activity: ActivityDetails) => void;
  onDuplicate: (activity: ActivityDetails) => Promise<void>;
  selectedAccounts: string[];
  setSelectedAccounts: (accountIds: string[]) => void;
  selectedActivityTypes: ActivityType[];
  setSelectedActivityTypes: (types: ActivityType[]) => void;
}

export const ActivityTableMobile = ({
  accounts,
  handleEdit,
  handleDelete,
  onDuplicate,
  selectedAccounts,
  setSelectedAccounts,
  selectedActivityTypes,
  setSelectedActivityTypes,
}: ActivityTableMobileProps) => {
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isCompactView, setIsCompactView] = usePersistentState(
    "activity-mobile-view-compact",
    false,
  );

  // Debounced search query update
  const debouncedSetSearchQuery = useCallback(
    debounce((value: string) => {
      setSearchQuery(value);
    }, 500),
    [],
  );

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    debouncedSetSearchQuery(value);
  };

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedSetSearchQuery.cancel();
    };
  }, [debouncedSetSearchQuery]);

  const hasActiveFilters = useMemo(() => {
    const hasAccountFilter = selectedAccounts.length > 0;
    const hasTypeFilter = selectedActivityTypes.length > 0;
    return hasAccountFilter || hasTypeFilter;
  }, [selectedAccounts, selectedActivityTypes]);

  const columnFilters = useMemo(() => {
    const filters: { id: string; value: unknown }[] = [];
    if (selectedAccounts.length > 0) {
      filters.push({ id: "accountId", value: selectedAccounts });
    }
    if (selectedActivityTypes.length > 0) {
      filters.push({ id: "activityType", value: selectedActivityTypes });
    }
    return filters;
  }, [selectedAccounts, selectedActivityTypes]);

  const { data, fetchNextPage, isFetching, isLoading } = useInfiniteQuery<
    ActivitySearchResponse,
    Error
  >({
    queryKey: [QueryKeys.ACTIVITY_DATA, columnFilters, searchQuery],
    queryFn: async (context) => {
      const pageParam = (context.pageParam as number) ?? 0;
      const columnFiltersObj = columnFilters.reduce<Record<string, unknown>>(
        (acc, curr) => {
          acc[curr.id] = curr.value;
          return acc;
        },
        {} as Record<string, unknown>,
      );

      return searchActivities(pageParam, fetchSize, columnFiltersObj, searchQuery, {
        id: "date",
        desc: true,
      });
    },
    getNextPageParam: (_lastGroup, groups) => groups.length,
    initialPageParam: 0,
  });

  const { flatData, totalDBRowCount }: { flatData: ActivityDetails[]; totalDBRowCount: number } =
    React.useMemo(() => {
      const pages = data?.pages ?? [];
      return {
        flatData: pages.flatMap((page) => page.data),
        totalDBRowCount: pages[0]?.meta?.totalRowCount ?? 0,
      };
    }, [data]);

  const totalFetched = flatData.length;
  const hasMore = totalFetched < totalDBRowCount;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col space-y-3">
      <div className="flex shrink-0 items-center gap-2">
        <Input
          placeholder="Search..."
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="bg-secondary/30 flex-1 rounded-full border-none"
        />
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 flex-shrink-0"
          onClick={() => setIsCompactView(!isCompactView)}
          title={isCompactView ? "Detailed view" : "Compact view"}
        >
          {isCompactView ? (
            <Icons.Rows3 className="h-4 w-4" />
          ) : (
            <Icons.ListCollapse className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 flex-shrink-0"
          onClick={() => setIsFilterSheetOpen(true)}
        >
          <div className="relative">
            <Icons.ListFilter className="h-4 w-4" />
            {hasActiveFilters && (
              <span className="bg-primary absolute -top-1 -left-[1.5px] h-2 w-2 rounded-full" />
            )}
          </div>
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto">
        {flatData.length > 0 ? (
          flatData.map((activity) => {
            const symbol = activity.assetSymbol;
            const displaySymbol = symbol.startsWith("$CASH") ? symbol.split("-")[0] : symbol;
            const avatarSymbol = symbol.startsWith("$CASH") ? "$CASH" : symbol;
            const isCash = symbol.startsWith("$CASH");
            const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const formattedDate = formatDateTime(activity.date, userTimezone);

            const activityType = activity.activityType;
            const badgeVariant =
              activityType === "BUY" ||
              activityType === "DEPOSIT" ||
              activityType === "DIVIDEND" ||
              activityType === "INTEREST" ||
              activityType === "TRANSFER_IN" ||
              activityType === "ADD_HOLDING"
                ? "success"
                : activityType === "SPLIT"
                  ? "secondary"
                  : "destructive";

            const displayValue = calculateActivityValue(activity);

            // Compact View
            if (isCompactView) {
              const activityTypeLabel = ActivityTypeNames[activityType];
              return (
                <Card key={activity.id} className="p-3">
                  <div className="flex items-center gap-3">
                    <TickerAvatar symbol={avatarSymbol} className="h-10 w-10 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate font-semibold">{displaySymbol}</p>
                        {activityType !== "SPLIT" && (
                          <span className="shrink-0 text-sm font-semibold">
                            {formatAmount(displayValue, activity.currency)}
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground text-xs">{activityTypeLabel}</p>
                      <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                        <span>{formattedDate.date}</span>
                        {!isCashActivity(activityType) &&
                          !isIncomeActivity(activityType) &&
                          !isSplitActivity(activityType) &&
                          !isFeeActivity(activityType) && (
                            <>
                              <span>•</span>
                              <span>{activity.quantity} shares</span>
                            </>
                          )}
                      </div>
                    </div>
                    <ActivityOperations
                      activity={activity}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onDuplicate={onDuplicate}
                    />
                  </div>
                </Card>
              );
            }

            // Detailed View
            return (
              <Card key={activity.id} className="p-3">
                <div className="space-y-2">
                  {/* Header: Symbol and Date */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <TickerAvatar symbol={avatarSymbol} className="h-10 w-10" />
                      <div>
                        <p className="font-semibold">{displaySymbol}</p>
                        <p className="text-muted-foreground text-xs">
                          {isCash ? activity.currency : activity.assetName}
                        </p>
                      </div>
                    </div>
                    <ActivityOperations
                      activity={activity}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onDuplicate={onDuplicate}
                    />
                  </div>

                  <Separator />

                  {/* Activity Details Grid */}
                  <div className="space-y-1.5 text-sm">
                    {/* Date and Type */}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Date</span>
                      <div className="text-right">
                        <p>{formattedDate.date}</p>
                        <p className="text-muted-foreground text-xs">{formattedDate.time}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Type</span>
                      <Badge className="text-xs font-normal" variant={badgeVariant}>
                        {ActivityTypeNames[activityType]}
                      </Badge>
                    </div>

                    {/* Quantity (if applicable) */}
                    {!isCashActivity(activityType) &&
                      !isIncomeActivity(activityType) &&
                      !isSplitActivity(activityType) &&
                      !isFeeActivity(activityType) && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Shares</span>
                          <span className="font-medium">{activity.quantity}</span>
                        </div>
                      )}

                    {/* Price/Amount */}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {activityType === "SPLIT"
                          ? "Ratio"
                          : isCashActivity(activityType) ||
                              isCashTransfer(activityType, symbol) ||
                              isIncomeActivity(activityType)
                            ? "Amount"
                            : "Price"}
                      </span>
                      <span className="font-medium">
                        {activityType === "FEE"
                          ? "-"
                          : activityType === "SPLIT"
                            ? `${Number(activity.amount).toFixed(0)} : 1`
                            : isCashActivity(activityType) ||
                                isCashTransfer(activityType, symbol) ||
                                isIncomeActivity(activityType)
                              ? formatAmount(activity.amount, activity.currency)
                              : formatAmount(activity.unitPrice, activity.currency)}
                      </span>
                    </div>

                    {/* Fee (if applicable) */}
                    {activity.fee > 0 && activityType !== "SPLIT" && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Fee</span>
                        <span className="font-medium">
                          {formatAmount(activity.fee, activity.currency)}
                        </span>
                      </div>
                    )}

                    {/* Total Value */}
                    {activityType !== "SPLIT" && (
                      <div className="flex items-center justify-between border-t pt-1.5">
                        <span className="text-muted-foreground font-medium">Total Value</span>
                        <span className="font-semibold">
                          {formatAmount(displayValue, activity.currency)}
                        </span>
                      </div>
                    )}

                    {/* Account */}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Account</span>
                      <div className="text-right">
                        <p>{activity.accountName}</p>
                        <p className="text-muted-foreground text-xs">{activity.accountCurrency}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        ) : (
          <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
            <h3 className="text-lg font-medium">No activities found</h3>
            <p className="text-muted-foreground text-sm">
              Try adjusting your search or filter criteria.
            </p>
          </div>
        )}

        {/* Load More Button */}
        {hasMore && (
          <div className="flex justify-center py-2">
            <Button
              variant="outline"
              onClick={() => fetchNextPage()}
              disabled={isFetching}
              className="w-full"
            >
              {isFetching ? (
                <>
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>Load More</>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-muted-foreground shrink-0 text-center text-xs">
        {totalFetched} / {totalDBRowCount} activities
      </div>

      {/* Filter Sheet */}
      <ActivityMobileFilterSheet
        open={isFilterSheetOpen}
        onOpenChange={setIsFilterSheetOpen}
        selectedAccounts={selectedAccounts}
        accounts={accounts}
        setSelectedAccounts={setSelectedAccounts}
        selectedActivityTypes={selectedActivityTypes}
        setSelectedActivityTypes={setSelectedActivityTypes}
      />
    </div>
  );
};

export default ActivityTableMobile;
