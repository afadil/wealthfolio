import { Icons } from "@/components/ui/icons";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export interface ActivityDeleteModalProps {
  isOpen?: boolean;
  open?: boolean;
  isDeleting?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
  onOpenChange?: (open: boolean) => void;
}

export function ActivityDeleteModal({
  isOpen,
  open,
  isDeleting,
  onConfirm,
  onCancel,
  onOpenChange,
}: ActivityDeleteModalProps) {
  const { t } = useTranslation("activity");
  // const MemoizedAlertDialogContent = React.memo(AlertDialogContent);
  // const MemoizedAlertDialogFooter = React.memo(AlertDialogFooter);
  
  const show = isOpen ?? open;
  const handleOpenChange = (val: boolean) => {
    onOpenChange?.(val);
    if (!val) {
      onCancel?.();
    }
  };

  return (
    <AlertDialog open={show} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("delete.description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("delete.cancel")}</AlertDialogCancel>
          <Button onClick={() => onConfirm()} className="bg-red-600 focus:ring-red-600">
            {isDeleting ? (
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Icons.Trash className="mr-2 h-4 w-4" />
            )}
            <span>{t("delete.confirm")}</span>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
