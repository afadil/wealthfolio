import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ImportFormat, ActivityType, ImportMappingData } from '@/lib/types';
import { renderHeaderCell, renderCell } from './import-mapping-table-cells';

interface ImportMappingPreviewTableProps {
  importFormatFields: ImportFormat[];
  mapping: ImportMappingData;
  headers: string[];
  csvData: string[][];
  rowsToShow: number[];
  handleColumnMapping: (field: ImportFormat, value: string) => void;
  handleActivityTypeMapping: (csvActivity: string, activityType: ActivityType) => void;
  handleSymbolMapping: (csvSymbol: string, newSymbol: string) => void;
  getMappedValue: (row: string[], field: ImportFormat) => string;
  invalidSymbols: string[];
}

export function ImportMappingPreviewTable({
  importFormatFields,
  mapping,
  headers,
  csvData,
  rowsToShow,
  handleColumnMapping,
  handleActivityTypeMapping,
  handleSymbolMapping,
  getMappedValue,
  invalidSymbols,
}: ImportMappingPreviewTableProps) {
  return (
    <div className="h-full w-full overflow-auto">
      <div className="inline-block min-w-full">
        <Table>
          <TableHeader className="sticky top-0 z-20 bg-background">
            <TableRow>
              <TableHead className="sticky left-0 z-30 w-[50px] min-w-[50px] border-r border-border bg-background">
                #
              </TableHead>
              {importFormatFields.map((field) => (
                <TableHead key={field} className="min-w-16 whitespace-nowrap">
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
            {rowsToShow.map((rowNum) => {
              const row = csvData[rowNum - 1];
              return (
                <TableRow key={`row-${rowNum}`}>
                  <TableCell className="sticky left-0 z-20 w-[50px] border-r bg-background">
                    {rowNum}
                  </TableCell>
                  {importFormatFields.map((field) => (
                    <TableCell key={field} className="min-w-[50px]">
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
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
