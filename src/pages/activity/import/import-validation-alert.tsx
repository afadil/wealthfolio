import React from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/ui/icons';

interface ValidationAlertProps {
  success: boolean;
  warnings: number;
  error: String | null;
  isConfirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ValidationAlert: React.FC<ValidationAlertProps> = ({
  success,
  warnings,
  error,
  isConfirming,
  onConfirm,
  onCancel,
}) => {
  if (warnings > 0) {
    return (
      <Alert className="mb-4 flex flex-col" variant="warning">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center">
            <Icons.AlertCircle className="mr-2 h-4 w-4" />
            <AlertTitle>
              There are issues with {warnings} activity entries.
              <p className="pt-1 text-sm font-normal">
                Please review them in the table below and either correct or remove these entries to
                proceed with the import.
              </p>
              <p className="pt-1 text-sm font-normal">
                Hover over the error icon on each line for more details about the specific issue.
              </p>
            </AlertTitle>
          </div>
        </div>
        <div className="mt-2 flex justify-start">
          <Button className="mr-2" onClick={onCancel}>
            Retry
          </Button>
        </div>
      </Alert>
    );
  }
  if (success) {
    return (
      <Alert className="mb-4 flex flex-col" variant="success">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center">
            <Icons.CheckCircle className="mr-2 h-4 w-4" />
            <div>
              <AlertTitle>All activities are valid</AlertTitle>
              <AlertDescription>
                Click <b>Confirm Import</b> to proceed with the import.
              </AlertDescription>
            </div>
          </div>
        </div>
        <div className="mt-2 flex justify-start">
          <Button variant="secondary" className="mr-2" disabled={isConfirming} onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? (
              <>
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                <span className="hidden sm:ml-2 sm:inline">Importing...</span>
              </>
            ) : (
              <>
                <Icons.Import className="mr-2 h-4 w-4" />
                <span className="hidden sm:ml-2 sm:inline">Confirm Import</span>
              </>
            )}
          </Button>
        </div>
      </Alert>
    );
  }
  if (error) {
    return (
      <Alert className="mb-4 flex flex-col" variant="destructive">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center">
            <Icons.AlertCircle className="mr-2 h-4 w-4" />
            <AlertTitle>{error}</AlertTitle>
          </div>
        </div>
        <div className="mt-2 flex justify-start">
          <Button className="mr-2" onClick={onCancel}>
            Retry
          </Button>
        </div>
      </Alert>
    );
  }
  return null;
};

export default ValidationAlert;
