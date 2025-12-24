import { Icons } from "@wealthfolio/ui/components/ui/icons";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wealthfolio/ui/components/ui/alert-dialog";
import { Button } from "@wealthfolio/ui/components/ui/button";

export interface ActivityDeleteModalProps {
  isOpen?: boolean;
  isDeleting?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function ActivityDeleteModal({
  isOpen,
  isDeleting,
  onConfirm,
  onCancel,
}: ActivityDeleteModalProps) {
  // const MemoizedAlertDialogContent = React.memo(AlertDialogContent);
  // const MemoizedAlertDialogFooter = React.memo(AlertDialogFooter);
  return (
    <AlertDialog open={isOpen} onOpenChange={onCancel}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure you want to delete this activity?</AlertDialogTitle>
          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button onClick={() => onConfirm()} className="bg-red-600 focus:ring-red-600">
            {isDeleting ? (
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Icons.Trash className="mr-2 h-4 w-4" />
            )}
            <span>Delete</span>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
