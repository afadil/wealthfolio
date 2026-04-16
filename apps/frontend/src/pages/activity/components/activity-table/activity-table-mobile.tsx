import { TickerAvatar } from "@/components/ticker-avatar";
import { Card } from "@wealthfolio/ui/components/ui/card";
import {
  calculateActivityValue,
  formatSplitRatio,
  isAssetBackedIncomeActivity,
  isCashActivity,
  isCashTransfer,
  isFeeActivity,
  isIncomeActivity,
  isSplitActivity,
} from "@/lib/activity-utils";
import { ActivityType } from "@/lib/constants";
import { parseOccSymbol } from "@/lib/occ-symbol";
import { useSettingsContext } from "@/lib/settings-provider";
import { ActivityDetails } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { formatAmount, Separator } from "@wealthfolio/ui";
import { Link } from "react-router-dom";
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
  const { t } = useTranslation("common");
  const { settings } = useSettingsContext();
  const appTimezone = settings?.timezone?.trim() || undefined;

  if (activities.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
        <h3 className="text-lg font-medium">{t("activity.table.empty_title")}</h3>
        <p className="text-muted-foreground text-sm">{t("activity.table.empty_hint")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-auto">
      {activities.map((activity) => {
        const symbol = activity.assetSymbol;
        const activityType = activity.activityType;
        const isTransferActivity =
          activityType === ActivityType.TRANSFER_IN || activityType === ActivityType.TRANSFER_OUT;
        const isAssetBackedIncome = isAssetBackedIncomeActivity(
          activityType,
          symbol,
          activity.assetId,
        );
        const hasAsset = Boolean(activity.assetId?.trim());
        const isCash = isTransferActivity
          ? !hasAsset || isCashTransfer(activityType, symbol)
          : isCashActivity(activityType) && !isAssetBackedIncome;
        const isOptionActivity = activity.instrumentType === "OPTION";
        const parsedOption = isOptionActivity ? parseOccSymbol(symbol) : null;
        const displaySymbol = isCash
          ? t("activity.display.cash")
          : parsedOption
            ? parsedOption.underlying
            : symbol;
        const avatarSymbol = isCash ? "$CASH" : symbol;
        const optionSubtitle = parsedOption
          ? `${new Date(parsedOption.expiration + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} $${parsedOption.strikePrice} ${parsedOption.optionType}`
          : null;
        const formattedDate = formatDateTime(activity.date, appTimezone);
        const displayValue = calculateActivityValue(activity);

        // Compact View
        if (isCompactView) {
          const activityTypeLabel = t(`activity.types.${activity.activityType}`);
          return (
            <Card key={activity.id} className="p-3">
              <div className="flex items-center gap-3">
                {(() => {
                  const inner = (
                    <>
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
                        <p className="text-muted-foreground text-xs">
                          {optionSubtitle
                            ? `${activityTypeLabel} · ${optionSubtitle}`
                            : activityTypeLabel}
                        </p>
                        <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
                          <span>{formattedDate.date}</span>
                          {!isCash &&
                            !(isIncomeActivity(activity.activityType) && !isAssetBackedIncome) &&
                            !isSplitActivity(activity.activityType) &&
                            !isFeeActivity(activity.activityType) &&
                            activity.quantity && (
                              <>
                                <span>•</span>
                                <span>
                                  {activity.quantity}{" "}
                                  {isOptionActivity
                                    ? t("activity.mobile.contracts")
                                    : t("activity.mobile.shares")}
                                </span>
                              </>
                            )}
                        </div>
                      </div>
                    </>
                  );
                  return isCash || !hasAsset ? (
                    <div className="flex min-w-0 flex-1 items-center gap-3">{inner}</div>
                  ) : (
                    <Link
                      to={`/holdings/${encodeURIComponent(activity.assetId)}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      {inner}
                    </Link>
                  );
                })()}
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
                {(() => {
                  const inner = (
                    <>
                      <TickerAvatar symbol={avatarSymbol} className="h-10 w-10" />
                      <div>
                        <p className="font-semibold">{displaySymbol}</p>
                        <p className="text-muted-foreground text-xs">
                          {isCash ? activity.currency : (optionSubtitle ?? activity.assetName)}
                        </p>
                      </div>
                    </>
                  );
                  return isCash || !hasAsset ? (
                    <div className="flex items-center gap-2">{inner}</div>
                  ) : (
                    <Link
                      to={`/holdings/${encodeURIComponent(activity.assetId)}`}
                      className="flex items-center gap-2"
                    >
                      {inner}
                    </Link>
                  );
                })()}
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
                  <span className="text-muted-foreground">{t("activity.mobile.detail.date")}</span>
                  <div className="text-right">
                    <p>{formattedDate.date}</p>
                    <p className="text-muted-foreground text-xs">{formattedDate.time}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("activity.mobile.detail.type")}</span>
                  <ActivityTypeBadge type={activity.activityType} className="text-xs font-normal" />
                </div>

                {/* Quantity (if applicable) */}
                {!isCash &&
                  !(isIncomeActivity(activity.activityType) && !isAssetBackedIncome) &&
                  !isSplitActivity(activity.activityType) &&
                  !isFeeActivity(activity.activityType) &&
                  activity.quantity && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {isOptionActivity
                          ? t("activity.mobile.contracts_label")
                          : t("activity.mobile.shares_label")}
                      </span>
                      <span className="font-medium">{activity.quantity}</span>
                    </div>
                  )}

                {/* Price/Amount */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {activity.activityType === "SPLIT"
                      ? t("activity.mobile.ratio")
                      : (isCashActivity(activity.activityType) && !isAssetBackedIncome) ||
                          isCashTransfer(activity.activityType, symbol) ||
                          (isIncomeActivity(activity.activityType) && !isAssetBackedIncome)
                        ? t("activity.mobile.amount")
                        : isOptionActivity
                          ? t("activity.mobile.premium")
                          : t("activity.mobile.price")}
                  </span>
                  <span className="font-medium">
                    {activity.activityType === "FEE"
                      ? "-"
                      : activity.activityType === "SPLIT"
                        ? formatSplitRatio(Number(activity.amount))
                        : (isCashActivity(activity.activityType) && !isAssetBackedIncome) ||
                            isCashTransfer(activity.activityType, symbol) ||
                            (isIncomeActivity(activity.activityType) && !isAssetBackedIncome)
                          ? formatAmount(Number(activity.amount), activity.currency)
                          : formatAmount(Number(activity.unitPrice), activity.currency)}
                  </span>
                </div>

                {/* Fee (if applicable) */}
                {Number(activity.fee) > 0 && activity.activityType !== "SPLIT" && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t("activity.mobile.fee")}</span>
                    <span className="font-medium">
                      {formatAmount(Number(activity.fee), activity.currency)}
                    </span>
                  </div>
                )}

                {/* Total Value */}
                {activity.activityType !== "SPLIT" && (
                  <div className="flex items-center justify-between border-t pt-1.5">
                    <span className="text-muted-foreground font-medium">
                      {t("activity.mobile.total_value")}
                    </span>
                    <span className="font-semibold">
                      {formatAmount(displayValue, activity.currency)}
                    </span>
                  </div>
                )}

                {/* Account */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("activity.mobile.detail.account")}</span>
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
