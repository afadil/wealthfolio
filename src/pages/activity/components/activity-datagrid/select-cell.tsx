"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";

interface SelectOption {
  value: string;
  label: string;
  /**
   * Optional alternate text used for filtering/searching the option.
   * Defaults to the rendered label when omitted.
   */
  searchValue?: string;
}

interface SelectCellProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  onFocus?: () => void;
  onNavigate?: (direction: "up" | "down" | "left" | "right") => void;
  isFocused?: boolean;
  renderValue?: (value: string) => React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function SelectCell({
  value,
  options,
  onChange,
  onFocus,
  onNavigate,
  isFocused = false,
  renderValue,
  className,
  disabled = false,
}: SelectCellProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const cellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled) return;
    if (isFocused && !open && cellRef.current) {
      cellRef.current.focus();
    }
  }, [disabled, isFocused, open]);

  const handleSelect = (selectedOption: SelectOption) => {
    onChange(selectedOption.value);
    setOpen(false);
    setSearch("");
    // Return focus to cell after selection
    setTimeout(() => {
      cellRef.current?.focus();
    }, 0);
  };

  const selectedOption = options.find((option) => option.value === value);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (open) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        setSearch("");
        cellRef.current?.focus();
      }
    } else {
      // Navigation when not open
      if (e.key === "Enter" || e.key === " " || e.key === "F2") {
        e.preventDefault();
        setOpen(true);
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
        // Start searching on any character key
        setSearch(e.key);
        setOpen(true);
      }
    }
  };

  const handleClick = () => {
    onFocus?.();
    setOpen(true);
  };

  const handleCellFocus = () => {
    onFocus?.();
  };

  if (disabled) {
    const selectedOption = options.find((option) => option.value === value);
    return (
      <div
        className={cn(
          "flex h-full w-full cursor-not-allowed items-center justify-between gap-2 px-2 py-1.5 text-xs text-muted-foreground",
          className,
        )}
      >
        <span className="flex-1">
          {renderValue ? renderValue(value) : selectedOption?.label ?? value}
        </span>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          ref={cellRef}
          tabIndex={0}
          onClick={handleClick}
          onFocus={handleCellFocus}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex h-full w-full cursor-cell items-center justify-between gap-2 px-2 py-1.5 text-xs transition-colors outline-none",
            isFocused && "ring-primary ring-2 ring-inset",
            !value && !selectedOption && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex-1">
            {renderValue ? renderValue(value) : selectedOption?.label ?? value}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-[200px] p-0 text-xs"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandInput
            placeholder="Search..."
            value={search}
            onValueChange={setSearch}
            autoFocus
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.value} ${option.searchValue ?? option.label ?? option.value}`}
                  onSelect={() => handleSelect(option)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="text-xs">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
