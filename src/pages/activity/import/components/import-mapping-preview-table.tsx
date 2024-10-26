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
    <div className="mb-2 h-full w-full overflow-hidden rounded-md border text-sm">
      <div className="grid h-full" style={{ gridTemplateRows: 'auto 1fr' }}>
        {/* Sticky Header */}
        <div className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-30 w-[50px] min-w-16 border-r bg-background">
                  #
                </TableHead>
                {importFormatFields.map((field) => (
                  <TableHead key={field} className="min-w-16">
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
          </Table>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-auto">
          <Table>
            <TableBody>
              {rowsToShow.map((rowNum) => {
                const row = csvData[rowNum - 1];
                return (
                  <TableRow key={`row-${rowNum}`}>
                    <TableCell className="sticky left-0 z-20 w-[50px] min-w-16 border-r bg-background">
                      {rowNum}
                    </TableCell>
                    {importFormatFields.map((field) => (
                      <TableCell key={field} className="w-[50px] min-w-16">
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
    </div>
  );
}
