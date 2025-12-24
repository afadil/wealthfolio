import { Separator } from "@wealthfolio/ui/components/ui/separator";
import { useQuoteImport } from "@/hooks/use-quote-import";
import { cn } from "@/lib/utils";
import { StepIndicator } from "@/pages/activity/import/components/step-indicator";
import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui/components/ui/card";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { QuoteImportForm } from "./quote-import-form";
import { QuoteImportHelpPopover } from "./quote-import-help-popover";
import { QuoteImportProgress } from "./quote-import-progress";
import { QuotePreviewTable } from "./quote-preview-table";

// Define the steps in the wizard
const STEPS = [
  { id: 1, title: "Upload & Validate" },
  { id: 2, title: "Preview Data" },
  { id: 3, title: "Import Results" },
];

interface ImportQuotesSectionProps {
  showTitle?: boolean;
}

export function ImportQuotesSection({ showTitle = true }: ImportQuotesSectionProps) {
  const {
    file,
    preview,
    isValidating,
    isImporting,
    importProgress,
    error,
    setFile,
    validateFile,
    importQuotes,
    reset,
  } = useQuoteImport();

  const [currentStep, setCurrentStep] = useState(1);

  // Automatically switch to preview step when preview is created
  useEffect(() => {
    if (preview && currentStep === 1) {
      setCurrentStep(2);
    }
  }, [preview, currentStep]);

  const handleImportComplete = () => {
    setCurrentStep(3);
  };

  const handleStartOver = () => {
    reset();
    setCurrentStep(1);
  };

  // Render the current step
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <QuoteImportForm
            file={file}
            isValidating={isValidating}
            error={error}
            onFileSelect={setFile}
            onValidate={validateFile}
          />
        );
      case 2:
        return (
          preview && (
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
                      <div className="text-muted-foreground text-sm">Total Rows</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{preview.validRows}</div>
                      <div className="text-muted-foreground text-sm">Valid</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{preview.invalidRows}</div>
                      <div className="text-muted-foreground text-sm">Invalid</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-600">
                        {preview.duplicateCount}
                      </div>
                      <div className="text-muted-foreground text-sm">Duplicates</div>
                    </div>
                  </div>

                  <Button
                    onClick={async () => {
                      try {
                        await importQuotes();
                        handleImportComplete();
                      } catch (error) {
                        console.error("Import failed:", error);
                        // Error is handled by the hook, just don't switch steps
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
          )
        );
      case 3:
        return (
          <QuoteImportProgress
            isImporting={isImporting}
            progress={importProgress}
            totalRows={preview?.totalRows ?? 0}
            successfulRows={preview?.validRows ?? 0}
            failedRows={preview?.invalidRows ?? 0}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div
        className={cn("flex items-center justify-between", showTitle ? undefined : "justify-end")}
      >
        {showTitle && (
          <div>
            <h3 className="text-lg font-semibold">Import Historical Quotes</h3>
            <p className="text-muted-foreground text-sm">
              Import historical market data from CSV files to fill gaps in your portfolio data
            </p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <QuoteImportHelpPopover />
          <Button variant="outline" size="sm" onClick={handleStartOver}>
            <Icons.Refresh className="mr-2 h-4 w-4" />
            Start Over
          </Button>
        </div>
      </div>

      {showTitle && <Separator />}

      <Card className="w-full">
        <CardHeader className="border-b">
          <StepIndicator steps={STEPS} currentStep={currentStep} />
        </CardHeader>
        <CardContent className="overflow-hidden p-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="p-4 sm:p-6"
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}
