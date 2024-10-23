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
import { ACTIVITY_TYPE_PREFIX_LENGTH } from '@/lib/types';

interface ImportPreviewTableProps {
  importFormatFields: ImportFormat[];
  mapping: {
    columns: Partial<Record<ImportFormat, string>>;
    activityTypes: Partial<Record<ActivityType, string[]>>;
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

  const { distinctActivityTypes, totalRows } = useMemo(() => {
    const activityTypeMap = new Map<string, { row: string[]; count: number }>();
    let total = 0;

    csvData.slice(1).forEach((row, index) => {
      const csvType = getMappedValue(row, ImportFormat.ActivityType);
      if (!activityTypeMap.has(csvType)) {
        activityTypeMap.set(csvType, {
          row: [...row, (index + 2).toString()],
          count: 1,
        });
      } else {
        const current = activityTypeMap.get(csvType)!;
        activityTypeMap.set(csvType, {
          ...current,
          count: current.count + 1,
        });
      }
      total++;
    });

    return {
      distinctActivityTypes: Array.from(activityTypeMap.entries()).map(([type, data]) => ({
        csvType: type,
        row: data.row,
        count: data.count,
        appType: findAppTypeForCsvType(type, mapping.activityTypes),
      })),
      activityTypeCounts: Object.fromEntries(
        Array.from(activityTypeMap.entries()).map(([type, data]) => [type, data.count]),
      ),
      totalRows: total,
    };
  }, [csvData, getMappedValue, mapping.activityTypes]);

  const renderHeaderCell = (field: ImportFormat) => {
    const mappedHeader = mapping.columns[field];
    const isMapped = typeof mappedHeader === 'string' && headers.includes(mappedHeader);
    const isEditing = editingHeader === field || !isMapped;

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
            onOpenChange={(open) => !open && setEditingHeader(null)}
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
            onClick={() => setEditingHeader(field)}
          >
            {mappedHeader || 'Select column'}
          </Button>
        )}
      </div>
    );
  };

  function findAppTypeForCsvType(
    csvType: string,
    mappings: Partial<Record<ActivityType, string[]>>,
  ): ActivityType | null {
    const compareValue =
      csvType.length > ACTIVITY_TYPE_PREFIX_LENGTH
        ? csvType.substring(0, ACTIVITY_TYPE_PREFIX_LENGTH).toUpperCase()
        : csvType.toUpperCase();

    for (const [appType, csvTypes] of Object.entries(mappings)) {
      if (
        csvTypes?.some((type) => {
          const mappedValue =
            type.length > ACTIVITY_TYPE_PREFIX_LENGTH
              ? type.substring(0, ACTIVITY_TYPE_PREFIX_LENGTH).toUpperCase()
              : type.toUpperCase();
          return mappedValue === compareValue;
        })
      ) {
        return appType as ActivityType;
      }
    }
    return null;
  }

  const renderActivityTypeCell = ({
    csvType,
    appType,
  }: {
    csvType: string;
    appType: ActivityType | null;
  }) => {
    const displayValue = csvType.length > 30 ? `${csvType.substring(0, 27)}...` : csvType;

    if (appType) {
      return (
        <div className="flex items-center space-x-2">
          <Badge title={csvType}>{displayValue}</Badge>
          <Button
            variant="ghost"
            className="h-8 py-0 font-normal text-muted-foreground"
            onClick={() => handleActivityTypeMapping(csvType, appType)}
          >
            {appType}
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center space-x-2">
        <Badge variant="destructive" title={csvType}>
          {displayValue}
        </Badge>
        <Select
          onValueChange={(newType) => handleActivityTypeMapping(csvType, newType as ActivityType)}
          value=""
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue placeholder="Map to type..." />
          </SelectTrigger>
          <SelectContent>
            {Object.values(ActivityType).map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <CardTitle className="text-md font-semibold">{totalRows} activities to import</CardTitle>
        <CardDescription className="mt-2">
          <div className="flex flex-wrap gap-2">
            {distinctActivityTypes.map(({ csvType, count, appType }) => (
              <div key={csvType} className="flex items-center space-x-1">
                <span>{csvType}</span>
                {appType && <span>→ {appType}</span>}
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
            {distinctActivityTypes.map(({ row, csvType, appType }) => (
              <TableRow key={csvType}>
                <TableCell>{row[row.length - 1]}</TableCell>
                {importFormatFields.map((field) => (
                  <TableCell key={field}>
                    {field === ImportFormat.ActivityType
                      ? renderActivityTypeCell({ csvType, appType })
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
