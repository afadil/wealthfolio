import { Alert, AlertDescription } from "@/components/ui/alert";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { AssetClassTarget } from "@/lib/types";
import { Button } from "@wealthfolio/ui";
import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";

interface AssetClassFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (target: Omit<AssetClassTarget, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  existingTargets?: AssetClassTarget[];
  editingTarget?: AssetClassTarget | null;
  isLoading?: boolean;
  strategyId?: string;
}

const ASSET_CLASSES = [
  "Equities",
  "Bonds",
  "Cash",
  "Real Estate",
  "Commodities",
  "Other",
];

export function AssetClassForm({
  open,
  onOpenChange,
  onSubmit,
  existingTargets = [],
  editingTarget = null,
  isLoading = false,
  strategyId = "",
}: AssetClassFormProps) {
  const [assetClass, setAssetClass] = useState<string>("");
  const [targetPercent, setTargetPercent] = useState<number>(10);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (editingTarget) {
        setAssetClass(editingTarget.assetClass);
        setTargetPercent(editingTarget.targetPercent);
      } else {
        setAssetClass("");
        setTargetPercent(10);
      }
      setError(null);
    }
  }, [open, editingTarget]);

  const handleSubmit = async () => {
    // Validation: asset class required
    if (!assetClass) {
      setError("Please select an asset class.");
      return;
    }

    // Validation: check for duplicates (exclude current if editing)
    const isDuplicate = existingTargets.some(
      (t) =>
        t.assetClass === assetClass &&
        (!editingTarget || t.id !== editingTarget.id)
    );

    if (isDuplicate) {
      setError(
        `${assetClass} already has a target. Edit the existing one instead.`
      );
      return;
    }

    // Validation: calculate total with this target
    const otherTargets = existingTargets.filter(
      (t) => !editingTarget || t.id !== editingTarget.id
    );
    const totalWithNew =
      otherTargets.reduce((sum, t) => sum + t.targetPercent, 0) + targetPercent;

    if (totalWithNew > 100) {
      setError(
        `Total allocation would be ${totalWithNew}%. Maximum is 100%. Reduce target by ${(totalWithNew - 100).toFixed(1)}%.`
      );
      return;
    }

    try {
      await onSubmit({
        strategyId: strategyId || editingTarget?.strategyId || "",
        assetClass,
        targetPercent,
      });
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save allocation target."
      );
    }
  };

  const totalOtherTargets = existingTargets
    .filter((t) => !editingTarget || t.id !== editingTarget.id)
    .reduce((sum, t) => sum + t.targetPercent, 0);

  const remainingPercent = 100 - totalOtherTargets;
  const isOverBudget = targetPercent > remainingPercent;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {editingTarget ? "Edit Allocation Target" : "Create Allocation Target"}
          </DialogTitle>
          <DialogDescription>
            {editingTarget
              ? "Update the target allocation percentage for this asset class."
              : "Set a target allocation percentage for an asset class."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Asset Class Select */}
          <div className="space-y-2">
            <Label htmlFor="asset-class">Asset Class</Label>
            <Select
              value={assetClass}
              onValueChange={setAssetClass}
              disabled={isLoading || !!editingTarget}
            >
              <SelectTrigger id="asset-class">
                <SelectValue placeholder="Select an asset class" />
              </SelectTrigger>
              <SelectContent>
                {ASSET_CLASSES.map((cls) => (
                  <SelectItem key={cls} value={cls}>
                    {cls}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {editingTarget
                ? "Cannot change asset class during edit"
                : "Choose the asset class for this allocation target"}
            </p>
          </div>

          {/* Target Percent: Slider + Number Input */}
          <div className="space-y-2">
            <Label htmlFor="target-percent">Target Allocation (%)</Label>

            {/* Slider */}
            <input
              id="target-percent-slider"
              type="range"
              min={1}
              max={remainingPercent}
              step={0.1}
              value={Math.min(targetPercent, remainingPercent)}
              onChange={(e) => setTargetPercent(parseFloat(e.currentTarget.value))}
              disabled={isLoading}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />

            {/* Number Input + Display */}
            <div className="flex items-center gap-2">
              <Input
                id="target-percent"
                type="number"
                min={1}
                max={remainingPercent}
                step={0.1}
                value={targetPercent || ""}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  if (value === "" || value === "-") {
                    setTargetPercent(0);
                  } else {
                    const parsed = parseFloat(value);
                    if (!isNaN(parsed) && parsed >= 0) {
                      setTargetPercent(parsed);
                    }
                  }
                }}
                disabled={isLoading}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">%</span>
              <span className="text-xs text-muted-foreground ml-auto">
                Remaining: {Math.max(0, remainingPercent - targetPercent).toFixed(1)}%
              </span>
            </div>

            {/* Budget Warning */}
            {isOverBudget && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Exceeds budget. Max available: {remainingPercent.toFixed(1)}%
                </AlertDescription>
              </Alert>
            )}

            {/* Allocation Summary */}
            <div className="text-xs text-muted-foreground space-y-1 bg-muted/50 p-3 rounded">
              <p>Other targets: {totalOtherTargets.toFixed(1)}%</p>
              <p>This target: {targetPercent.toFixed(1)}%</p>
              <p className="font-semibold text-foreground">
                Total: {(totalOtherTargets + targetPercent).toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !assetClass || isOverBudget}
          >
            {isLoading
              ? "Saving..."
              : editingTarget
                ? "Update Target"
                : "Create Target"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
