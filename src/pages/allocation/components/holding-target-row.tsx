import { Icons } from '@/components/ui/icons';
import type { HoldingTarget } from '@/lib/types';
import { Button, Input } from '@wealthfolio/ui';
import { useState } from 'react';

interface HoldingTargetRowProps {
  holding: {
    id: string;
    symbol?: string;
    displayName: string;
    currentPercent: number; // % of asset class
    currentValue: number;
  };
  target?: HoldingTarget;
  previewPercent?: number; // Auto-calculated preview value
  pendingPercent?: number; // User-entered value not yet saved
  assetClassId: string;
  isLocked: boolean;
  onPendingChange: (percent: number | null) => void;
  onToggleLock?: () => void;
  onDelete: () => void;
  onNavigate?: () => void;
  disabled?: boolean;
}

export function HoldingTargetRow({
  holding,
  target,
  previewPercent,
  pendingPercent,
  assetClassId: _assetClassId,
  isLocked,
  onPendingChange,
  onToggleLock,
  onDelete,
  onNavigate,
  disabled = false,
}: HoldingTargetRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(
    target?.targetPercentOfClass.toString() || ''
  );

  const handleSave = () => {
    const numValue = parseFloat(inputValue);

    if (isNaN(numValue) || numValue < 0 || numValue > 100) {
      // Invalid input - revert
      setInputValue(target?.targetPercentOfClass.toString() || '');
      setIsEditing(false);
      onPendingChange(null);
      return;
    }

    // Set as pending change (will be saved by "Save All")
    onPendingChange(numValue);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setInputValue(target?.targetPercentOfClass.toString() || '');
      setIsEditing(false);
      onPendingChange(null);
    }
  };

  // Determine what to display:
  // 1. If user has pending edit -> show that (bold, user-set)
  // 2. If system has preview value -> show that (grey, italic, auto-calculated)
  // 3. Otherwise show saved target or 0
  const targetPercent = target?.targetPercentOfClass || 0;
  const hasPending = pendingPercent !== undefined;
  const displayPercent = hasPending ? pendingPercent : (previewPercent ?? targetPercent);
  const isPreview = !hasPending && previewPercent !== undefined;

  return (
    <div className="space-y-2">
      {/* Holding Name + Price + Lock + Delete */}
      <div className="flex items-center justify-between">
        {/* Clickable holding name with value */}
        <button
          onClick={onNavigate}
          className="text-sm font-medium hover:text-primary transition-colors cursor-pointer flex items-center gap-2 flex-1 text-left"
          disabled={disabled}
        >
          <span className="flex-1">{holding.displayName}</span>
          <span className="text-xs text-muted-foreground font-normal">
            ${holding.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          {onNavigate && <span className="text-muted-foreground">→</span>}
        </button>

        {/* Lock and Delete buttons */}
        <div className="flex items-center gap-1">
          {/* Lock button - only show for saved targets (not pending edits) */}
          {target && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleLock}
              disabled={disabled}
              className={`h-6 w-6 p-0 rounded transition-all ${
                isLocked
                  ? 'bg-secondary text-gray-700'
                  : 'opacity-70 hover:opacity-100 hover:bg-muted'
              }`}
              title={isLocked ? 'Unlock target' : 'Lock target'}
            >
              {isLocked ? <Icons.Lock className="h-3 w-3" /> : <Icons.LockOpen className="h-3 w-3" />}
            </Button>
          )}

          {/* Delete button - show for saved targets */}
          {target && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={disabled}
              className="h-6 w-6 p-0 opacity-70 hover:opacity-100 hover:bg-muted"
              title="Remove target"
            >
              <Icons.Trash className="h-3 w-3 text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>

      {/* Current and Target with Input */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Current {holding.currentPercent.toFixed(1)}%
        </span>

        {/* Target input or display */}
        {isEditing ? (
          <div className="flex items-center gap-1">
            <Input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              disabled={disabled}
              className="h-6 w-16 text-right text-xs"
              autoFocus
            />
            <span className="text-xs">%</span>
          </div>
        ) : (
          <button
            onClick={() => {
              setIsEditing(true);
              // For preview values, start with the preview value so user can accept/modify it
              setInputValue(displayPercent.toFixed(1));
            }}
            disabled={disabled}
            className={`transition-colors font-medium ${
              isPreview
                ? 'text-muted-foreground italic hover:text-foreground cursor-pointer'
                : 'text-foreground hover:text-primary'
            }`}
          >
            {isPreview && '→ '}Target {displayPercent.toFixed(1)}%
          </button>
        )}
      </div>

      {/* Visual progress bar */}
      <div className="bg-secondary relative h-3 flex-1 overflow-hidden rounded">
        {/* Target bar */}
        <div
          className={`absolute top-0 left-0 h-full transition-all ${
            isPreview ? 'bg-chart-2/50' : 'bg-chart-2'
          }`}
          style={{
            width: `${Math.min(displayPercent, 100)}%`,
          }}
        />

        {/* Current indicator (small line) - color changes based on position */}
        <div
          className={`absolute top-0 h-full w-0.5 transition-colors ${
            holding.currentPercent <= displayPercent
              ? 'bg-background dark:bg-gray-200' // Light color when inside target bar
              : 'bg-chart-2' // Dark grey when outside target bar
          }`}
          style={{
            left: `${Math.min(holding.currentPercent, 100)}%`,
          }}
        />
      </div>
    </div>
  );
}
