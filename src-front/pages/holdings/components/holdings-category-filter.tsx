import { AnimatedToggleGroup } from "@wealthfolio/ui";
import { HOLDING_CATEGORY_FILTERS, HoldingCategoryFilterId } from "@/lib/types";

interface HoldingsCategoryFilterProps {
  value: HoldingCategoryFilterId;
  onValueChange: (value: HoldingCategoryFilterId) => void;
  className?: string;
}

/**
 * Filter chips for the Holdings page to filter by asset category.
 * Uses stable IDs for persistence.
 */
export function HoldingsCategoryFilter({
  value,
  onValueChange,
  className,
}: HoldingsCategoryFilterProps) {
  const items: { value: HoldingCategoryFilterId; label: string }[] = HOLDING_CATEGORY_FILTERS.map(
    (filter) => ({
      value: filter.id,
      label: filter.label,
    }),
  );

  return (
    <AnimatedToggleGroup<HoldingCategoryFilterId>
      value={value}
      onValueChange={onValueChange}
      items={items}
      size="sm"
      rounded="full"
      className={className}
    />
  );
}

export default HoldingsCategoryFilter;
