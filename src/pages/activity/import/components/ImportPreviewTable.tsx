import { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ImportFormat, ActivityType } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';

interface ImportPreviewTableProps {
  importFormatFields: ImportFormat[];
  mapping: {
    columns: Partial<Record<ImportFormat, string>>;
    activityTypes: Partial<Record<ActivityType, string>>;
  };
  headers: string[];
  csvData: string[][];
  handleColumnMapping: (field: ImportFormat, value: string) => void;
  handleActivityTypeMapping: (csvActivity: string, activityType: ActivityType) => void;
  getMappedValue: (row: string[], field: ImportFormat) => string;
}

export function ImportPreviewTable({
  importFormatFields,
  mapping,
  headers,
  csvData,
  handleColumnMapping,
  handleActivityTypeMapping,
  getMappedValue,
}: ImportPreviewTableProps) {
  const [editingHeader, setEditingHeader] = useState<ImportFormat | null>(null);
  const [editingActivityType, setEditingActivityType] = useState<string | null>(null);

  const { distinctActivityTypes, activityTypeCounts, totalRows } = useMemo(() => {
    const activityTypes = new Map<string, string[]>();
    const counts: Record<string, number> = {};
    let total = 0;

    csvData.slice(1).forEach((row, index) => {
      const activityType = getMappedValue(row, ImportFormat.ActivityType);
      if (!activityTypes.has(activityType)) {
        activityTypes.set(activityType, [...row, (index + 2).toString()]); // Add line number
      }
      counts[activityType] = (counts[activityType] || 0) + 1;
      total++;
    });

    return {
      distinctActivityTypes: Array.from(activityTypes.values()),
      activityTypeCounts: counts,
      totalRows: total,
    };
  }, [csvData, getMappedValue]);

  const renderHeaderCell = (field: ImportFormat) => {
    const mappedHeader = mapping.columns[field];
    const isMapped = typeof mappedHeader === 'string' && headers.includes(mappedHeader);
    const isEditing = editingHeader === field || !isMapped;

    const handleHeaderClick = () => {
      setEditingHeader(field);
    };

    return (
      <div>
        <div className="px-4 pb-0 pt-2 font-bold">{field}</div>
        {isEditing ? (
          <Select
            onValueChange={(val) => {
              handleColumnMapping(field, val);
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
            <SelectContent className="max-h-[300px] overflow-y-auto">
              {headers.map((header) => (
                <SelectItem key={header || '-'} value={header || '-'}>
                  {header || '-'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Button
            variant="ghost"
            className="h-8 py-0 font-normal text-muted-foreground"
            onClick={handleHeaderClick}
          >
            {mappedHeader || 'Select column'}
          </Button>
        )}
      </div>
    );
  };

  const renderActivityTypeCell = (activityType: string) => {
    const activityMapping = Object.entries(mapping.activityTypes).find(
      ([k, _]) => k === activityType,
    );
    const csvType = activityMapping ? (activityMapping[1] as ActivityType) : null;
    const isEditing = editingActivityType === activityType || !csvType;

    const handleActivityTypeClick = () => {
      setEditingActivityType(activityType);
    };

    return (
      <div className="flex items-center space-x-2">
        {isEditing ? (
          <>
            {activityType && <Badge variant="destructive">{activityType}</Badge>}
            <Select
              onValueChange={(newType) => {
                handleActivityTypeMapping(activityType, newType as ActivityType);
                setEditingActivityType(null);
              }}
              value={csvType || ''}
              onOpenChange={(open) => {
                if (!open) {
                  setEditingActivityType(null);
                }
              }}
            >
              <SelectTrigger className="h-8 w-full">
                <SelectValue placeholder={activityType} />
              </SelectTrigger>
              <SelectContent>
                {Object.values(ActivityType).map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : (
          <>
            {activityType && <Badge>{activityType}</Badge>}
            <Button
              variant="ghost"
              className="h-8 py-0 font-normal text-muted-foreground"
              onClick={handleActivityTypeClick}
            >
              {csvType}
            </Button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <CardTitle className="text-md font-semibold">{totalRows} activities to import</CardTitle>
        <CardDescription className="mt-2">
          <div className="flex flex-wrap gap-2">
            {Object.entries(activityTypeCounts).map(([type, count]) => (
              <div key={type} className="flex items-center space-x-1">
                <span className="text-">{type}:</span>
                <Badge variant="secondary" className="text-xs">
                  {count}
                </Badge>
              </div>
            ))}
          </div>
        </CardDescription>
      </Card>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">Line</TableHead>
              {importFormatFields.map((field) => (
                <TableHead key={field}>{renderHeaderCell(field)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {distinctActivityTypes.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                <TableCell>{row[row.length - 1]}</TableCell>
                {importFormatFields.map((field) => (
                  <TableCell key={field}>
                    {field === ImportFormat.ActivityType
                      ? renderActivityTypeCell(getMappedValue(row, field))
                      : getMappedValue(row, field)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
