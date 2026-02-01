import { Table } from "@tanstack/react-table";
import { useEffect, useState } from "react";
import { cn } from "../../../lib/utils";
import { Button } from "../button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "../dropdown-menu";
import { Icons } from "../icons";
import type { DataTableFacetedFilterProps } from "./data-table-faceted-filter";
import { DataTableFacetedFilter } from "./data-table-faceted-filter";

interface ColumnMeta {
  label?: string;
}

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  searchBy?: string;
  filters?: DataTableFacetedFilterProps<TData, unknown>[];
  showColumnToggle?: boolean;
  actions?: React.ReactNode;
}

export function DataTableToolbar<TData>({
  table,
  searchBy,
  filters,
  showColumnToggle = false,
  actions,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0 || table.getState().globalFilter;
  const hideableColumns = table.getAllColumns().filter((column) => column.getCanHide());

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        {searchBy && (
          <SearchInput
            placeholder="Search ..."
            value={table.getState().globalFilter ?? ""}
            onChange={(value) => table.setGlobalFilter(value)}
            className="w-[150px] lg:w-[250px]"
          />
        )}
        {filters?.map((filter) => (
          <DataTableFacetedFilter<TData, unknown>
            id={filter.id}
            key={filter.id}
            column={table.getColumn(filter.id)}
            title={filter.title}
            options={filter.options}
          />
        ))}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => {
              table.resetColumnFilters();
              table.resetGlobalFilter();
            }}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <Icons.Close className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {showColumnToggle && hideableColumns.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="bg-secondary/30 hover:bg-muted/80 ml-auto gap-1.5 rounded-md border-[1.5px] border-none px-3 py-1 text-sm font-medium"
              >
                Columns <Icons.ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {hideableColumns.map((column) => {
                const meta = column.columnDef.meta as ColumnMeta | undefined;
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {meta?.label ?? column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

function SearchInput({
  value: initialValue,
  onChange,
  placeholder = "Search ...",
  className,
}: {
  value: string | number;
  onChange: (value: string | number) => void;
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      onChange(value);
    }
  };

  const handleBlur = () => {
    onChange(value);
  };

  const handleClear = () => {
    setValue("");
    onChange("");
  };

  return (
    <div className={cn("relative", className)}>
      <Icons.Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cn(
          "shadow-inner-xs bg-muted/90 hover:bg-muted/80 h-8 w-full rounded-md pr-8 pl-8 text-sm transition-colors outline-none",
          "placeholder:text-muted-foreground",
          "focus:ring-ring/50 focus:ring-2",
        )}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
        >
          <Icons.Close className="h-4 w-4" />
          <span className="sr-only">Clear search</span>
        </button>
      )}
    </div>
  );
}
