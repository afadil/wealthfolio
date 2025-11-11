import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icons } from "@/components/ui/icons";

import type { Activity, ActivityDetails } from "@/lib/types";
import { Row } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation(["activity"]);
  const activity = activityProp ?? (row?.original as ActivityDetails);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="hover:bg-muted flex h-8 w-8 items-center justify-center rounded-md border transition-colors">
          <Icons.MoreVertical className="h-4 w-4" />
          <span className="sr-only">{t("activity:operations.open")}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(activity)}>
            {t("activity:operations.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDuplicate(activity)}>
            {t("activity:operations.duplicate")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive flex cursor-pointer items-center"
            onSelect={() => onDelete(activity)}
          >
            {t("activity:operations.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
