import { useMemo, useState } from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Icons } from '@/components/ui/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table';
import { DataTableToolbar } from '@/components/ui/data-table/data-table-toolbar';
import { DataTablePagination } from '@/components/ui/data-table/data-table-pagination';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { DataTableFacetedFilterProps } from '@/components/ui/data-table/data-table-faceted-filter';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export interface CSVLine {
  id: number; // Line number
  content: string; // Raw line content
  isValid: boolean; // Whether the line has errors
  errors?: string[]; // Error messages
}

interface CSVFileViewerProps {
  data: CSVLine[];
  className?: string;
  maxHeight?: string;
}

export function CSVFileViewer({ 
  data,
  className,
  maxHeight = '400px'
}: CSVFileViewerProps) {
  // Determine initial column filters based on whether lines have errors
  const initialColumnFilters = useMemo<ColumnFiltersState>(() => {
    const hasErrors = data.some(row => !row.isValid);
    return hasErrors ? [{ id: 'isValid', value: ['false'] }] : [];
  }, [data]);

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'id', desc: false }
  ]);
  
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initialColumnFilters);
  
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });

  const filters = [
    {
      id: 'isValid',
      title: 'Status',
      options: [
        { label: 'Error', value: 'false' },
        { label: 'Valid', value: 'true' },
      ],
    }
  ] satisfies DataTableFacetedFilterProps<CSVLine, string>[];

  const columns: ColumnDef<CSVLine>[] = [
    {
      id: 'id',
      accessorKey: 'id',
      header: () => <span className="sr-only">Line Number</span>,
      enableSorting: true,
    },
    {
      id: 'isValid',
      accessorKey: 'isValid',
      header: () => <span className="sr-only">Status</span>,
      cell: ({ row }) => {
        const isValid = row.getValue('isValid') as boolean;
        const errors = row.original.errors || [];
        const lineNumber = row.original.id + 1;

        return isValid ? (
          <div className="flex w-[60px] items-center gap-1 text-xs">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-success/20 text-success">
              <Icons.CheckCircle className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs text-muted-foreground">
              {String(lineNumber).padStart(2, '0')}
            </span>
          </div>
        ) : (
          <TooltipProvider>
            <Tooltip delayDuration={30} >
              <TooltipTrigger asChild>
                <div className="flex w-[60px] cursor-help items-center gap-1 text-xs">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive/20 text-destructive">
                    <Icons.XCircle className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {String(lineNumber).padStart(2, '0')}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                sideOffset={10}
                className="max-w-xs border-none bg-destructive p-3 text-destructive-foreground"
              >
                <h4 className="mb-2 font-medium">Validation Errors</h4>
                <ul className="max-h-[300px] list-disc space-y-1 overflow-y-auto pl-5 text-sm">
                  {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      },
      filterFn: (row, id, filterValue: string[]) => {
        const isValid = row.getValue(id) as boolean;
        const filterBoolean = filterValue[0] === 'true';
        return isValid === filterBoolean;
      },
    },
    {
      id: 'content',
      accessorKey: 'content',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="CSV Content" />
      ),
      cell: ({ row }) => {
        const content = row.getValue('content') as string;
        const isHeader = row.original.id === 0;
        
        return (
          <div className={cn(
            "font-mono text-xs whitespace-nowrap",
            isHeader && "font-semibold"
          )}>
            {content || <span className="italic text-muted-foreground">empty line</span>}
          </div>
        );
      },
    }
  ];

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility: {
        id: false,
      },
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  return (
    <div className={cn('space-y-2', className)}>
      <DataTableToolbar table={table} searchBy="content" filters={filters} />
      
      <div className="overflow-hidden rounded-md border">
        {/* Header bar similar to a code editor */}
        <div className="flex items-center justify-between border-b border-border bg-muted px-3 py-2">
          <span className="text-xs text-muted-foreground">CSV File</span>
          <span className="text-xs text-muted-foreground">
            {data.length > 0 ? `${data.length} lines` : 'Empty file'}
          </span>
        </div>
        
        <div style={{ maxHeight }} className="overflow-auto">
          <Table>
            <TableBody className="text-xs">
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row, index) => (
                  <motion.tr
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                    key={row.id}
                    className={cn(
                      'group border-0',
                      'hover:bg-muted/40',
                      row.getValue('isValid')
                        ? 'bg-transparent'
                        : 'bg-destructive/5 dark:bg-destructive/10',
                      row.original.id === 0 && 'bg-primary/5 font-semibold',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'py-1.5 border-0',
                          cell.column.id === 'isValid' &&
                            'sticky left-0 bg-background border-r border-border p-2 w-[60px] group-hover:bg-muted/40'
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </motion.tr>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2 py-8">
                      <Icons.FileText className="h-10 w-10 text-muted-foreground opacity-40" />
                      <p className="text-sm text-muted-foreground">No content found</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      
      <DataTablePagination table={table} />
    </div>
  );
}
