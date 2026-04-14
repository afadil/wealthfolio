import type { TFunction } from "i18next";
import type { TimePeriod } from "@wealthfolio/ui";

/** Localized interval descriptions for {@link IntervalSelector} and {@link getInitialIntervalData}. */
export function buildIntervalLabels(t: TFunction): Record<TimePeriod, string> {
  return {
    "1D": t("shared.interval.past_day"),
    "1W": t("shared.interval.past_week"),
    "1M": t("shared.interval.past_month"),
    "3M": t("shared.past_n_months", { count: 3 }),
    "6M": t("shared.past_n_months", { count: 6 }),
    YTD: t("shared.interval.year_to_date"),
    "1Y": t("shared.interval.past_year"),
    "3Y": t("shared.past_n_years", { count: 3 }),
    "5Y": t("shared.past_n_years", { count: 5 }),
    ALL: t("shared.interval.all_time"),
  };
}

/** Short pill labels for {@link IntervalSelector} (e.g. 1J / 3J / Alle in German). */
export function buildIntervalButtonLabels(t: TFunction): Partial<Record<TimePeriod, string>> {
  return {
    "1Y": t("shared.interval.toggle.1Y"),
    "3Y": t("shared.interval.toggle.3Y"),
    "5Y": t("shared.interval.toggle.5Y"),
    ALL: t("shared.interval.toggle.ALL"),
  };
}
