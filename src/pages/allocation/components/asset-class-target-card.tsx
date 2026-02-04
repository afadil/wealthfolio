import { DriftGauge } from '@/components/drift-gauge';
import { Button } from '@wealthfolio/ui';
import { Edit2, Trash2 } from 'lucide-react';
import type { AssetClassComposition } from '../hooks/use-current-allocation';

interface AssetClassTargetCardProps {
  composition: AssetClassComposition; // From calculateAssetClassComposition()
  onEdit?: (assetClass: string) => void; // Called when user clicks Edit
  onDelete?: (assetClass: string) => void; // Called when user clicks Delete
  isLoading?: boolean; // Disables buttons during mutation
}

export function AssetClassTargetCard({
  composition,
  onEdit,
  onDelete,
  isLoading = false,
}: AssetClassTargetCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm transition-all hover:shadow-md">
      {/* Header: Asset Class Name + Actions */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">
          {composition.assetClass}
        </h3>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit?.(composition.assetClass)}
            disabled={isLoading}
            title="Edit allocation target"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete?.(composition.assetClass)}
            disabled={isLoading}
            title="Delete allocation target"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Drift Gauge */}
      <DriftGauge
        target={composition.targetPercent}
        actual={composition.actualPercent}
        drift={composition.drift}
        status={composition.status}
      />

      {/* Summary Row: Target vs Actual vs Value */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Target</p>
          <p className="text-base font-semibold text-foreground">
            {composition.targetPercent.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Actual</p>
          <p className="text-base font-semibold text-foreground">
            {composition.actualPercent.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Value</p>
          <p className="text-base font-semibold text-foreground">
            ${(composition.actualValue / 1000).toFixed(1)}k
          </p>
        </div>
      </div>

      {/* Status Badge */}
      <div className="mt-4 flex items-center gap-2">
        <div
          className={`h-2 w-2 rounded-full ${
            composition.status === 'on-target'
              ? 'bg-green-500'
              : composition.status === 'underweight'
              ? 'bg-yellow-500'
              : 'bg-red-500'
          }`}
        />
        <span className="text-xs font-medium text-muted-foreground">
          {composition.status === 'on-target'
            ? 'On Target'
            : composition.status === 'underweight'
            ? 'Underweight'
            : 'Overweight'}
        </span>
      </div>
    </div>
  );
}
