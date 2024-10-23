import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ImportFormat } from '@/lib/types';

interface DataPreviewProps {
  importFormatFields: ImportFormat[];
  mapping: {
    columns: Record<ImportFormat, string>;
  };
  csvData: string[][];
  getMappedValue: (row: string[], field: ImportFormat) => string;
}

export function DataPreview({
  importFormatFields,
  mapping,
  csvData,
  getMappedValue,
}: DataPreviewProps) {
  console.log('DataPreview', importFormatFields, mapping, csvData, getMappedValue);
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {importFormatFields.map((field) => (
              <TableHead key={field}>
                <div className="font-bold">{field}</div>
                <div className="font-thin text-muted-foreground">{mapping.columns[field]}</div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {csvData.slice(1, 6).map((row, index) => (
            <TableRow key={index}>
              {importFormatFields.map((field) => (
                <TableCell key={field}>{getMappedValue(row, field)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
