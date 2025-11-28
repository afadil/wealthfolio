import { useState } from "react";
import { Button, Icons, Badge, AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@wealthfolio/ui";
import type { Category } from "@/lib/types";

interface CategoryItemProps {
  category: Category;
  children?: Category[];
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
  onAddSubcategory: (parentCategory: Category) => void;
  isSubcategory?: boolean;
}

export function CategoryItem({
  category,
  children,
  onEdit,
  onDelete,
  onAddSubcategory,
  isSubcategory = false,
}: CategoryItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = children && children.length > 0;

  return (
    <div className={isSubcategory ? "ml-6 border-l pl-4" : ""}>
      <div className="flex items-center justify-between py-3">
        <div className="flex items-center gap-3">
          {hasChildren && !isSubcategory && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <Icons.ChevronDown className="h-4 w-4" />
              ) : (
                <Icons.ChevronRight className="h-4 w-4" />
              )}
            </Button>
          )}
          {!hasChildren && !isSubcategory && <div className="w-6" />}
          {category.color && (
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: category.color }}
            />
          )}
          <span className={isSubcategory ? "text-sm" : "font-medium"}>
            {category.name}
          </span>
          {!!category.isIncome && (
            <Badge variant="secondary" className="text-xs">
              Income
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isSubcategory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAddSubcategory(category)}
              title="Add subcategory"
            >
              <Icons.Plus className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(category)}
            title="Edit category"
          >
            <Icons.Pencil className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" title="Delete category">
                <Icons.Trash className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Category</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete &quot;{category.name}&quot;?
                  {hasChildren && (
                    <span className="mt-2 block font-medium text-destructive">
                      This will also delete all subcategories.
                    </span>
                  )}
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(category)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {hasChildren && isExpanded && (
        <div className="space-y-0">
          {children.map((child) => (
            <CategoryItem
              key={child.id}
              category={child}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddSubcategory={onAddSubcategory}
              isSubcategory
            />
          ))}
        </div>
      )}
    </div>
  );
}
