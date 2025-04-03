import { FileDropzone } from '../components/file-dropzone';
import { HelpTooltip } from '../components/help-tooltip';
import { Button } from '@/components/ui/button';
import { Account, CsvRowError } from '@/lib/types';
import { CSVFileViewer } from '../components/csv-file-viewer';
import { AccountSelector } from '../components/account-selector';
import { ImportProgressIndicator } from '../components/progress-indicator';
import { Icons } from '@/components/icons';
import { ImportAlert } from '../components/import-alert';

interface AccountSelectionStepProps {
  selectedAccount: Account | null;
  csvFile: File | null;
  rawData: string[][];
  isParsing: boolean;
  errors: CsvRowError[] | Record<string | number, string[]> | null;
  setSelectedAccount: (account: Account) => void;
  setCsvFile: (file: File | null) => void;
  onNext: () => void;
}

export const AccountSelectionStep = ({
  selectedAccount,
  rawData = [],
  csvFile,
  isParsing,
  errors = null,
  setSelectedAccount,
  setCsvFile,
  onNext,
}: AccountSelectionStepProps) => {
  // Check if there are any errors
  const hasErrors =
    errors &&
    ((Array.isArray(errors) && errors.length > 0) ||
      (typeof errors === 'object' && Object.keys(errors).length > 0));

  // Determine critical errors (rows 0-1)
  const criticalError =
    hasErrors &&
    (() => {
      if (Array.isArray(errors)) {
        const criticalErrorObj = errors.find(
          (error) => error && (error.row === 0 || error.row === 1),
        );
        return criticalErrorObj?.message || null;
      }
      return errors[0]?.[0] || errors[1]?.[0] || null;
    })();

  // Simplified file validation status
  const fileValidationStatus = !csvFile
    ? 'idle'
    : hasErrors
      ? 'invalid'
      : isParsing
        ? 'loading'
        : 'valid';

  console.log('fileValidationStatus', fileValidationStatus, 'hasErrors', hasErrors);

  const handleFileChange = (file: File | null) => {
    setCsvFile(file);
  };

  const canProceed = selectedAccount && csvFile && !hasErrors && !isParsing;

  // Format raw data for display
  const formattedData = rawData.map((row, index) => {
    let rowErrors: string[] = [];
    let isValid = true;

    if (Array.isArray(errors)) {
      isValid = !errors.some((error) => error && error.row === index);
      rowErrors = errors
        .filter((error) => error && error.row === index)
        .map((error) => error.message || '');
    } else if (errors && typeof errors === 'object') {
      isValid = !errors[index] || errors[index].length === 0;
      rowErrors = errors[index] || [];
    }

    return {
      id: index,
      content: row.join(','),
      isValid,
      errors: rowErrors,
    };
  });

  // Extract all error messages for display
  const errorMessages = hasErrors
    ? (() => {
        const messages: string[] = [];
        if (Array.isArray(errors)) {
          return errors.map((err) => err.message || '').filter(Boolean);
        }
        Object.values(errors).forEach((errArray) => {
          if (Array.isArray(errArray)) {
            messages.push(...errArray);
          }
        });
        return messages;
      })()
    : [];

  // Error message to display in the UI
  const displayError =
    criticalError ||
    (errorMessages.length > 0
      ? errorMessages[0] +
        (errorMessages.length > 1 ? ` (and ${errorMessages.length - 1} more errors)` : '')
      : null);

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1: Account and file selection */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center">
            <h2 className="font-semibold">Select Account</h2>
            <HelpTooltip content="Make sure to select the account you want to import activities for" />
          </div>
          <div className="h-[120px]">
            <AccountSelector
              selectedAccount={selectedAccount}
              setSelectedAccount={setSelectedAccount}
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center">
            <h2 className="font-semibold">Upload CSV File</h2>
            <HelpTooltip content="Upload a CSV file containing your investment activities. The file should include headers in the first row." />
          </div>
          <div className="h-[120px]">
            <FileDropzone
              file={csvFile}
              onFileChange={handleFileChange}
              isLoading={isParsing}
              accept=".csv"
              isValid={fileValidationStatus === 'valid'}
              error={hasErrors ? 'File contains errors' : null}
            />
          </div>
        </div>
      </div>

      {/* Row 2: CSV Viewer or Error Display */}
      <div className="min-h-[200px] pt-4">
        {/* Always show CSV viewer when data is available (with or without errors) */}
        {csvFile && formattedData.length > 0 && !isParsing && (
          <CSVFileViewer data={formattedData} className="w-full" maxHeight="40vh" />
        )}

        {/* Show error alert when there's an error but no parsable data */}
        {fileValidationStatus === 'invalid' && formattedData.length === 0 && (
          <ImportAlert
            variant="destructive"
            title="Invalid CSV Format"
            description={displayError || 'Unknown error'}
            icon={Icons.FileX}
          />
        )}
      </div>

      {/* Row 4: Next button */}
      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!canProceed}>
          {isParsing ? 'Validating...' : 'Next'}
          <Icons.ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
      {/* Loading indicator */}
      <ImportProgressIndicator isLoading={isParsing} open={isParsing} />
    </div>
  );
};
