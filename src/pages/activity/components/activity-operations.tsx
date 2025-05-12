import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icons } from '@/components/icons';

import type { ActivityDetails } from '@/lib/types';
import { Row } from '@tanstack/react-table';

export interface ActivityOperationsProps<TData> {
  row: Row<TData>;
  onEdit: (activity: ActivityDetails) => void | undefined;
  onDuplicate: (activity: ActivityDetails) => void | undefined;
  onDelete: (activity: ActivityDetails) => void | undefined;
}

export function ActivityOperations<TData>({
  row,
  onEdit,
  onDuplicate,
  onDelete,
}: ActivityOperationsProps<TData>) {
  const activity = row.original as ActivityDetails;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-muted">
          <Icons.MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(activity)}>Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDuplicate(activity)}>Duplicate</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="flex cursor-pointer items-center text-destructive focus:text-destructive"
            onSelect={() => onDelete(activity)}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
