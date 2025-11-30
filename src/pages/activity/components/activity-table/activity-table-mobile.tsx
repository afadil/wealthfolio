import { TickerAvatar } from "@/components/ticker-avatar";
import { Card } from "@/components/ui/card";
import {
  calculateActivityValue,
  isCashActivity,
  isCashTransfer,
  isFeeActivity,
  isIncomeActivity,
  isSplitActivity,
} from "@/lib/activity-utils";
import { getActivityTypeName } from "@/lib/constants";
import { ActivityDetails } from "@/lib/types";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { formatAmount, Separator } from "@wealthvn/ui";
import { useTranslation } from "react-i18next";
import { ActivityOperations } from "../activity-operations";
import { ActivityTypeBadge } from "../activity-type-badge";

interface ActivityTableMobileProps {
  activities: ActivityDetails[];
  isCompactView: boolean;
  handleEdit: (activity?: ActivityDetails) => void;
  handleDelete: (activity: ActivityDetails) => void;
  onDuplicate: (activity: ActivityDetails) => Promise<void>;
}

export const ActivityTableMobile = ({
  activities,
  isCompactView,
  handleEdit,
  handleDelete,
  onDuplicate,
}: ActivityTableMobileProps) => {
  const { t } = useTranslation(["activity"]);
  const { formatDateTimeDisplay } = useDateFormatter();

  if (activities.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
        <h3 className="text-lg font-medium">{t("activity:mobile.noActivitiesFound")}</h3>
        <p className="text-muted-foreground text-sm">{t("activity:mobile.tryAdjusting")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-auto">
      {activities.map((activity) => {
        const symbol = activity.assetSymbol;
        const displaySymbol = symbol.startsWith("$CASH") ? symbol.split("-")[0] : symbol;
        const avatarSymbol = symbol.startsWith("$CASH") ? "$CASH" : symbol;
        const isCash = symbol.startsWith("$CASH");
        const formattedDateTime = formatDateTimeDisplay(activity.date);
        const displayValue = calculateActivityValue(activity);

        // Compact View
        if (isCompactView) {
          const activityTypeLabel = getActivityTypeName(activity.activityType, t);
          return (
            <Card key={activity.id} className="p-3">
              <div className="flex items-center gap-3">
                <TickerAvatar symbol={avatarSymbol} className="h-10 w-10 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-semibold">{displaySymbol}</p>
                    {activity.activityType !== "SPLIT" && (
                      <span className="shrink-0 text-sm font-semibold">
                        {formatAmount(displayValue, activity.currency)}
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">{activityTypeLabel}</p>
                  <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                    <span>{formattedDateTime}</span>
                    {!isCashActivity(activity.activityType) &&
                      !isIncomeActivity(activity.activityType) &&
                      !isSplitActivity(activity.activityType) &&
                      !isFeeActivity(activity.activityType) && (
                        <>
                          <span>•</span>
                          <span>
                            {activity.quantity} {t("activity:table.shares")}
                          </span>
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
                  <span className="text-muted-foreground">{t("activity:table.date")}</span>
                  <div className="text-right">
                    <p>{formattedDateTime}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("activity:table.type")}</span>
                  <ActivityTypeBadge type={activity.activityType} className="text-xs font-normal" />
                </div>

                {/* Quantity (if applicable) */}
                {!isCashActivity(activity.activityType) &&
                  !isIncomeActivity(activity.activityType) &&
                  !isSplitActivity(activity.activityType) &&
                  !isFeeActivity(activity.activityType) && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("activity:table.shares")}</span>
                      <span className="font-medium">{activity.quantity}</span>
                    </div>
                  )}

                {/* Price/Amount */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {activity.activityType === "SPLIT"
                      ? t("activity:table.ratio")
                      : isCashActivity(activity.activityType) ||
                          isCashTransfer(activity.activityType, symbol) ||
                          isIncomeActivity(activity.activityType)
                        ? t("activity:table.amount")
                        : t("activity:table.price")}
                  </span>
                  <span className="font-medium">
                    {activity.activityType === "FEE"
                      ? "-"
                      : activity.activityType === "SPLIT"
                        ? `${Number(activity.amount).toFixed(0)} : 1`
                        : isCashActivity(activity.activityType) ||
                            isCashTransfer(activity.activityType, symbol) ||
                            isIncomeActivity(activity.activityType)
                          ? formatAmount(activity.amount, activity.currency)
                          : formatAmount(activity.unitPrice, activity.currency)}
                  </span>
                </div>

                {/* Fee (if applicable) */}
                {activity.fee > 0 && activity.activityType !== "SPLIT" && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t("activity:table.fee")}</span>
                    <span className="font-medium">
                      {formatAmount(activity.fee, activity.currency)}
                    </span>
                  </div>
                )}

                {/* Total Value */}
                {activity.activityType !== "SPLIT" && (
                  <div className="flex items-center justify-between border-t pt-1.5">
                    <span className="text-muted-foreground font-medium">
                      {t("activity:table.totalValue")}
                    </span>
                    <span className="font-semibold">
                      {formatAmount(displayValue, activity.currency)}
                    </span>
                  </div>
                )}

                {/* Account */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("activity:table.account")}</span>
                  <div className="text-right">
                    <p>{activity.accountName}</p>
                    <p className="text-muted-foreground text-xs">{activity.accountCurrency}</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default ActivityTableMobile;
