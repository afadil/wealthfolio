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
  const [targetPercent, setTargetPercent] = useState<number>(editingTarget?.targetPercent || 0);
  const [inputValue, setInputValue] = useState<string>(editingTarget?.targetPercent ? editingTarget.targetPercent.toString() : "");
  const [classPopoverOpen, setClassPopoverOpen] = useState(false);

  // Calculate total and remaining using integer arithmetic to avoid floating point issues
  // Convert to hundredths (x100) for integer math, then convert back
  const currentTotalInt = Math.round(existingTargets.reduce((sum, t) => sum + t.targetPercent, 0) * 100);
  const editingAmountInt = Math.round((editingTarget?.targetPercent || 0) * 100);
  const targetPercentInt = Math.round(targetPercent * 100);

  // Calculate actual remaining (before user input) for display
  const actualCurrentInt = currentTotalInt - editingAmountInt;
  const actualRemainingInt = 10000 - actualCurrentInt;
  const actualRemaining = actualRemainingInt / 100;

  // Calculate total if this value is saved
  const totalIfSavedInt = currentTotalInt - editingAmountInt + targetPercentInt;
  const totalIfSaved = totalIfSavedInt / 100;

  // Check for duplicate asset class (only when creating new targets)
  const isDuplicateAssetClass: boolean = !editingTarget && selectedClass ?
    existingTargets.some(t => t.assetClass === selectedClass) :
    false;

  // Allow exactly 100% (no tolerance needed with integer math)
  // Over-allocation is allowed - will be auto-scaled on submit
  const isOverAllocated = totalIfSavedInt > 10000;

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
              <span className="text-sm font-semibold tabular-nums text-foreground">{targetPercent.toFixed(2)}%</span>
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
              type="text"
              inputMode="decimal"
              value={inputValue}
              onChange={(e) => {
                const value = e.target.value;
                // Allow empty string for clearing
                if (value === '') {
                  setInputValue('');
                  setTargetPercent(0);
                  return;
                }
                // Allow only digits and one decimal point, max 2 decimals
                const regex = /^\d{0,3}(\.?\d{0,2})?$/;
                if (regex.test(value)) {
                  setInputValue(value);
                  const numValue = parseFloat(value) || 0;
                  // Clamp to 0-100
                  const clamped = Math.max(0, Math.min(100, numValue));
                  setTargetPercent(clamped);
                }
              }}
              onBlur={() => {
                // Format on blur to ensure valid number
                const numValue = parseFloat(inputValue) || 0;
                const clamped = Math.max(0, Math.min(100, numValue));
                setTargetPercent(clamped);
                setInputValue(clamped === 0 ? '' : clamped.toString());
              }}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
              placeholder="0"
            />

            {/* Total & Remaining - Bottom Right */}
            <div className="flex justify-end gap-6 pt-3 text-xs">
              <div className="text-muted-foreground">
                <span>Remaining to allocate: </span>
                <span className={`font-semibold tabular-nums ${actualRemaining <= 0 ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                  {actualRemaining.toFixed(2)}%
                </span>
              </div>
              <div className={isOverAllocated ? 'text-orange-600 dark:text-orange-400' : totalIfSaved === 100 ? 'text-green-600 dark:text-green-400' : 'text-foreground'}>
                <span className="text-muted-foreground">Would be: </span>
                <span className="font-semibold tabular-nums">{totalIfSaved.toFixed(1)}%</span>
              </div>
            </div>

            {isOverAllocated && (
              <p className="text-xs text-orange-600 dark:text-orange-400 font-medium pt-2">
                Over-allocated by {(totalIfSaved - 100).toFixed(1)}%. Other allocations will auto-scale proportionally.
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
            <div className="flex flex-col gap-2 items-end flex-grow">
              {isDuplicateAssetClass && (
                <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                  This asset class already has a target allocation.
                </p>
              )}
              <Button
                type="submit"
                disabled={isLoading || availableAssetClasses.length === 0 || !selectedClass || isDuplicateAssetClass}
                className="min-w-24"
              >
                {isLoading ? "Saving..." : editingTarget ? "Update Target" : "Create Target"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
