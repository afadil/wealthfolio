import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ImportMappingRawTableProps {
  headers: string[];
  csvData: string[][];
}

export function ImportMappingRawTable({ headers, csvData }: ImportMappingRawTableProps) {
  return (
    <div className="h-full overflow-auto">
      <Table className="relative w-full">
        <TableHeader className="border-t">
          <TableRow>
            <TableHead className="sticky left-0 z-20 w-[100px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
              Row
            </TableHead>
            <TableHead className="min-w-[800px]">
              <code className="whitespace-pre-wrap font-mono text-sm">{headers.join(',')}</code>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {csvData.slice(1).map((row, index) => (
            <TableRow key={index}>
              <TableCell className="sticky left-0 z-10 font-medium shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                {index + 2}
              </TableCell>
              <TableCell className="min-w-[800px]">
                <code className="whitespace-pre-wrap font-mono text-sm">{row.join(',')}</code>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
