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
import { ImportFormat, ActivityType } from '@/lib/types';

interface ActivityTypeMappingProps {
  importFormatFields: ImportFormat[];
  mapping: {
    columns: Record<ImportFormat, string>;
    activityTypes: Record<ActivityType, string>;
  };
  headers: string[];
  unmappedActivitiesWithDetails: { activity: string; details: string[] }[];
  handleActivityTypeMapping: (csvActivity: string, activityType: ActivityType) => void;
}

export function ActivityTypeMapping({
  importFormatFields,
  mapping,
  headers,
  unmappedActivitiesWithDetails,
  handleActivityTypeMapping,
}: ActivityTypeMappingProps) {
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
          {unmappedActivitiesWithDetails.map(({ activity, details }, index) => (
            <TableRow key={`activity-${index}`} className="bg-muted">
              {importFormatFields.map((field) => (
                <TableCell key={field}>
                  {field === ImportFormat.ActivityType ? (
                    <Select
                      onValueChange={(value) => {
                        handleActivityTypeMapping(activity, value as ActivityType);
                      }}
                      value={
                        Object.entries(mapping.activityTypes).find(
                          ([_, v]) => v === activity,
                        )?.[0] || ''
                      }
                    >
                      <SelectTrigger className="h-8 w-full">
                        <SelectValue placeholder={activity || 'Select activity type'} />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(ActivityType).map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : mapping.columns[field] ? (
                    details[headers.indexOf(mapping.columns[field])]
                  ) : (
                    ''
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
