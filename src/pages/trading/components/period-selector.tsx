import { AnimatedToggleGroup } from "@wealthvn/ui";

type PeriodType = "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";

interface PeriodSelectorProps {
  selectedPeriod: PeriodType;
  onPeriodSelect: (period: PeriodType) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}

export function PeriodSelector({ selectedPeriod, onPeriodSelect, t }: PeriodSelectorProps) {
  const periods = [
    { value: "1M" as const, label: t("dashboard.periods.1M") },
    { value: "3M" as const, label: t("dashboard.periods.3M") },
    { value: "6M" as const, label: t("dashboard.periods.6M") },
    { value: "YTD" as const, label: t("dashboard.periods.YTD") },
    { value: "1Y" as const, label: t("dashboard.periods.1Y") },
    { value: "ALL" as const, label: t("dashboard.periods.ALL") },
  ];

  return (
    <AnimatedToggleGroup
      items={periods}
      value={selectedPeriod}
      onValueChange={onPeriodSelect}
      variant="secondary"
      size="sm"
    />
  );
}

export function getChartPeriodDisplay(
  period: PeriodType,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any,
) {
  switch (period) {
    case "1M":
      return {
        type: t("dashboard.chartPeriod.daily"),
        description: t("dashboard.chartPeriod.dailyDescription"),
      };
    case "3M":
      return {
        type: t("dashboard.chartPeriod.weekly"),
        description: t("dashboard.chartPeriod.weeklyDescription"),
      };
    default:
      return {
        type: t("dashboard.chartPeriod.monthly"),
        description: t("dashboard.chartPeriod.monthlyDescription"),
      };
  }
}
