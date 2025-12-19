import { BudgetAllocationWithCategory } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { formatAmount } from "@/lib/utils";

interface AllocationListProps {
  allocations: BudgetAllocationWithCategory[];
  unallocated: number;
  currency: string;
  onEdit: (allocation: BudgetAllocationWithCategory) => void;
  onDelete: (categoryId: string) => void;
  isDeleting?: boolean;
}

export function AllocationList({
  allocations,
  unallocated,
  currency,
  onEdit,
  onDelete,
  isDeleting,
}: AllocationListProps) {
  return (
    <div className="space-y-1">
      {allocations.map((allocation) => (
        <div
          key={allocation.id}
          className="group flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center gap-3">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: allocation.categoryColor || "#888" }}
            />
            <span className="font-medium">{allocation.categoryName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {formatAmount(allocation.amount, currency)}
            </span>
            <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onEdit(allocation)}
              >
                <Icons.Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => onDelete(allocation.categoryId)}
                disabled={isDeleting}
              >
                <Icons.Trash className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}

      {unallocated > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-dashed p-3 text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full border-2 border-current bg-transparent" />
            <div className="flex flex-col">
              <span className="font-medium">Flexible</span>
              <span className="text-xs">Applied to remaining categories</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span>{formatAmount(unallocated, currency)}</span>
            {/* Spacer to align with edit/delete buttons */}
            <div className="w-[72px]" />
          </div>
        </div>
      )}

      {allocations.length === 0 && unallocated === 0 && (
        <div className="py-8 text-center text-muted-foreground">
          <p>No allocations yet. Set a target above to get started.</p>
        </div>
      )}
    </div>
  );
}
