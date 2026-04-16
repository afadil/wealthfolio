import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";

interface RefreshQuotesConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** Optional asset name shown in the description */
  assetName?: string;
}

export function RefreshQuotesConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  assetName,
}: RefreshQuotesConfirmDialogProps) {
  const { t } = useTranslation("common");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("asset.refresh_history.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {assetName
              ? t("asset.refresh_history.body_named", { name: assetName })
              : t("asset.refresh_history.body")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("asset.refresh_history.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {t("asset.refresh_history.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
