import { Table } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icons } from '@/components/icons';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { DataTableFacetedFilter } from './data-table-faceted-filter';
import type { DataTableFacetedFilterProps } from './data-table-faceted-filter';
import { useEffect, useState } from 'react';

interface ColumnMeta {
  label?: string;
}

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  searchBy?: string;
  filters?: DataTableFacetedFilterProps<TData, any>[];
  showColumnToggle?: boolean;
}

export function DataTableToolbar<TData>({
  table,
  searchBy,
  filters,
  showColumnToggle = false,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0 || table.getState().globalFilter;
  const hideableColumns = table.getAllColumns().filter((column) => column.getCanHide());

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        {searchBy && (
          <SearchInput
            placeholder="Search ..."
            value={table.getState().globalFilter ?? ''}
            onChange={(value) => table.setGlobalFilter(value)}
            className="h-8 w-[150px] lg:w-[250px] shadow-[inset_0_0.5px_0.5px_rgba(0,0,0,0.06)] bg-muted/40 border-border/50"
          />
        )}
        {filters?.map((filter) => (
          <DataTableFacetedFilter<TData, any>
            id={filter.id}
            key={filter.id}
            column={table.getColumn(filter.id!)}
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
      {showColumnToggle && hideableColumns.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto gap-1.5 rounded-md border-[1.5px] border-none bg-secondary/30 px-3 py-1 text-sm font-medium hover:bg-muted/80">
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
  );
}

function SearchInput({
  value: initialValue,
  onChange,
  debounceTime = 800,
  ...props
}: {
  value: string | number;
  onChange: (value: string | number) => void;
  debounceTime?: number;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'>) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleKeyDown = (e: any) => {
    if (e.key === 'Enter') {
      onChange(value); // Invoke onChange with the current value
    }
  };

  const handleBlur = () => {
    onChange(value); // Invoke onChange with the current value
  };

  return (
    <Input
      {...props}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}
