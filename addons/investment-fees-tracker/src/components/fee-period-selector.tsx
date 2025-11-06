import { AnimatedToggleGroup } from "@wealthfolio/ui";

const periods = [
  { value: "YTD" as const, label: "Year to Date" },
  { value: "LAST_YEAR" as const, label: "Last Year" },
  { value: "TOTAL" as const, label: "All Time" },
];

const mobilePeriods = [
  { value: "YTD" as const, label: "YTD" },
  { value: "LAST_YEAR" as const, label: "Last Yr" },
  { value: "TOTAL" as const, label: "All" },
];

interface FeePeriodSelectorProps {
  selectedPeriod: "TOTAL" | "YTD" | "LAST_YEAR";
  onPeriodSelect: (period: "TOTAL" | "YTD" | "LAST_YEAR") => void;
}

export function FeePeriodSelector({ selectedPeriod, onPeriodSelect }: FeePeriodSelectorProps) {
  return (
    <>
      <div className="hidden sm:block">
        <AnimatedToggleGroup
          items={periods}
          value={selectedPeriod}
          onValueChange={onPeriodSelect}
          variant="secondary"
          size="sm"
          rounded="full"
        />
      </div>
      <div className="block sm:hidden">
        <AnimatedToggleGroup
          items={mobilePeriods}
          value={selectedPeriod}
          onValueChange={onPeriodSelect}
          variant="secondary"
          size="xs"
          rounded="full"
        />
      </div>
    </>
  );
}
