import { DriftGauge } from '@/components/drift-gauge';
import { cn } from '@/lib/utils';
import { Card } from '@wealthfolio/ui';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { AssetClassComposition } from '../hooks/use-allocation-calculations';

interface AssetClassTargetCardProps {
  composition: AssetClassComposition;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function AssetClassTargetCard({
  composition,
  onEdit,
  onDelete,
}: AssetClassTargetCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-lg font-semibold hover:text-primary transition-colors"
        >
          <ChevronDown
            className={cn('w-5 h-5 transition-transform', isExpanded && 'rotate-180')}
          />
          {composition.assetClass}
        </button>

        {/* Actions */}
        <div className="flex gap-2">
          {onEdit && (
            <button
              onClick={onEdit}
              className="px-3 py-1 text-xs hover:bg-secondary rounded transition-colors"
              title="Edit allocation"
            >
              ✎
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="px-3 py-1 text-xs hover:bg-secondary rounded transition-colors"
              title="Delete allocation"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Value display */}
      <p className="text-sm text-muted-foreground">
        ${composition.actualValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
      </p>

      {/* Tier 1: Drift Gauge */}
      <DriftGauge
        target={composition.targetPercent}
        actual={composition.actualPercent}
        drift={composition.drift}
        status={composition.status}
      />

      {/* Tier 2: Expandable details (Phase 2) */}
      {isExpanded && (
        <div className="pt-4 border-t space-y-3">
          <p className="text-sm font-medium text-muted-foreground">HOLDINGS BREAKDOWN</p>
          <p className="text-xs text-muted-foreground italic">
            Holdings breakdown coming in Phase 2
          </p>
        </div>
      )}
    </Card>
  );
}
