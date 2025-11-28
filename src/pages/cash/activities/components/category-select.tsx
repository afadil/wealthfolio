import { getCategoriesHierarchical } from "@/commands/category";
import { Checkbox } from "@/components/ui/checkbox";
import { Icons } from "@/components/ui/icons";
import { QueryKeys } from "@/lib/query-keys";
import { CategoryWithChildren } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui";
import { Control, FieldValues, Path } from "react-hook-form";

interface CategorySelectProps<T extends FieldValues> {
  control: Control<T>;
  categoryFieldName: Path<T>;
  subCategoryFieldName: Path<T>;
  selectedCategoryId?: string | null;
  disabled?: boolean;
  isAutoCategorized?: boolean;
  ruleName?: string;
  onOverride?: () => void;
  isOverridden?: boolean;
}

export function CategorySelect<T extends FieldValues>({
  control,
  categoryFieldName,
  subCategoryFieldName,
  selectedCategoryId,
  disabled = false,
  isAutoCategorized = false,
  ruleName,
  onOverride,
  isOverridden = false,
}: CategorySelectProps<T>) {
  const { data: categories = [] } = useQuery<CategoryWithChildren[], Error>({
    queryKey: [QueryKeys.CATEGORIES_HIERARCHICAL],
    queryFn: getCategoriesHierarchical,
  });

  // Find the selected category to get its children (subcategories)
  const selectedCategory = categories.find((cat) => cat.id === selectedCategoryId);
  const subcategories = selectedCategory?.children || [];

  const isDisabled = disabled || (isAutoCategorized && !isOverridden);

  return (
    <div className="space-y-4">
      {/* Auto-categorization indicator */}
      {isAutoCategorized && !isOverridden && ruleName && (
        <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 p-2 dark:border-blue-800 dark:bg-blue-950">
          <div className="flex items-center gap-2">
            <Icons.Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              Auto-categorized by: <strong>{ruleName}</strong>
            </span>
          </div>
          {onOverride && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="override-checkbox"
                className="cursor-pointer text-sm text-blue-600 dark:text-blue-400"
              >
                Override
              </label>
              <Checkbox
                id="override-checkbox"
                checked={isOverridden}
                onCheckedChange={() => onOverride()}
                className="h-4 w-4"
              />
            </div>
          )}
        </div>
      )}

      {/* Category Select */}
      <FormField
        control={control}
        name={categoryFieldName}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Category</FormLabel>
            <FormControl>
              <Select
                onValueChange={(value) => field.onChange(value === "__none__" ? null : value)}
                value={field.value || "__none__"}
                disabled={isDisabled}
              >
                <SelectTrigger aria-label="Category">
                  <SelectValue placeholder="Select category (optional)" />
                </SelectTrigger>
                <SelectContent className="max-h-[400px] overflow-y-auto">
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground">No category</span>
                  </SelectItem>
                  {categories.map((category) => (
                    <SelectItem value={category.id} key={category.id}>
                      <span className="flex items-center gap-2">
                        <span className={`font-semibold ${category.isIncome ? "text-success" : "text-destructive"}`}>
                          {category.isIncome ? "+" : "−"}
                        </span>
                        {category.color && (
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                        )}
                        {category.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Subcategory Select - only show if parent category is selected and has children */}
      {selectedCategoryId && subcategories.length > 0 && (
        <FormField
          control={control}
          name={subCategoryFieldName}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subcategory</FormLabel>
              <FormControl>
                <Select
                  onValueChange={(value) => field.onChange(value === "__none__" ? null : value)}
                  value={field.value || "__none__"}
                  disabled={isDisabled}
                >
                  <SelectTrigger aria-label="Subcategory">
                    <SelectValue placeholder="Select subcategory (optional)" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[400px] overflow-y-auto">
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">No subcategory</span>
                    </SelectItem>
                    {subcategories.map((sub) => (
                      <SelectItem value={sub.id} key={sub.id}>
                        {sub.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}
