import { NeedsReviewIcon } from "@/components/needs-review";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LocalTransaction } from "./types";
import { getProviderMappingReasons, isPendingReview } from "./types";

interface StatusIndicatorProps {
  transaction: LocalTransaction;
}

/** What review means, for a row whose source gave no reasons. */
export function useReviewExplanation(): string[] {
  const { t } = useTranslation();
  return useMemo(
    () => [
      t("activity:datagrid.status_tooltip_line1"),
      t("activity:datagrid.status_tooltip_line2"),
    ],
    [t],
  );
}

/**
 * Marks a transaction pending review (synced from a broker, not yet approved)
 * with the same icon and tooltip as the activity and spending lists.
 */
export function StatusIndicator({ transaction }: StatusIndicatorProps) {
  const { t } = useTranslation();
  const explanation = useReviewExplanation();

  if (!isPendingReview(transaction)) {
    return null;
  }

  return (
    <div className="flex items-center">
      <NeedsReviewIcon
        label={t("activity:detail.needs_review")}
        reasons={getProviderMappingReasons(transaction)}
        explanation={explanation}
      />
    </div>
  );
}

interface StatusHeaderIndicatorProps {
  hasRowsToReview: boolean;
}

/** Shows the same icon in the header when any visible rows need review. */
export function StatusHeaderIndicator({ hasRowsToReview }: StatusHeaderIndicatorProps) {
  const { t } = useTranslation();
  const explanation = useReviewExplanation();

  if (!hasRowsToReview) {
    return null;
  }

  return (
    <div className="flex items-center">
      <NeedsReviewIcon label={t("activity:detail.needs_review")} explanation={explanation} />
    </div>
  );
}
