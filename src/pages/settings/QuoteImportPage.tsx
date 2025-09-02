import { useState, useEffect } from 'react';
import { Button } from '@wealthfolio/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@wealthfolio/ui/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@wealthfolio/ui/components/ui/tabs';
import { Icons } from '@wealthfolio/ui/components/ui/icons';
import { QuoteImportForm } from '@/components/quote-import/QuoteImportForm';
import { QuotePreviewTable } from '@/components/quote-import/QuotePreviewTable';
import { QuoteImportProgress } from '@/components/quote-import/QuoteImportProgress';
import { useQuoteImport } from '@/hooks/useQuoteImport';

export function QuoteImportPage() {
  const {
    file,
    preview,
    isValidating,
    isImporting,
    importProgress,
    error,
    overwriteExisting,
    setFile,
    validateFile,
    importQuotes,
    setOverwriteExisting,
    reset,
  } = useQuoteImport();

  const [activeTab, setActiveTab] = useState('upload');

  // Automatically switch to preview tab when preview is created
  useEffect(() => {
    if (preview && activeTab === 'upload') {
      setActiveTab('preview');
    }
  }, [preview, activeTab]);

  const handleValidationComplete = () => {
    if (preview) {
      setActiveTab('preview');
    }
  };

  const handleImportComplete = () => {
    setActiveTab('results');
  };

  const handleStartOver = () => {
    reset();
    setActiveTab('upload');
  };

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Import Historical Quotes</h1>
          <p className="text-muted-foreground">
            Import historical market data from CSV files to fill gaps in your portfolio data
          </p>
        </div>
        <Button variant="outline" onClick={handleStartOver}>
          <Icons.Refresh className="mr-2 h-4 w-4" />
          Start Over
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upload" disabled={isImporting}>
            <Icons.Import className="mr-2 h-4 w-4" />
            Upload & Validate
          </TabsTrigger>
          <TabsTrigger value="preview" disabled={!preview || isImporting}>
            <Icons.FileText className="mr-2 h-4 w-4" />
            Preview Data
          </TabsTrigger>
          <TabsTrigger value="results" disabled={!preview || isImporting}>
            <Icons.CheckCircle className="mr-2 h-4 w-4" />
            Import Results
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          <QuoteImportForm
            file={file}
            isValidating={isValidating}
            error={error}
            overwriteExisting={overwriteExisting}
            onFileSelect={setFile}
            onValidate={validateFile}
            onOverwriteChange={setOverwriteExisting}
          />
        </TabsContent>

        <TabsContent value="preview" className="space-y-6">
          {preview && (
            <>
              <QuotePreviewTable quotes={preview.sampleQuotes} />

              <Card>
                <CardHeader>
                  <CardTitle>Import Summary</CardTitle>
                  <CardDescription>
                    Review the validation results before proceeding with the import
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 grid grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{preview.totalRows}</div>
                      <div className="text-sm text-muted-foreground">Total Rows</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{preview.validRows}</div>
                      <div className="text-sm text-muted-foreground">Valid</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{preview.invalidRows}</div>
                      <div className="text-sm text-muted-foreground">Invalid</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-600">
                        {preview.duplicateCount}
                      </div>
                      <div className="text-sm text-muted-foreground">Duplicates</div>
                    </div>
                  </div>

                  <Button
                    onClick={async () => {
                      try {
                        await importQuotes();
                        handleImportComplete();
                      } catch (error) {
                        console.error('Import failed:', error);
                        // Error is handled by the hook, just don't switch tabs
                      }
                    }}
                    disabled={preview.validRows === 0 || isImporting}
                    className="w-full"
                  >
                    <Icons.Import className="mr-2 h-4 w-4" />
                    Import {preview.validRows} Valid Quotes
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="results" className="space-y-6">
          <QuoteImportProgress
            isImporting={isImporting}
            progress={importProgress}
            totalRows={preview?.totalRows || 0}
            successfulRows={preview?.validRows || 0}
            failedRows={preview?.invalidRows || 0}
          />

          {preview && (
            <Card>
              <CardHeader>
                <CardTitle>Import Complete</CardTitle>
                <CardDescription>
                  Your historical quotes have been imported successfully
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    The imported data will be used to calculate more accurate portfolio valuations
                    and performance metrics for the historical periods you imported.
                  </p>

                  <div className="flex gap-2">
                    <Button onClick={handleStartOver} variant="outline">
                      <Icons.Import className="mr-2 h-4 w-4" />
                      Import More Data
                    </Button>
                    <Button>
                      <Icons.LayoutDashboard className="mr-2 h-4 w-4" />
                      View Portfolio
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
