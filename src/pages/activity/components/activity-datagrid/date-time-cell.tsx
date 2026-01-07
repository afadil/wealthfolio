"use client";

import type React from "react";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { DatePickerInput } from "@wealthfolio/ui";
import { formatDateTimeDisplay } from "@/lib/utils";

interface DateTimeCellProps {
  value: Date;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onNavigate?: (direction: "up" | "down" | "left" | "right") => void;
  isFocused?: boolean;
  className?: string;
  disabled?: boolean;
}

export function DateTimeCell({
  value,
  onChange,
  onFocus,
  onNavigate,
  isFocused = false,
  className,
  disabled = false,
}: DateTimeCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled) {
      setIsEditing(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (isFocused && !isEditing && cellRef.current) {
      cellRef.current.focus();
    }
  }, [isFocused, isEditing]);

  const handleDateChange = useCallback(
    (date: Date | undefined) => {
      if (date) {
        onChange(date.toISOString());
      }
    },
    [onChange],
  );

  const handleInteractionEnd = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        onNavigate?.("up");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        onNavigate?.("down");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onNavigate?.("left");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onNavigate?.("right");
      } else if (e.key === "Tab") {
        e.preventDefault();
        onNavigate?.(e.shiftKey ? "left" : "right");
      }
      return;
    }

    if (!isEditing) {
      if (e.key === "Enter" || e.key === " " || e.key === "F2") {
        e.preventDefault();
        setIsEditing(true);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        onNavigate?.("up");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        onNavigate?.("down");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onNavigate?.("left");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onNavigate?.("right");
      } else if (e.key === "Tab") {
        e.preventDefault();
        onNavigate?.(e.shiftKey ? "left" : "right");
      }
    } else {
      if (e.key === "Escape") {
        setIsEditing(false);
      } else if (e.key === "Tab") {
        e.preventDefault();
        setIsEditing(false);
        onNavigate?.(e.shiftKey ? "left" : "right");
      }
    }
  };

  const handleClick = () => {
    if (disabled) {
      onFocus?.();
      return;
    }
    onFocus?.();
    setIsEditing(true);
  };

  const handleCellFocus = () => {
    onFocus?.();
  };

  if (isEditing) {
    return (
      <div className="h-full w-full px-1 py-0.5" onKeyDown={handleKeyDown}>
        <DatePickerInput
          value={value}
          onChange={handleDateChange}
          enableTime
          timeGranularity="minute"
          onInteractionEnd={handleInteractionEnd}
          className="h-full w-full"
        />
      </div>
    );
  }

  const displayContent = formatDateTimeDisplay(value);

  return (
    <div
      ref={cellRef}
      tabIndex={0}
      onClick={handleClick}
      onFocus={handleCellFocus}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex h-full w-full items-center px-2 py-1.5 text-xs transition-colors outline-none",
        disabled ? "text-muted-foreground cursor-not-allowed" : "cursor-cell",
        isFocused && "ring-primary ring-2 ring-inset",
        !displayContent && "text-muted-foreground",
        className,
      )}
    >
      <span className="truncate font-mono">{displayContent || ""}</span>
    </div>
  );
}
