import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wealthfolio/ui/components/ui/dropdown-menu";
import { Icons } from "@wealthfolio/ui/components/ui/icons";

import type { Activity, ActivityDetails } from "@/lib/types";
import { Row } from "@tanstack/react-table";
import { useState } from "react";
import { ActivityDetailSheet } from "./activity-detail-sheet";

export interface ActivityOperationsProps<TData> {
  row?: Row<TData>;
  activity?: ActivityDetails;
  onEdit: (activity: ActivityDetails) => void | undefined;
  onDelete: (activity: ActivityDetails) => void | undefined;
  onDuplicate: (activity: ActivityDetails) => void | undefined | Promise<void> | Promise<Activity>;
}

export function ActivityOperations<TData>({
  row,
  activity: activityProp,
  onEdit,
  onDelete,
  onDuplicate,
}: ActivityOperationsProps<TData>) {
  const activity = activityProp ?? (row?.original as ActivityDetails);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="hover:bg-muted flex h-8 w-8 items-center justify-center rounded-md border transition-colors">
          <Icons.MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDetailSheetOpen(true)}>
            <Icons.Info className="mr-2 h-4 w-4" />
            More details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onEdit(activity)}>
            <Icons.Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDuplicate(activity)}>
            <Icons.Copy className="mr-2 h-4 w-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive flex cursor-pointer items-center"
            onSelect={() => onDelete(activity)}
          >
            <Icons.Trash className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ActivityDetailSheet
        activity={activity}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
      />
    </>
  );
}
