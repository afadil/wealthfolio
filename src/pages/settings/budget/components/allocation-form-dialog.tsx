import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Category, BudgetAllocationWithCategory } from "@/lib/types";

interface AllocationFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (categoryId: string, amount: number) => void;
  categories: Category[];
  existingAllocations: BudgetAllocationWithCategory[];
  editingAllocation?: BudgetAllocationWithCategory;
  isIncome: boolean;
  isPending?: boolean;
}

export function AllocationFormDialog({
  open,
  onClose,
  onSave,
  categories,
  existingAllocations,
  editingAllocation,
  isIncome,
  isPending,
}: AllocationFormDialogProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  // Filter categories that don't already have allocations (unless editing)
  const availableCategories = categories.filter((cat) => {
    if (editingAllocation && cat.id === editingAllocation.categoryId) {
      return true;
    }
    return !existingAllocations.some((alloc) => alloc.categoryId === cat.id);
  });

  useEffect(() => {
    if (editingAllocation) {
      setSelectedCategoryId(editingAllocation.categoryId);
      setAmount(editingAllocation.amount.toString());
    } else {
      setSelectedCategoryId("");
      setAmount("");
    }
  }, [editingAllocation, open]);

  const handleSave = () => {
    if (selectedCategoryId && amount) {
      const numAmount = parseFloat(amount);
      if (!isNaN(numAmount) && numAmount > 0) {
        onSave(selectedCategoryId, numAmount);
        onClose();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && selectedCategoryId && amount) {
      handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {editingAllocation ? "Edit" : "Add"} {isIncome ? "Income" : "Expense"} Allocation
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={selectedCategoryId}
              onValueChange={setSelectedCategoryId}
              disabled={!!editingAllocation}
            >
              <SelectTrigger id="category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {availableCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="amount">Monthly Amount</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!selectedCategoryId || !amount || isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
