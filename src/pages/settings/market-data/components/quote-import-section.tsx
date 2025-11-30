import { Separator } from "@/components/ui/separator";
import { useQuoteImport } from "@/hooks/use-quote-import";
import { cn } from "@/lib/utils";
import { StepIndicator } from "@/pages/activity/import/components/step-indicator";
import { Button } from "@wealthvn/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthvn/ui/components/ui/card";
import { Icons } from "@wealthvn/ui/components/ui/icons";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { QuoteImportForm } from "./quote-import-form";
import { QuoteImportHelpPopover } from "./quote-import-help-popover";
import { QuoteImportProgress } from "./quote-import-progress";
import { QuotePreviewTable } from "./quote-preview-table";

interface ImportQuotesSectionProps {
  showTitle?: boolean;
}

export function ImportQuotesSection({ showTitle = true }: ImportQuotesSectionProps) {
  const { t } = useTranslation("settings");

  // Define the steps in the wizard
  const STEPS = [
    { id: 1, title: t("marketData.import.steps.uploadValidate") },
    { id: 2, title: t("marketData.import.steps.preview") },
    { id: 3, title: t("marketData.import.steps.results") },
  ];

  const {
    file,
    preview,
    isValidating,
    isImporting,
    importProgress,
    error,
    overwriteExisting,
    setFile,
    setOverwriteExisting,
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
            overwriteExisting={overwriteExisting}
            onFileSelect={setFile}
            onValidate={validateFile}
            onOverwriteChange={setOverwriteExisting}
          />
        );
      case 2:
        return (
          preview && (
            <>
              <QuotePreviewTable quotes={preview.sampleQuotes} />

              <Card>
                <CardHeader>
                  <CardTitle>{t("marketData.import.summary.title")}</CardTitle>
                  <CardDescription>{t("marketData.import.summary.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 grid grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{preview.totalRows}</div>
                      <div className="text-muted-foreground text-sm">
                        {t("marketData.import.summary.totalRows")}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{preview.validRows}</div>
                      <div className="text-muted-foreground text-sm">
                        {t("marketData.import.summary.valid")}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{preview.invalidRows}</div>
                      <div className="text-muted-foreground text-sm">
                        {t("marketData.import.summary.invalid")}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-600">
                        {preview.duplicateCount}
                      </div>
                      <div className="text-muted-foreground text-sm">
                        {t("marketData.import.summary.duplicates")}
                      </div>
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
                    {t("marketData.import.summary.importButton", { count: preview.validRows })}
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
            <h3 className="text-lg font-semibold">{t("marketData.import.section.title")}</h3>
            <p className="text-muted-foreground text-sm">
              {t("marketData.import.section.description")}
            </p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <QuoteImportHelpPopover />
          <Button variant="outline" size="sm" onClick={handleStartOver}>
            <Icons.Refresh className="mr-2 h-4 w-4" />
            {t("marketData.import.section.startOver")}
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
