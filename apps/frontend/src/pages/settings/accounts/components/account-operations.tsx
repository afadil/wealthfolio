import { useState } from "react";

import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wealthfolio/ui/components/ui/dropdown-menu";
import { Icons } from "@wealthfolio/ui/components/ui/icons";

import type { Account } from "@/lib/types";
import { useTranslation } from "react-i18next";

export interface AccountOperationsProps {
  account: Account;
  onEdit: (account: Account) => void | undefined;
  onDelete: (account: Account) => void | undefined;
  onArchive: (account: Account, archive: boolean) => void | undefined;
  onHide: (account: Account, hide: boolean) => void | undefined;
}

export function AccountOperations({
  account,
  onEdit,
  onDelete,
  onArchive,
  onHide,
}: AccountOperationsProps) {
  const { t } = useTranslation("common");
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showArchiveAlert, setShowArchiveAlert] = useState(false);

  const handleDelete = () => {
    onDelete(account);
    setShowDeleteAlert(false);
  };

  const handleArchive = () => {
    onArchive(account, true);
    setShowArchiveAlert(false);
  };

  const handleRestore = () => {
    onArchive(account, false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="hover:bg-muted flex h-8 w-8 items-center justify-center rounded-md border transition-colors">
          <Icons.MoreVertical className="h-4 w-4" />
          <span className="sr-only">{t("settings.shared.open")}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(account)}>{t("settings.shared.edit")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onHide(account, account.isActive)}>
            {account.isActive ? t("settings.shared.hide") : t("settings.shared.show")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {account.isArchived ? (
            <DropdownMenuItem onClick={handleRestore}>{t("settings.shared.restore")}</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setShowArchiveAlert(true)}>
              {t("settings.shared.archive")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="text-destructive focus:text-destructive flex cursor-pointer items-center"
            onSelect={() => setShowDeleteAlert(true)}
          >
            {t("settings.shared.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.accounts.delete_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.shared.action_cannot_undo")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.shared.cancel")}</AlertDialogCancel>
            <Button onClick={handleDelete} className="bg-red-600 focus:ring-red-600">
              <Icons.Trash className="mr-2 h-4 w-4" />
              <span>{t("settings.shared.delete")}</span>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={showArchiveAlert} onOpenChange={setShowArchiveAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Icons.AlertTriangle className="h-5 w-5 text-amber-500" />
              {t("settings.accounts.archive_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("settings.accounts.archive_description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("settings.shared.cancel")}</AlertDialogCancel>
            <Button onClick={handleArchive}>{t("settings.shared.archive")}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
