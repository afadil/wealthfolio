import { ReactNode, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { Icons } from "../ui/icons";

interface DeleteConfirmProps {
  deleteConfirmMessage: string | ReactNode;
  deleteConfirmTitle: string;
  handleCancel?: () => void;
  handleDeleteConfirm: () => void;
  isPending: boolean;
  button?: ReactNode;
}

export const DeleteConfirm = ({
  deleteConfirmMessage,
  deleteConfirmTitle,
  handleCancel,
  handleDeleteConfirm,
  button,
  isPending,
}: DeleteConfirmProps) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Popover open={isOpen} onOpenChange={(open) => setIsOpen(open)}>
      <PopoverTrigger asChild>
        {button ? (
          button
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation(); // Prevent accordion from toggling
            }}
          >
            <Icons.Trash className="h-3.5 w-3.5" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">{deleteConfirmTitle}</h4>
            <p className="text-sm text-muted-foreground">
              {deleteConfirmMessage}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsOpen(false);
                handleCancel?.();
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={handleDeleteConfirm}
            >
              {isPending ? (
                <>
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
