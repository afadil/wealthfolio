import { useState } from "react";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import type { HoldingSummary } from "@/lib/types";

export interface HoldingTargetRowProps {
  holding: HoldingSummary;
  targetPercent: number;
  isLocked: boolean;
  isAutoDistributed: boolean;
  categoryColor?: string;
  categoryPercent: number;
  baseCurrency: string;
  totalValue: number;
  onEditChange: (symbol: string, value: number) => void;
  onToggleLock: (symbol: string) => void;
  onDelete: (symbol: string) => void;
  onNavigate: (holdingId: string) => void;
  getCascadedPercent: (holdingPercent: number) => number;
}

export function HoldingTargetRow({
  holding,
  targetPercent,
  isLocked,
  isAutoDistributed,
  categoryColor,
  categoryPercent: _categoryPercent,
  baseCurrency,
  totalValue: _totalValue,
  onEditChange,
  onToggleLock,
  onDelete,
  onNavigate,
  getCascadedPercent,
}: HoldingTargetRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(targetPercent.toFixed(1));

  // Use the pre-calculated weightInCategory from backend
  const currentPercent = holding.weightInCategory;

  const handleSave = () => {
    const numValue = parseFloat(inputValue);
    if (isNaN(numValue) || numValue < 0 || numValue > 100) {
      setInputValue(targetPercent.toFixed(1));
      setIsEditing(false);
      return;
    }
    onEditChange(holding.symbol, numValue);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setInputValue(targetPercent.toFixed(1));
      setIsEditing(false);
    }
  };

  return (
    <div className="space-y-2 py-2">
      {/* Holding name + value + actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onNavigate(holding.id)}
          className="hover:text-primary flex flex-1 cursor-pointer items-center gap-2 text-left text-sm font-medium transition-colors"
        >
          <span className="flex-1 truncate">{holding.name || holding.symbol}</span>
          <span className="text-muted-foreground text-xs font-normal">
            {baseCurrency} {holding.marketValue.toFixed(2)}
          </span>
          <Icons.ArrowRight className="text-muted-foreground h-3 w-3" />
        </button>

        <div className="ml-2 flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleLock(holding.symbol)}
            className={`h-6 w-6 rounded p-0 transition-all ${
              isLocked
                ? "bg-secondary text-foreground"
                : "hover:bg-muted opacity-70 hover:opacity-100"
            }`}
            title={isLocked ? "Unlock target" : "Lock target"}
          >
            {isLocked ? <Icons.Lock className="h-3 w-3" /> : <Icons.LockOpen className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(holding.symbol)}
            className="hover:bg-muted h-6 w-6 p-0 opacity-70 hover:opacity-100"
            title="Remove target"
          >
            <Icons.Trash className="text-muted-foreground h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Current and Target */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Current{" "}
          {Math.abs(currentPercent) > 100 || currentPercent < 0
            ? `${holding.marketValue.toFixed(2)} ${baseCurrency}`
            : `${currentPercent.toFixed(1)}%`}
        </span>

        {isEditing ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSave}
              disabled={isLocked}
              className="h-6 w-16 rounded border px-2 text-right text-xs [appearance:textfield] disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              autoFocus
            />
            <span className="text-xs">%</span>
          </div>
        ) : (
          <button
            onClick={() => {
              if (isLocked) return;
              setIsEditing(true);
              setInputValue(targetPercent.toFixed(1));
            }}
            disabled={isLocked}
            className={`font-medium transition-colors ${
              isLocked
                ? "cursor-not-allowed opacity-50"
                : isAutoDistributed
                  ? "text-muted-foreground hover:text-foreground cursor-pointer italic"
                  : "hover:text-primary cursor-pointer"
            }`}
          >
            {isAutoDistributed && "→ "}Target {targetPercent.toFixed(1)}%
          </button>
        )}
      </div>

      {/* Visual progress bar */}
      <div
        className="relative h-3 flex-1 overflow-hidden rounded"
        style={{ backgroundColor: `${categoryColor}20` }}
      >
        {/* Target bar */}
        <div
          className="absolute left-0 top-0 h-full transition-all"
          style={{
            width: `${Math.min(targetPercent, 100)}%`,
            backgroundColor: categoryColor,
            opacity: isAutoDistributed ? 0.4 : 0.6,
          }}
        />

        {/* Current indicator (line) */}
        <div
          className="bg-foreground absolute top-0 h-full w-0.5"
          style={{
            left: `${Math.min(currentPercent, 100)}%`,
          }}
        />
      </div>

      {/* Cascaded percent */}
      <div className="text-muted-foreground text-xs">
        Portfolio: {getCascadedPercent(targetPercent).toFixed(2)}%
      </div>
    </div>
  );
}
