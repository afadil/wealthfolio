import React from "react";
import { Button } from "@wealthfolio/ui";

const periods: { code: "TOTAL" | "YTD" | "LAST_YEAR"; label: string }[] = [
  { code: "TOTAL", label: "All Time" },
  { code: "LAST_YEAR", label: "Last Year" },
  { code: "YTD", label: "Year to Date" },
];

interface FeePeriodSelectorProps {
  selectedPeriod: "TOTAL" | "YTD" | "LAST_YEAR";
  onPeriodSelect: (period: "TOTAL" | "YTD" | "LAST_YEAR") => void;
}

export function FeePeriodSelector({ selectedPeriod, onPeriodSelect }: FeePeriodSelectorProps) {
  return (
    <div className="flex justify-end">
      <div className="bg-secondary flex space-x-1 rounded-full p-1">
        {periods.map(({ code, label }) => (
          <Button
            key={code}
            size="sm"
            className="h-8 rounded-full px-2 text-xs"
            variant={selectedPeriod === code ? "default" : "ghost"}
            onClick={() => onPeriodSelect(code)}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
