import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { AssetClassTarget } from "@/lib/types";
import { Button } from "@wealthfolio/ui";
import { Check } from "lucide-react";
import { useState } from "react";

interface AssetClassFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { assetClass: string; targetPercent: number }) => void;
  existingTargets: AssetClassTarget[];
  editingTarget: AssetClassTarget | null;
  isLoading: boolean;
  availableAssetClasses: string[];
}

export function AssetClassFormDialog({
  open,
  onOpenChange,
  onSubmit,
  existingTargets,
  editingTarget,
  isLoading,
  availableAssetClasses,
}: AssetClassFormDialogProps) {
  const [selectedClass, setSelectedClass] = useState(editingTarget?.assetClass || "");
  const [targetPercent, setTargetPercent] = useState(editingTarget?.targetPercent || 0);
  const [classPopoverOpen, setClassPopoverOpen] = useState(false);

  // Calculate total and remaining
  const currentTotal = existingTargets.reduce((sum, t) => sum + t.targetPercent, 0);
  const editingAmount = editingTarget?.targetPercent || 0;
  const totalIfSaved = currentTotal - editingAmount + targetPercent;
  const remaining = Math.max(0, 100 - totalIfSaved);
  const isOverAllocated = totalIfSaved > 100;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass || targetPercent < 0) return;
    onSubmit({
      assetClass: selectedClass,
      targetPercent,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editingTarget
              ? `Edit ${editingTarget.assetClass} Target`
              : "Create Allocation Target"}
          </DialogTitle>
          <DialogDescription>
            {editingTarget
              ? `Adjust the allocation target for ${editingTarget.assetClass}`
              : "Define your strategic asset allocation"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          {/* Asset Class Selector - Popover + Command (Matches AccountSelector) */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-foreground">Asset Class</label>
            {availableAssetClasses.length > 0 ? (
              <Popover open={classPopoverOpen} onOpenChange={setClassPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={classPopoverOpen}
                    className="w-full justify-between"
                    disabled={!!editingTarget || isLoading}
                  >
                    {selectedClass || "Select an asset class"}
                    <span className="ml-2 opacity-50">↓</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search asset classes..." />
                    <CommandList>
                      <CommandEmpty>No asset class found.</CommandEmpty>
                      <CommandGroup>
                        {availableAssetClasses.map((cls) => (
                          <CommandItem
                            key={cls}
                            value={cls}
                            onSelect={(currentValue) => {
                              setSelectedClass(
                                currentValue === selectedClass ? "" : currentValue
                              );
                              setClassPopoverOpen(false);
                            }}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                selectedClass === cls ? "opacity-100" : "opacity-0"
                              }`}
                            />
                            {cls}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 p-3 text-center text-xs text-muted-foreground">
                No holdings found. Add holdings first to create allocation targets.
              </div>
            )}
          </div>

          {/* Target Percent with Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground">Target Allocation %</label>
              <span className="text-sm font-semibold tabular-nums text-foreground">{targetPercent.toFixed(1)}%</span>
            </div>

            {/* Slider */}
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={targetPercent}
              onChange={(e) => setTargetPercent(parseFloat(e.target.value))}
              disabled={isLoading || availableAssetClasses.length === 0}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50"
            />

            {/* Numeric Input */}
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={targetPercent}
              onChange={(e) => setTargetPercent(parseFloat(e.target.value) || 0)}
              disabled={isLoading}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
            />

            {/* Total & Remaining - Bottom Right */}
            <div className="flex justify-end gap-6 pt-3 text-xs">
              <div className="text-muted-foreground">
                <span>Total: </span>
                <span className={`font-semibold tabular-nums ${isOverAllocated ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
                  {totalIfSaved.toFixed(1)}%
                </span>
              </div>
              <div className={isOverAllocated ? 'text-red-600 dark:text-red-400' : remaining > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-foreground'}>
                <span className="text-muted-foreground">Remaining: </span>
                <span className="font-semibold tabular-nums">{remaining.toFixed(1)}%</span>
              </div>
            </div>

            {isOverAllocated && (
              <p className="text-xs text-red-600 dark:text-red-400 font-medium pt-2">
                Over-allocated by {(totalIfSaved - 100).toFixed(1)}%. Please reduce.
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="min-w-24"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || availableAssetClasses.length === 0 || isOverAllocated || !selectedClass}
              className="min-w-24"
            >
              {isLoading ? "Saving..." : editingTarget ? "Update Target" : "Create Target"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
