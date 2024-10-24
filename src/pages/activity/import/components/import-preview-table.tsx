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
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ImportFormat, ActivityType } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { ACTIVITY_TYPE_PREFIX_LENGTH } from '@/lib/types';

const REQUIRED_FIELDS = [
  ImportFormat.Date,
  ImportFormat.ActivityType,
  ImportFormat.Symbol,
  ImportFormat.Quantity,
  ImportFormat.UnitPrice,
];

const SKIP_FIELD_VALUE = '__skip__';

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
    const isRequired = REQUIRED_FIELDS.includes(field);

    return (
      <div>
        <div className="flex items-center gap-2 px-4 pb-0 pt-2">
          <span className="font-bold">{field}</span>
        </div>
        {isEditing ? (
          <Select
            onValueChange={(val) => {
              handleColumnMapping(field, val === SKIP_FIELD_VALUE ? '' : val);
              setEditingHeader(null);
            }}
            value={mappedHeader || SKIP_FIELD_VALUE}
            onOpenChange={(open) => !open && setEditingHeader(null)}
          >
            <SelectTrigger className="h-8 w-full px-3 py-2 text-sm font-normal text-muted-foreground">
              <SelectValue placeholder={isRequired ? 'Select column' : 'Optional'} />
            </SelectTrigger>
            <SelectContent className="max-h-[300px] overflow-y-auto">
              {!isRequired && (
                <>
                  <SelectItem value={SKIP_FIELD_VALUE}>
                    {field === ImportFormat.Currency ? 'Account Currency' : 'Ignore'}
                  </SelectItem>
                  <SelectSeparator />
                </>
              )}
              {headers.map((header) => (
                <SelectItem key={header || '-'} value={header || '-'}>
                  {header || '-'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="h-8 py-0 font-normal text-muted-foreground"
            onClick={() => setEditingHeader(field)}
          >
            {mappedHeader || (isRequired ? 'Select column' : 'Ignore')}
          </Button>
        )}
      </div>
    );
  };

  function findAppTypeForCsvType(
    csvType: string,
    mappings: Partial<Record<ActivityType, string[]>>,
  ): ActivityType | null {
    const normalizedCsvType = csvType.trim().toUpperCase();

    for (const [appType, csvTypes] of Object.entries(mappings)) {
      if (
        csvTypes?.some((mappedType) => {
          const normalizedMappedType = mappedType.trim().toUpperCase();
          return normalizedCsvType.startsWith(normalizedMappedType);
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
    const trimmedCsvType = csvType.trim().toUpperCase();
    const displayValue =
      trimmedCsvType.length > 27 ? `${trimmedCsvType.substring(0, 27)}...` : trimmedCsvType;

    if (appType) {
      return (
        <div className="flex items-center space-x-2">
          <Badge title={trimmedCsvType}>
            {displayValue.length > ACTIVITY_TYPE_PREFIX_LENGTH
              ? `${displayValue.substring(0, ACTIVITY_TYPE_PREFIX_LENGTH)}...`
              : displayValue}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            className="h-8 py-0 font-normal text-muted-foreground"
            onClick={() => {
              // Pass empty string as ActivityType to trigger removal of mapping
              handleActivityTypeMapping(trimmedCsvType, '' as ActivityType);
            }}
          >
            {appType}
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center space-x-2">
        {displayValue.length > ACTIVITY_TYPE_PREFIX_LENGTH ? (
          <span className="text-destructive" title={trimmedCsvType}>
            {displayValue}
          </span>
        ) : (
          <Badge variant="destructive" title={trimmedCsvType}>
            {displayValue}
          </Badge>
        )}
        <Select
          onValueChange={(newType) =>
            handleActivityTypeMapping(trimmedCsvType, newType as ActivityType)
          }
          value=""
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue placeholder="..." />
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
                {csvType === appType ? (
                  <span>{csvType}</span>
                ) : (
                  <>
                    <span>{csvType}</span>
                    {appType && <span>→ {appType}</span>}
                  </>
                )}
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
              <TableHead className="w-[50px]">
                <div className="flex flex-col">
                  <span>Field</span>
                  <span className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md px-4 py-0 text-sm font-normal text-muted-foreground">
                    Mapping
                  </span>
                </div>
              </TableHead>
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
