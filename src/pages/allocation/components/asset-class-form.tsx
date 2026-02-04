import { AssetClassTarget } from "@/lib/types";
import { Button } from "@wealthfolio/ui";
import { useState } from "react";

interface AssetClassFormProps {
  onSubmit: (data: { assetClass: string; targetPercent: number }) => void;
  onCancel: () => void;
  initialData?: AssetClassTarget;
  availableAssetClasses: string[];
  isLoading?: boolean;
}

export function AssetClassForm({
  onSubmit,
  onCancel,
  initialData,
  availableAssetClasses,
  isLoading = false,
}: AssetClassFormProps) {
  const [assetClass, setAssetClass] = useState(initialData?.assetClass || "");
  const [targetPercent, setTargetPercent] = useState(initialData?.targetPercent?.toString() || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetClass || !targetPercent) return;
    onSubmit({
      assetClass,
      targetPercent: parseFloat(targetPercent),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Asset Class Selector */}
      <div className="space-y-3">
        <label className="text-sm font-semibold">Asset Class</label>
        {availableAssetClasses.length > 0 ? (
          <select
            value={assetClass}
            onChange={(e) => setAssetClass(e.target.value)}
            disabled={!!initialData || isLoading}
            className="border-border bg-background hover:border-border/80 focus:ring-primary/20 w-full rounded-md border px-4 py-3 text-sm font-medium focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            required
          >
            <option value="" disabled>
              {initialData ? "Cannot change asset class" : "Select an asset class"}
            </option>
            {availableAssetClasses.map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>
        ) : (
          <div className="border-muted-foreground/30 bg-muted/20 text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
            No holdings found. Add holdings first to create allocation targets.
          </div>
        )}
      </div>

      {/* Target Percent Input */}
      <div className="space-y-3">
        <label className="text-sm font-semibold">Target Allocation %</label>
        <div className="relative">
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={targetPercent}
            onChange={(e) => setTargetPercent(e.target.value)}
            disabled={isLoading}
            className="border-border bg-background placeholder:text-muted-foreground focus:ring-primary/20 w-full rounded-md border px-4 py-3 text-sm font-medium focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="0"
            required
          />
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm">
            %
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="border-border flex justify-end gap-3 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
          className="min-w-24"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isLoading || availableAssetClasses.length === 0}
          className="min-w-24"
        >
          {isLoading ? "Saving..." : initialData ? "Update Target" : "Create Target"}
        </Button>
      </div>
    </form>
  );
}
