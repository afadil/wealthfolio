import React, { useRef } from 'react';
import { Button } from '@wealthfolio/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@wealthfolio/ui/components/ui/card';
import { Input } from '@wealthfolio/ui/components/ui/input';
import { Label } from '@wealthfolio/ui/components/ui/label';
import { Checkbox } from '@wealthfolio/ui/components/ui/checkbox';
import { Icons } from '@wealthfolio/ui/components/ui/icons';
import { Alert, AlertDescription } from '@wealthfolio/ui/components/ui/alert';

interface QuoteImportFormProps {
  file: File | null;
  isValidating: boolean;
  error: string | null;
  overwriteExisting: boolean;
  onFileSelect: (file: File | null) => void;
  onValidate: () => void;
  onOverwriteChange: (overwrite: boolean) => void;
}

export function QuoteImportForm({
  file,
  isValidating,
  error,
  overwriteExisting,
  onFileSelect,
  onValidate,
  onOverwriteChange,
}: QuoteImportFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;
    onFileSelect(selectedFile);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.type === 'text/csv') {
      onFileSelect(droppedFile);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icons.Import className="h-5 w-5" />
          Select CSV File
        </CardTitle>
        <CardDescription>
          Choose a CSV file containing historical quote data to import
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Drop Zone */}
        <div
          className="cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-6 text-center transition-colors hover:border-gray-400"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={handleBrowseClick}
        >
          <Icons.Import className="mx-auto mb-2 h-8 w-8 text-gray-400" />
          <p className="mb-2 text-sm text-gray-600">
            {file ? (
              <span className="flex items-center justify-center gap-2">
                <Icons.FileText className="h-4 w-4" />
                {file.name}
              </span>
            ) : (
              'Drop your CSV file here or click to browse'
            )}
          </p>
          <p className="text-xs text-gray-500">
            Supports CSV files with columns: symbol, date, open, high, low, close, volume, currency
          </p>
        </div>

        {/* Hidden File Input */}
        <Input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <Icons.AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Import Options */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="overwrite"
              checked={overwriteExisting}
              onCheckedChange={onOverwriteChange}
            />
            <Label htmlFor="overwrite" className="text-sm">
              Overwrite existing quotes with the same symbol and date
            </Label>
          </div>
        </div>

        {/* Validate Button */}
        <Button onClick={onValidate} disabled={!file || isValidating} className="w-full">
          {isValidating ? 'Validating...' : 'Validate File'}
        </Button>

        {/* CSV Format Help */}
        <div className="rounded bg-gray-50 p-3 text-xs text-gray-500">
          <p className="mb-1 font-medium">Expected CSV Format:</p>
          <pre className="whitespace-pre-wrap">
            {`symbol,date,open,high,low,close,volume,currency
AAPL,2023-01-01,150.00,155.00,149.00,152.50,1000000,USD
AAPL,2023-01-02,152.50,158.00,151.00,156.00,1200000,USD`}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
