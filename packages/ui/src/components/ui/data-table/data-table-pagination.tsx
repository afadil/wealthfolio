import { Button } from "@/components/ui/button";
import { Icons } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Table } from "@tanstack/react-table";
import { KeyboardEvent, useState } from "react";

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
}

export function DataTablePagination<TData>({ table }: DataTablePaginationProps<TData>) {
  const [pageInput, setPageInput] = useState<string>("");

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
      setPageInput(""); // Only clear after successful navigation
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleJumpToPage(pageInput);
    } else if (e.key === "Escape") {
      setPageInput("");
    }
  };

  const handleBlur = () => {
    if (pageInput) {
      handleJumpToPage(pageInput);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-2 py-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Results count - centered on mobile */}
      <div className="text-muted-foreground text-center text-sm sm:text-left">
        <p className="flex items-center justify-center gap-1 sm:justify-start">
          {totalRows === 0 ? (
            <span>No results</span>
          ) : (
            <>
              <span className="hidden sm:inline">Showing</span>
              <span className="text-foreground font-medium">{startRow}</span>
              <span className="hidden sm:inline">to</span>
              <span className="sm:hidden">-</span>
              <span className="text-foreground font-medium">{endRow}</span>
              <span className="hidden sm:inline">of</span>
              <span className="sm:hidden">/</span>
              <span className="text-foreground font-medium">{totalRows}</span>
              <span className="hidden sm:inline">results</span>
            </>
          )}
        </p>
      </div>

      {/* Controls container - all in one row */}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:flex-nowrap sm:gap-6 lg:gap-8">
        {/* Rows per page selector */}
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">
            <span className="hidden sm:inline">Rows per page</span>
            <span className="sm:hidden">Show</span>
          </p>
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger className="sm:w-sidebar-collapsed h-9 w-[70px] transition-colors sm:h-8">
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
            className="h-9 w-[60px] text-center sm:h-8"
            title={`Enter a page number between 1 and ${totalPages}`}
          />
          <span className="text-muted-foreground text-sm whitespace-nowrap">
            <span className="hidden sm:inline">of</span>
            <span className="sm:hidden">/</span> {totalPages}
          </span>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center gap-1">
          {/* First page - hidden on mobile */}
          <Button
            variant="outline"
            size="icon"
            className="hover:bg-muted hidden h-9 w-9 transition-colors sm:flex sm:h-8 sm:w-8"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            title="Go to first page"
          >
            <span className="sr-only">Go to first page</span>
            <Icons.ChevronsLeft className="h-4 w-4" />
          </Button>
          {/* Previous page */}
          <Button
            variant="outline"
            size="icon"
            className="hover:bg-muted h-9 w-9 transition-colors sm:h-8 sm:w-8"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            title="Previous page"
          >
            <span className="sr-only">Go to previous page</span>
            <Icons.ChevronLeft className="h-4 w-4" />
          </Button>
          {/* Next page */}
          <Button
            variant="outline"
            size="icon"
            className="hover:bg-muted h-9 w-9 transition-colors sm:h-8 sm:w-8"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            title="Next page"
          >
            <span className="sr-only">Go to next page</span>
            <Icons.ChevronRight className="h-4 w-4" />
          </Button>
          {/* Last page - hidden on mobile */}
          <Button
            variant="outline"
            size="icon"
            className="hover:bg-muted hidden h-9 w-9 transition-colors sm:flex sm:h-8 sm:w-8"
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
