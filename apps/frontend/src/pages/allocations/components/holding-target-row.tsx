import { useEffect, useRef, useState, useCallback } from "react";
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
  typeBadge?: string;
  onEditChange: (symbol: string, value: number) => void;
  onToggleLock: (symbol: string) => void;
  onDelete: (symbol: string) => void;
  onNavigate: (holdingId: string) => void;
  getCascadedPercent: (holdingPercent: number) => number;
  hoveredId?: string | null;
  onHover?: (id: string | null) => void;
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
  typeBadge,
  onEditChange,
  onToggleLock,
  onDelete,
  onNavigate,
  getCascadedPercent,
  hoveredId,
  onHover,
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

  const rowRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isMouseDirectRef = useRef(false);
  const isOtherHovered = hoveredId !== null && hoveredId !== undefined && hoveredId !== holding.id;
  const isThisHovered = hoveredId === holding.id;

  const smoothScrollTo = useCallback((container: HTMLElement, targetTop: number) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const startTop = container.scrollTop;
    const distance = targetTop - startTop;
    if (Math.abs(distance) < 1) return;
    const duration = Math.min(600, 150 + Math.abs(distance) * 0.8);
    const startTime = performance.now();

    function step(time: number) {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quint — slow deceleration for large distances
      const ease = 1 - Math.pow(1 - progress, 5);
      container.scrollTop = startTop + distance * ease;
      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        animFrameRef.current = null;
      }
    }
    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    if (!isThisHovered || isMouseDirectRef.current) return;
    scrollTimerRef.current = setTimeout(() => {
      const el = rowRef.current;
      if (!el) return;
      let container: HTMLElement | null = el.parentElement as HTMLElement;
      while (
        container &&
        getComputedStyle(container).overflowY !== "auto" &&
        getComputedStyle(container).overflowY !== "scroll"
      ) {
        container = container.parentElement as HTMLElement;
      }
      if (!container) return;
      const elRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const elAbsoluteTop = elRect.top - containerRect.top + container.scrollTop;
      const target = elAbsoluteTop - container.clientHeight * 0.3;
      if (target < 100) {
        if (container.scrollTop > 10) smoothScrollTo(container, 0);
      } else if (Math.abs(target - container.scrollTop) > 50) {
        smoothScrollTo(container, target);
      }
    }, 180);
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [isThisHovered, smoothScrollTo]);

  return (
    <div
      ref={rowRef}
      className={`space-y-2 rounded px-2 py-2 transition-all ${isOtherHovered ? "opacity-40" : "opacity-100"} ${isThisHovered ? "bg-black/[.03] dark:bg-white/[.03]" : ""}`}
      onMouseEnter={() => {
        isMouseDirectRef.current = true;
        onHover?.(holding.id);
      }}
      onMouseLeave={() => {
        isMouseDirectRef.current = false;
        onHover?.(null);
      }}
    >
      {/* Holding name + value + actions */}
      <div className="flex min-w-0 items-center justify-between">
        <button
          onClick={() => onNavigate(holding.id)}
          className="hover:text-primary flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-sm font-medium transition-colors"
        >
          <span className="min-w-0 flex-1 truncate">{holding.name || holding.symbol}</span>
          <span className="w-32 shrink-0 text-left">
            {typeBadge && (
              <span className="text-muted-foreground bg-muted rounded px-2 py-0.5 text-xs capitalize">
                {typeBadge}
              </span>
            )}
          </span>
          <span className="text-muted-foreground shrink-0 text-xs font-normal">
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

      {/* Current, Target, and Drift */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            Current{" "}
            {Math.abs(currentPercent) > 100 || currentPercent < 0
              ? `${holding.marketValue.toFixed(2)} ${baseCurrency}`
              : `${currentPercent.toFixed(1)}%`}
          </span>
          {targetPercent > 0 && !isAutoDistributed && (
            <span
              className={`rounded border px-1 py-0.5 text-xs font-medium tabular-nums ${
                Math.abs(currentPercent - targetPercent) < 1
                  ? "border-green-200 bg-green-50 text-green-600 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400"
                  : Math.abs(currentPercent - targetPercent) < 5
                    ? "border-yellow-200 bg-yellow-50 text-yellow-600 dark:border-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-500"
                    : "border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400"
              }`}
            >
              {Math.abs(currentPercent - targetPercent) < 1
                ? "✓"
                : `${currentPercent - targetPercent > 0 ? "+" : ""}${(currentPercent - targetPercent).toFixed(1)}%`}
            </span>
          )}
        </div>

        {isEditing ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={inputValue}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || /^\d{0,3}(\.\d{0,2})?$/.test(val)) {
                  setInputValue(val);
                }
              }}
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

      {/* Visual progress bar — actual fills, target = notch */}
      <div
        className="relative h-3 flex-1 overflow-hidden rounded"
        style={{ backgroundColor: `${categoryColor}20` }}
      >
        {/* Actual fill */}
        <div
          className="absolute left-0 top-0 h-full transition-all"
          style={{
            width: `${Math.min(currentPercent, 100)}%`,
            backgroundColor: categoryColor,
          }}
        />

        {/* Target notch */}
        <div
          className="bg-foreground absolute top-0 h-full w-0.5"
          style={{
            left: `${Math.min(targetPercent, 100)}%`,
            opacity: isAutoDistributed ? 0.4 : 1,
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
