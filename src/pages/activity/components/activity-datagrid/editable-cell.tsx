"use client";

import type React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

interface EditableCellProps {
  value: string;
  displayValue?: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onNavigate?: (direction: "up" | "down" | "left" | "right") => void;
  isFocused?: boolean;
  type?: "text" | "number" | "datetime-local";
  step?: string;
  inputMode?: "text" | "decimal" | "numeric";
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function EditableCell({
  value,
  displayValue,
  onChange,
  onFocus,
  onNavigate,
  isFocused = false,
  type = "text",
  step,
  inputMode = "text",
  placeholder,
  className,
  disabled = false,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

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

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    onChange(editValue);
    setIsEditing(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;

    // For numeric inputs, validate the input
    if (type === "number") {
      // Allow empty string, numbers, decimal point, and minus sign
      if (newValue === "" || newValue === "-" || /^-?\d*\.?\d*$/.test(newValue)) {
        setEditValue(newValue);
      }
      // Reject invalid input by not updating state
    } else {
      setEditValue(newValue);
    }
  };

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

    if (isEditing) {
      if (type === "number") {
        const allowedKeys = [
          "Backspace",
          "Delete",
          "Tab",
          "Escape",
          "Enter",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          ".",
          "-",
          "0",
          "1",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
        ];

        // Allow Ctrl/Cmd shortcuts
        if (e.ctrlKey || e.metaKey) {
          return;
        }

        if (!allowedKeys.includes(e.key)) {
          e.preventDefault();
          return;
        }
      }

      if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
        onNavigate?.("down");
      } else if (e.key === "Escape") {
        setEditValue(value);
        setIsEditing(false);
      } else if (e.key === "Tab") {
        e.preventDefault();
        handleSave();
        onNavigate?.(e.shiftKey ? "left" : "right");
      }
    } else {
      // Navigation when not editing
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
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        if (type === "number") {
          if (/^[0-9.-]$/.test(e.key)) {
            setEditValue(e.key);
            setIsEditing(true);
          }
        } else {
          // Start editing on any character key
          setEditValue(e.key);
          setIsEditing(true);
        }
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
      <Input
        ref={inputRef}
        value={editValue}
        onChange={handleInputChange}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        type={type}
        step={step}
        inputMode={inputMode}
        className={cn(
          "h-full w-full rounded-none border-0 px-2 py-1.5 text-xs shadow-none focus-visible:ring-2",
          className,
        )}
      />
    );
  }

  let displayContent = displayValue;
  if (!displayContent) {
    if (type === "datetime-local" && value) {
      displayContent = new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      displayContent = value;
    }
  }

  return (
    <div
      ref={cellRef}
      tabIndex={0}
      onClick={handleClick}
      onFocus={handleCellFocus}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex h-full w-full items-center px-2 py-1.5 text-xs transition-colors outline-none",
        disabled ? "cursor-not-allowed text-muted-foreground" : "cursor-cell",
        isFocused && "ring-primary ring-2 ring-inset",
        !displayContent && "text-muted-foreground",
        className,
      )}
    >
      <span className="truncate">{displayContent || placeholder || ""}</span>
    </div>
  );
}
