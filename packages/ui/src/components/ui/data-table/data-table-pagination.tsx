import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { Table } from '@tanstack/react-table';
import { Icons } from '@/components/ui/icons';
import { useState, KeyboardEvent } from 'react';

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
}

export function DataTablePagination<TData>({ table }: DataTablePaginationProps<TData>) {
  const [pageInput, setPageInput] = useState<string>('');

  const totalRows = table.getFilteredRowModel().rows.length;
  const currentPage = table.getState().pagination.pageIndex + 1;
  const totalPages = table.getPageCount();
  const pageSize = table.getState().pagination.pageSize;
  const startRow = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRow = Math.min(currentPage * pageSize, totalRows);

  const handleJumpToPage = (inputValue: string) => {
    const page = parseInt(inputValue);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      table.setPageIndex(page - 1);
      setPageInput(''); // Only clear after successful navigation
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleJumpToPage(pageInput);
    } else if (e.key === 'Escape') {
      setPageInput('');
    }
  };

  const handleBlur = () => {
    if (pageInput) {
      handleJumpToPage(pageInput);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-2 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground">
        <p className="flex items-center gap-1">
          {totalRows === 0 ? (
            <span>No results</span>
          ) : (
            <>
              Showing
              <span className="font-medium text-foreground">{startRow}</span>
              to
              <span className="font-medium text-foreground">{endRow}</span>
              of
              <span className="font-medium text-foreground">{totalRows}</span>
              results
            </>
          )}
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6 lg:gap-8">
        {/* Rows per page selector */}
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger className="h-8 w-sidebar-collapsed transition-colors">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50, 100].map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Jump to page input */}
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={totalPages}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={`${currentPage}`}
            className="h-8 w-[60px]"
            title={`Enter a page number between 1 and ${totalPages}`}
          />
          <span className="text-sm text-muted-foreground">
            of {totalPages}
          </span>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 transition-colors hover:bg-muted"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            title="Go to first page"
          >
            <span className="sr-only">Go to first page</span>
            <Icons.ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 transition-colors hover:bg-muted"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            title="Previous page"
          >
            <span className="sr-only">Go to previous page</span>
            <Icons.ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 transition-colors hover:bg-muted"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            title="Next page"
          >
            <span className="sr-only">Go to next page</span>
            <Icons.ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 transition-colors hover:bg-muted"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            title="Go to last page"
          >
            <span className="sr-only">Go to last page</span>
            <Icons.ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
