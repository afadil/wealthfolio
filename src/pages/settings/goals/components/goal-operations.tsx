import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icons } from "@/components/ui/icons";

import type { Goal } from "@/lib/types";

export interface GoalOperationsProps {
  goal: Goal;
  onEdit: (goal: Goal) => void | undefined;
  onDelete: (goal: Goal) => void | undefined;
}

export function GoalOperations({ goal, onEdit, onDelete }: GoalOperationsProps) {
  const { t } = useTranslation("settings");
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  //const navigation = useNavigation();
  const isDeleting = false; //navigation?.formData?.get('intent') === 'delete';
  const handleDelete = () => {
    onDelete(goal);
    setShowDeleteAlert(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="hover:bg-muted flex h-8 w-8 items-center justify-center rounded-md border transition-colors">
          <Icons.MoreVertical className="h-4 w-4" />
          <span className="sr-only">{t("goals.operations.openMenu")}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(goal)}>
            {t("goals.operations.edit")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive flex cursor-pointer items-center"
            onSelect={() => setShowDeleteAlert(true)}
          >
            {t("goals.operations.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("goals.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("goals.delete.description")}</AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <input type="hidden" name="id" value={goal.id} />
            <AlertDialogCancel>{t("goals.form.buttons.cancel")}</AlertDialogCancel>

            <Button
              disabled={isDeleting}
              onClick={() => handleDelete()}
              className="bg-red-600 focus:ring-red-600"
            >
              {isDeleting ? (
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Icons.Trash className="mr-2 h-4 w-4" />
              )}
              <span>{t("goals.delete.button")}</span>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
