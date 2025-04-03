import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  ImportFormat,
  ActivityType,
  ImportMappingData,
  CsvRowData,
  ImportRequiredField,
} from '@/lib/types';
import { renderHeaderCell, renderCell } from './mapping-table-cells';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { IMPORT_REQUIRED_FIELDS } from '@/lib/constants';

interface MappingTableProps {
  mapping: ImportMappingData;
  headers: string[];
  data: CsvRowData[];
  handleColumnMapping: (field: ImportFormat, value: string) => void;
  handleActivityTypeMapping: (csvActivity: string, activityType: ActivityType) => void;
  handleSymbolMapping: (csvSymbol: string, newSymbol: string) => void;
  getMappedValue: (row: CsvRowData, field: ImportFormat) => string;
  invalidSymbols: string[];
  className?: string;
}

const importFormatFields = Object.values(ImportFormat);

export function MappingTable({
  mapping,
  headers,
  data,
  handleColumnMapping,
  handleActivityTypeMapping,
  handleSymbolMapping,
  getMappedValue,
  invalidSymbols,
  className,
}: MappingTableProps) {
  // Check if a field is mapped
  const isFieldMapped = (field: ImportFormat) => {
    const mappedHeader = mapping.fieldMappings[field];
    return typeof mappedHeader === 'string' && headers.includes(mappedHeader);
  };

  return (
    <div className={cn("h-full w-full overflow-auto rounded-md border border-border bg-card shadow-sm", className)}>
      <div className="min-w-fit">
        <TooltipProvider>
          <Table>
            <TableHeader className="sticky top-0 z-20">
              <TableRow>
                <TableHead className="sticky left-0 z-30 w-12 min-w-[3rem] border-r border-border">
                  <div className="flex items-center justify-center rounded-sm bg-muted/50 p-1">
                    <span className="text-xs font-semibold text-muted-foreground">#</span>
                  </div>
                </TableHead>
                {importFormatFields.map((field) => (
                  <TableHead 
                    key={field} 
                    className={cn(
                      "p-2 whitespace-nowrap transition-colors",
                      IMPORT_REQUIRED_FIELDS.includes(field as ImportRequiredField) 
                        ? !isFieldMapped(field) ? "bg-amber-50 dark:bg-amber-950/20" : ""
                        : ""
                    )}
                  >
                    {renderHeaderCell({
                      field,
                      mapping,
                      headers,
                      handleColumnMapping,
                    })}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, index) => {
                return (
                  <motion.tr
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                    key={`row-${row.lineNumber}`}
                    className={cn(
                      "group transition-colors hover:bg-muted/50",
                      index % 2 === 0 ? "bg-background" : "bg-muted/20"
                    )}
                  >
                    <TableCell className="sticky left-0 z-20 w-12 border-r border-border bg-muted/30 font-mono text-xs font-medium text-muted-foreground">
                      {row.lineNumber}
                    </TableCell>
                    {importFormatFields.map((field) => { 
                      return (
                        <TableCell 
                          key={field} 
                          className={cn(
                            "p-2 transition-colors text-xs",
                            "group-hover:bg-muted/50"
                          )}
                        >
                          {renderCell({
                            field,
                            row,
                            mapping,
                            getMappedValue,
                            handleActivityTypeMapping,
                            handleSymbolMapping,
                            invalidSymbols,
                          })}
                        </TableCell>
                      );
                    })}
                  </motion.tr>
                );
              })}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>
    </div>
  );
}
