import { useMemo } from "react";
import {
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
  Skeleton,
} from "@wealthfolio/ui";
import { cn } from "@/lib/utils";
import {
  useTaxonomy,
  useAssetTaxonomyAssignments,
  useAssignAssetToCategory,
} from "@/hooks/use-taxonomies";
import type { TaxonomyCategory } from "@/lib/types";

const MAX_RADIO_ITEMS = 8;

// Abbreviations for common long names
const ABBREVIATIONS: Record<string, string> = {
  "Exchange Traded Fund (ETF)": "ETF",
  "Exchange Traded Fund": "ETF",
  Cryptocurrency: "Crypto",
  "Mutual Fund": "Fund",
  Unknown: "N/A",
};

interface SingleSelectTaxonomyProps {
  taxonomyId: string;
  assetId: string;
  label?: string;
  disabled?: boolean;
}

/**
 * A component for selecting a single category from a taxonomy.
 * Renders as a grid of pill buttons for small category counts (<=8),
 * or as a dropdown select for larger counts.
 */
export function SingleSelectTaxonomy({
  taxonomyId,
  assetId,
  label,
  disabled = false,
}: SingleSelectTaxonomyProps) {
  const { data: taxonomyData, isLoading: isLoadingTaxonomy } = useTaxonomy(taxonomyId);
  const { data: assignments, isLoading: isLoadingAssignments } =
    useAssetTaxonomyAssignments(assetId);
  const assignMutation = useAssignAssetToCategory();

  const isLoading = isLoadingTaxonomy || isLoadingAssignments;

  // Get all categories sorted by sort order
  const allCategories = useMemo(() => {
    if (!taxonomyData?.categories) return [];
    return [...taxonomyData.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [taxonomyData?.categories]);

  // Find current assignment for this taxonomy
  const currentAssignment = useMemo(() => {
    if (!assignments) return null;
    return assignments.find((a) => a.taxonomyId === taxonomyId);
  }, [assignments, taxonomyId]);

  const selectedCategoryId = currentAssignment?.categoryId ?? "";

  const handleSelectionChange = (categoryId: string) => {
    if (!categoryId || categoryId === selectedCategoryId) return;

    assignMutation.mutate({
      assetId,
      taxonomyId,
      categoryId,
      weight: 10000, // 100% in basis points
      source: "manual",
    });
  };

  // Get abbreviated display name
  const getDisplayName = (name: string): string => {
    return ABBREVIATIONS[name] ?? name;
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-2">
        {label && <Skeleton className="h-4 w-24" />}
        <div className="flex flex-wrap gap-2 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-16 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  // No taxonomy found
  if (!taxonomyData) {
    return null;
  }

  const isDisabled = disabled || assignMutation.isPending;

  // Use dropdown for many categories
  if (allCategories.length > MAX_RADIO_ITEMS) {
    return (
      <div className="space-y-2">
        {label && <Label className="text-muted-foreground text-sm font-medium">{label}</Label>}
        <Select
          value={selectedCategoryId}
          onValueChange={handleSelectionChange}
          disabled={isDisabled}
        >
          <SelectTrigger className="mt-2 w-full max-w-xs">
            <SelectValue placeholder="Select...">
              {selectedCategoryId && (
                <CategoryDisplay
                  category={allCategories.find((c) => c.id === selectedCategoryId)}
                />
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {allCategories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                <CategoryDisplay category={category} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // Use pill buttons in a wrapping layout
  return (
    <div className="space-y-2">
      {label && <Label className="text-muted-foreground text-sm font-medium">{label}</Label>}
      <RadioGroup
        value={selectedCategoryId}
        onValueChange={handleSelectionChange}
        disabled={isDisabled}
        className="flex flex-wrap gap-1.5 pt-2"
      >
        {allCategories.map((category) => {
          const isSelected = selectedCategoryId === category.id;
          const displayName = getDisplayName(category.name);

          return (
            <label
              key={category.id}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-all",
                isSelected
                  ? "border-transparent font-medium shadow-sm"
                  : "border-border bg-background hover:bg-muted/50",
                isDisabled && "cursor-not-allowed opacity-50",
              )}
              style={
                isSelected
                  ? {
                      backgroundColor: `${category.color}20`,
                      color: category.color,
                      borderColor: category.color,
                    }
                  : undefined
              }
            >
              <RadioGroupItem
                value={category.id}
                id={`${taxonomyId}-${category.id}`}
                className="sr-only"
              />
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: category.color }}
                aria-hidden="true"
              />
              <span className="whitespace-nowrap">{displayName}</span>
            </label>
          );
        })}
      </RadioGroup>
    </div>
  );
}

/**
 * Helper component to display a category with color dot
 */
function CategoryDisplay({ category }: { category?: TaxonomyCategory }) {
  if (!category) return null;

  return (
    <span className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: category.color }}
        aria-hidden="true"
      />
      <span>{category.name}</span>
    </span>
  );
}
