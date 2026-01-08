import { useState, useMemo, useCallback } from "react";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Icons,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
} from "@wealthfolio/ui";
import { buildCategoryTree, type TreeNode } from "@wealthfolio/ui/components/ui/tree-view";
import { cn } from "@/lib/utils";
import { useTaxonomy } from "@/hooks/use-taxonomies";
import type { TaxonomyCategory } from "@/lib/types";

interface TaxonomyPickerProps {
  taxonomyId: string;
  value?: string | null; // selected category ID
  onChange: (categoryId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

interface FlattenedCategory {
  id: string;
  name: string;
  color: string;
  level: number;
  parentId?: string | null;
}

/**
 * Flatten tree nodes with depth level for display
 */
function flattenTreeWithLevels(
  nodes: TreeNode[],
  level: number = 0
): FlattenedCategory[] {
  const result: FlattenedCategory[] = [];

  for (const node of nodes) {
    const categoryData = node.data as TaxonomyCategory | undefined;
    result.push({
      id: node.id,
      name: node.name,
      color: categoryData?.color ?? "#808080",
      level,
      parentId: categoryData?.parentId,
    });

    if (node.children && node.children.length > 0) {
      result.push(...flattenTreeWithLevels(node.children, level + 1));
    }
  }

  return result;
}

export function TaxonomyPicker({
  taxonomyId,
  value,
  onChange,
  placeholder = "Select category...",
  disabled = false,
}: TaxonomyPickerProps) {
  const [open, setOpen] = useState(false);
  const { data: taxonomyData, isLoading, isError } = useTaxonomy(taxonomyId);

  // Build the category tree from flat categories
  const categoryTree = useMemo(() => {
    if (!taxonomyData?.categories) return [];
    return buildCategoryTree(taxonomyData.categories);
  }, [taxonomyData?.categories]);

  // Flatten tree for command list display with indentation levels
  const flattenedCategories = useMemo(() => {
    return flattenTreeWithLevels(categoryTree);
  }, [categoryTree]);

  // Find the selected category by ID
  const selectedCategory = useMemo(() => {
    if (!value || !taxonomyData?.categories) return null;
    return taxonomyData.categories.find((cat) => cat.id === value) ?? null;
  }, [value, taxonomyData?.categories]);

  const handleSelect = useCallback(
    (categoryId: string) => {
      // Toggle selection - if same item is selected, deselect it
      if (categoryId === value) {
        onChange(null);
      } else {
        onChange(categoryId);
      }
      setOpen(false);
    },
    [value, onChange]
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(null);
    },
    [onChange]
  );

  // Loading state
  if (isLoading) {
    return (
      <Button
        variant="outline"
        className="w-full justify-between"
        disabled
      >
        <Skeleton className="h-4 w-32" />
        <Icons.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    );
  }

  // Error state
  if (isError) {
    return (
      <Button
        variant="outline"
        className="w-full justify-between text-destructive"
        disabled
      >
        <span>Error loading taxonomy</span>
        <Icons.AlertCircle className="ml-2 h-4 w-4 shrink-0" />
      </Button>
    );
  }

  // Empty state (no categories)
  if (!taxonomyData?.categories || taxonomyData.categories.length === 0) {
    return (
      <Button
        variant="outline"
        className="w-full justify-between"
        disabled
      >
        <span className="text-muted-foreground">No categories available</span>
        <Icons.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select a category"
          className={cn(
            "w-full justify-between",
            !selectedCategory && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <div className="flex items-center gap-2 truncate">
            {selectedCategory ? (
              <>
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: selectedCategory.color }}
                />
                <span className="truncate">{selectedCategory.name}</span>
              </>
            ) : (
              <span>{placeholder}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {selectedCategory && !disabled && (
              <span
                role="button"
                tabIndex={0}
                className="rounded-sm p-0.5 hover:bg-muted"
                onClick={handleClear}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleClear(e as unknown as React.MouseEvent);
                  }
                }}
              >
                <Icons.Close className="h-3 w-3 opacity-50 hover:opacity-100" />
              </span>
            )}
            <Icons.ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        style={{ minWidth: "var(--radix-popover-trigger-width)" }}
      >
        <Command>
          <CommandInput placeholder="Search categories..." />
          <CommandList>
            <CommandEmpty>No categories found.</CommandEmpty>
            <CommandGroup>
              {flattenedCategories.map((category) => (
                <CommandItem
                  key={category.id}
                  value={`${category.name} ${category.id}`}
                  onSelect={() => handleSelect(category.id)}
                  className="flex items-center py-1.5"
                >
                  {/* Indentation based on level */}
                  <div
                    className="flex items-center"
                    style={{ paddingLeft: `${category.level * 16}px` }}
                  >
                    {/* Color dot */}
                    <span
                      className="mr-2 h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    {/* Category name */}
                    <span className="truncate">{category.name}</span>
                  </div>
                  {/* Check icon for selected item */}
                  <Icons.Check
                    className={cn(
                      "ml-auto h-4 w-4 shrink-0",
                      value === category.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
