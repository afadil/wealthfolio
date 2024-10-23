import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { Icons } from '@/components/icons';

interface ErrorsPreviewProps {
  errors: Record<string, string[]>;
  csvData: string[][];
}

export function ErrorsPreview({ errors, csvData }: ErrorsPreviewProps) {
  const errorEntries = Object.entries(errors);
  const totalErrors = errorEntries.reduce((sum, [_, messages]) => sum + messages.length, 0);

  const getInvalidFields = (rowIndex: number): Set<number> => {
    const invalidFields = new Set<number>();
    const rowErrors = errors[`Row ${rowIndex + 1}`] || [];
    rowErrors.forEach((error) => {
      const fieldMatch = error.match(/^Invalid (.+):/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1].toLowerCase();
        const fieldIndex = csvData[0].findIndex((header) =>
          header.toLowerCase().includes(fieldName),
        );
        if (fieldIndex !== -1) {
          invalidFields.add(fieldIndex);
        }
      }
    });
    return invalidFields;
  };

  return (
    <div className="mb-4">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Import Errors</AlertTitle>
        <AlertDescription>
          {totalErrors} error{totalErrors !== 1 ? 's' : ''} found in the import data.
        </AlertDescription>
      </Alert>
      <div className="mt-2 max-h-[60vh] overflow-y-auto rounded-md border bg-muted p-4">
        {errorEntries.map(([row, messages]) => (
          <div key={row} className="mb-4 rounded-md border border-destructive bg-destructive/5 p-3">
            <h3 className="mb-2 font-semibold">{row}</h3>
            <ul className="mb-2 list-inside list-disc">
              {messages.map((message, index) => (
                <li key={index} className="flex items-center space-x-2 text-sm text-destructive">
                  <Icons.AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{message}</span>
                </li>
              ))}
            </ul>
            {row !== 'Error' && (
              <div className="mt-2">
                <h4 className="mb-1 text-sm font-medium">Row Preview:</h4>
                <div className="rounded-md bg-muted p-2">
                  <pre className="text-xs">
                    <code>{csvData[parseInt(row.split(' ')[1]) - 1]?.join(', ')}</code>
                  </pre>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4">
        <h3 className="mb-2 font-semibold">CSV Preview (First 5 Rows)</h3>
        <div className="rounded-md border bg-muted p-4">
          {csvData.slice(0, 5).map((row, rowIndex) => (
            <div key={rowIndex} className="flex items-center space-x-2 font-mono text-sm">
              <span className="w-4 flex-shrink-0 text-muted-foreground">{rowIndex + 1}:</span>
              <p className="flex-1 overflow-x-auto whitespace-nowrap">
                {row.map((cell, cellIndex) => {
                  const isInvalid = getInvalidFields(rowIndex).has(cellIndex);
                  return (
                    <span key={cellIndex} className={isInvalid ? 'text-red-500' : ''}>
                      {cell}
                      {cellIndex < row.length - 1 ? ', ' : ''}
                    </span>
                  );
                })}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
