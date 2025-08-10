import { ReactNode, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button, type ButtonProps } from '../ui/button';
import { Icons } from '../ui/icons';

interface ActionConfirmProps {
  confirmMessage: string | ReactNode;
  confirmTitle: string;
  handleCancel?: () => void;
  handleConfirm: () => void;
  isPending: boolean;
  button?: ReactNode;
  confirmButtonText?: string;
  confirmButtonVariant?: ButtonProps['variant'];
  cancelButtonText?: string;
  pendingText?: string;
}

export const ActionConfirm = ({
  confirmMessage,
  confirmTitle,
  handleCancel,
  handleConfirm,
  button,
  isPending,
  confirmButtonText = 'Confirm',
  confirmButtonVariant = 'destructive',
  cancelButtonText = 'Cancel',
  pendingText = 'In progress...',
}: ActionConfirmProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={(open) => setIsOpen(open)}>
      <PopoverTrigger asChild>
        {button || (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <Icons.AlertCircle className="h-3.5 w-3.5" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">{confirmTitle}</h4>
            <p className="text-sm text-muted-foreground">{confirmMessage}</p>
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
              {cancelButtonText}
            </Button>
            <Button
              variant={confirmButtonVariant}
              size="sm"
              disabled={isPending}
              onClick={handleConfirm}
            >
              {isPending ? (
                <>
                  <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                  {pendingText}
                </>
              ) : (
                confirmButtonText
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
