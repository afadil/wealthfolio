import { Table, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ImportFormat } from '@/lib/types';
import { useState } from 'react';

interface ColumnMappingProps {
  importFormatFields: ImportFormat[];
  mapping: {
    columns: Record<ImportFormat, string>;
  };
  headers: string[];
  handleMapping: (field: ImportFormat, value: string) => void;
}

export function ColumnMapping({
  importFormatFields,
  mapping,
  headers,
  handleMapping,
}: ColumnMappingProps) {
  const [editingHeader, setEditingHeader] = useState<ImportFormat | null>(null);

  const getMappedHeaderOrDropdown = (field: ImportFormat) => {
    const mappedHeader = mapping.columns[field];
    const isEditing = editingHeader === field;

    const handleHeaderClick = () => {
      setEditingHeader(field);
    };

    if ((mappedHeader && headers.includes(mappedHeader) && !isEditing) || headers.length === 0) {
      return (
        <Button variant="ghost" className="h-8 p-0 font-normal" onClick={handleHeaderClick}>
          <span className="font-thin text-muted-foreground">
            {mappedHeader && field !== mappedHeader ? `(${mappedHeader})` : '\u00A0'}
          </span>
        </Button>
      );
    }

    return (
      <Select
        onValueChange={(val) => {
          handleMapping(field, val);
          setEditingHeader(null);
        }}
        value={mappedHeader || ''}
        onOpenChange={(open) => {
          if (!open) {
            setEditingHeader(null);
          }
        }}
      >
        <SelectTrigger className="h-8 w-full px-3 py-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {headers.map((header) => (
            <SelectItem key={header || '-'} value={header || '-'}>
              {header || '-'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {importFormatFields.map((field) => (
              <TableHead key={field}>
                <div className="font-bold">{field}</div>
                {getMappedHeaderOrDropdown(field)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
      </Table>
    </div>
  );
}
