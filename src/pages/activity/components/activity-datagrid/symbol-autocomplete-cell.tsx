"use client";

import type React from "react";

import { searchTicker } from "@/commands/market-data";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DataSource } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import type { QuoteSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Icons } from "@wealthfolio/ui";
import { Check } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

interface SymbolAutocompleteCellProps {
  value: string;
  onChange: (value: string, meta?: { dataSource?: DataSource }) => void;
  onFocus?: () => void;
  onNavigate?: (direction: "up" | "down" | "left" | "right") => void;
  isFocused?: boolean;
  className?: string;
  disabled?: boolean;
}

export function SymbolAutocompleteCell({
  value,
  onChange,
  onFocus,
  onNavigate,
  isFocused = false,
  className,
  disabled = false,
}: SymbolAutocompleteCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const cellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(searchQuery);
  const resolveDataSource = (source?: QuoteSummary["dataSource"]) =>
    source === DataSource.MANUAL ? DataSource.MANUAL : DataSource.YAHOO;

  const { data, isLoading, isError } = useQuery<QuoteSummary[], Error>({
    queryKey: [QueryKeys.symbolSearch, deferredQuery],
    queryFn: () => searchTicker(deferredQuery),
    enabled: isEditing && deferredQuery.trim().length > 1,
    staleTime: 60000,
    gcTime: 300000,
  });

  const options = useMemo(() => {
    if (!data?.length) return [];
    return [...data].sort((a, b) => b.score - a.score);
  }, [data]);

  useEffect(() => {
    if (isFocused && !isEditing && cellRef.current) {
      cellRef.current.focus();
    }
  }, [disabled, isFocused, isEditing]);

  useEffect(() => {
    if (disabled) return;
    if (isEditing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [disabled, isEditing]);

  const handleSelectWithDataSource = (symbol: string, dataSource?: DataSource) => {
    const normalized = symbol.trim().toUpperCase();
    onChange(normalized, { dataSource });
    setIsEditing(false);
    setSearchQuery("");
  };

  const trimmedQuery = searchQuery.trim();

  const handleCustomSymbol = () => {
    if (!trimmedQuery) return;
    handleSelectWithDataSource(trimmedQuery, DataSource.MANUAL);
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

    if (!isEditing) {
      if (e.key === "Enter" || e.key === " " || e.key === "F2") {
        e.preventDefault();
        setSearchQuery(value);
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
        setSearchQuery(e.key);
        setIsEditing(true);
      }
    }
  };

  const handleCellFocus = () => {
    onFocus?.();
  };

  const handleClick = () => {
    onFocus?.();
    setSearchQuery(value);
    setIsEditing(true);
  };

  const handleOpenChange = (open: boolean) => {
    setIsEditing(open);
    if (!open) {
      setSearchQuery("");
    }
  };

  const displayName = (option: QuoteSummary) => {
    return option.longName || option.shortName || option.symbol;
  };

  if (disabled) {
    return (
      <div
        ref={cellRef}
        tabIndex={0}
        onFocus={handleCellFocus}
        onKeyDown={handleKeyDown}
        className={cn(
          "text-muted-foreground flex h-full w-full cursor-not-allowed items-center px-2 py-1.5 text-xs outline-none",
          isFocused && "ring-primary ring-2 ring-inset",
          className,
        )}
      >
        {value || "TICKER"}
      </div>
    );
  }

  return (
    <Popover open={isEditing} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <div
          ref={cellRef}
          tabIndex={0}
          onClick={handleClick}
          onFocus={handleCellFocus}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex h-full w-full cursor-cell items-center px-2 py-1.5 text-xs transition-colors outline-none",
            isFocused && "ring-primary ring-2 ring-inset",
            !value && "text-muted-foreground",
            className,
          )}
        >
          {value || "TICKER"}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 text-xs" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            ref={inputRef}
            placeholder="Search symbol or company..."
            value={searchQuery}
            onValueChange={setSearchQuery}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setIsEditing(false);
                setSearchQuery("");
              } else if (e.key === "Tab") {
                e.preventDefault();
                setIsEditing(false);
                onNavigate?.(e.shiftKey ? "left" : "right");
              } else if (e.key === "Enter" && trimmedQuery && options.length === 0) {
                e.preventDefault();
                handleCustomSymbol();
              }
            }}
          />
          <CommandList>
            {isLoading ? <CommandEmpty>Loading...</CommandEmpty> : null}
            {!isLoading && (isError || options.length === 0) && trimmedQuery.length > 1 ? (
              <CommandGroup>
                <CommandItem
                  value={trimmedQuery}
                  onSelect={handleCustomSymbol}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Icons.PlusCircle className="text-muted-foreground h-4 w-4" />
                    <div className="flex flex-col">
                      <span className="font-mono text-xs font-semibold uppercase">
                        {trimmedQuery.toUpperCase()}
                      </span>
                      <span className="text-muted-foreground text-xs font-light">
                        Create custom (manual)
                      </span>
                    </div>
                  </div>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {!isLoading && !isError && options.length > 0 ? (
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.symbol}
                    value={option.symbol}
                    onSelect={() =>
                      handleSelectWithDataSource(
                        option.symbol,
                        resolveDataSource(option.dataSource),
                      )
                    }
                    className="flex items-center justify-between"
                  >
                    <div className="flex flex-col">
                      <span className="font-mono text-xs font-semibold uppercase">
                        {option.symbol}
                      </span>
                      <span className="text-muted-foreground text-xs">{displayName(option)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">{option.exchange}</span>
                      {value === option.symbol && <Check className="h-4 w-4" />}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
