import * as React from "react";
import { Badge } from "./badge";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Separator } from "./separator";
import { Icons } from "./icons";
import { cn } from "../../lib/utils";

export interface FacetedFilterProps {
  title?: string;
  options: {
    label: string;
    value: string;
    count?: number;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
  selectedValues: Set<string>;
  onFilterChange: (values: Set<string>) => void;
  /** Shown when the command search has no matches (e.g. translated). */
  emptyMessage?: string;
  /** Label for the clear action at the bottom of the popover. */
  clearFiltersLabel?: string;
  /** When more than 2 values are selected, badge text (pass i18n from the app). */
  manySelectedLabel?: (count: number) => string;
}

export function FacetedFilter({
  title,
  options,
  selectedValues,
  onFilterChange,
  emptyMessage = "No results found.",
  clearFiltersLabel = "Clear filters",
  manySelectedLabel,
}: FacetedFilterProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "hover:bg-muted/80 bg-secondary/30 h-8 gap-1.5 rounded-md border-[1.5px] border-none px-3 py-1 text-sm font-medium",
            selectedValues?.size > 0 ? "bg-muted/40" : "shadow-inner-xs bg-muted/90",
          )}
        >
          <Icons.PlusCircle className="mr-2 h-4 w-4" />
          {title}
          {selectedValues?.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
                {selectedValues.size}
              </Badge>
              <div className="hidden space-x-1 lg:flex">
                {selectedValues.size > 2 ? (
                  <Badge variant="secondary" className="text-foreground rounded-sm px-1 font-normal">
                    {manySelectedLabel
                      ? manySelectedLabel(selectedValues.size)
                      : `${selectedValues.size} selected`}
                  </Badge>
                ) : (
                  options
                    .filter((option) => selectedValues.has(option.value))
                    .map((option) => (
                      <Badge
                        variant="secondary"
                        key={option.value}
                        className="text-foreground rounded-sm px-1 font-normal"
                      >
                        {option.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      const newSelectedValues = new Set(selectedValues);
                      if (isSelected) {
                        newSelectedValues.delete(option.value);
                      } else {
                        newSelectedValues.add(option.value);
                      }
                      onFilterChange(newSelectedValues);
                      // cmdk closes the popover on select; reopen so multi-select filters stay usable
                      queueMicrotask(() => setOpen(true));
                    }}
                  >
                    <div
                      className={cn(
                        "border-primary mr-2 flex h-4 w-4 items-center justify-center rounded-sm border",
                        isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <Icons.Check className={cn("h-4 w-4")} />
                    </div>
                    {option.icon && <option.icon className="text-muted-foreground mr-2 h-4 w-4" />}
                    <span>{option.label}</span>
                    {option.count !== undefined && (
                      <span className="text-muted-foreground ml-auto text-xs">{option.count}</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      onFilterChange(new Set());
                      queueMicrotask(() => setOpen(false));
                    }}
                    className="text-destructive hover:bg-destructive/10 justify-center text-center text-sm"
                  >
                    {clearFiltersLabel}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
