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

import type { Account } from "@/lib/types";

export interface AccountOperationsProps {
  account: Account;
  onEdit: (account: Account) => void | undefined;
  onDelete: (account: Account) => void | undefined;
}

export function AccountOperations({ account, onEdit, onDelete }: AccountOperationsProps) {
  const { t } = useTranslation("settings");
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  //const navigation = useNavigation();
  const isDeleting = false; //navigation?.formData?.get('intent') === 'delete';
  const handleDelete = () => {
    onDelete(account);
    setShowDeleteAlert(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="hover:bg-muted flex h-8 w-8 items-center justify-center rounded-md border transition-colors">
          <Icons.MoreVertical className="h-4 w-4" />
          <span className="sr-only">{t("accounts_operations_open")}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(account)}>{t("accounts_operations_edit")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive flex cursor-pointer items-center"
            onSelect={() => setShowDeleteAlert(true)}
          >
            {t("accounts_operations_delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("accounts_delete_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("accounts_delete_description")}</AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <input type="hidden" name="id" value={account.id} />
            <AlertDialogCancel>{t("common_cancel")}</AlertDialogCancel>

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
              <span>{t("common_delete")}</span>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
