import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { ProgressIndicator } from "@/components/ui/progress-indicator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Account, ActivityImport, CsvRowData } from "@/lib/types";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CSVFileViewer } from "../components/csv-file-viewer";
import { ImportAlert } from "../components/import-alert";
import { useActivityImportMutations } from "../hooks/use-activity-import-mutations";
import { ImportPreviewTable } from "../import-preview-table";

interface DataPreviewStepProps {
  data: CsvRowData[] | null;
  headers: string[];
  activities?: ActivityImport[];
  accounts: Account[];
  onNext: (processedActivities: ActivityImport[]) => void;
  onBack: () => void;
  onError?: () => void;
}

export const DataPreviewStep = ({
  headers,
  data,
  accounts,
  activities = [],
  onNext,
  onBack,
  onError,
}: DataPreviewStepProps) => {
  const { t } = useTranslation("activity");
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmationState, setConfirmationState] = useState<"initial" | "confirm" | "processing">(
    "initial",
  );

  const { confirmImportMutation } = useActivityImportMutations({
    onSuccess: (processedActivities) => {
      setImportError(null);
      onNext(processedActivities as ActivityImport[]);
    },
    onError: (error) => {
      setImportError(typeof error === "string" ? error : t("import.error.errorOccurred"));
      onError?.(); // Notify parent of the error
      setConfirmationState("initial");
    },
  });

  const isProcessing = confirmImportMutation.isPending;

  // Handle automatic cleanup and navigation after import completes
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (confirmImportMutation.isSuccess || confirmImportMutation.isError) {
      timer = setTimeout(() => {
        if (confirmImportMutation.isSuccess) {
          onNext((confirmImportMutation.data as ActivityImport[]) || []);
        }
        confirmImportMutation.reset();
        setConfirmationState("initial");
      }, 2000);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [
    confirmImportMutation.isSuccess,
    confirmImportMutation.isError,
    confirmImportMutation.data,
    confirmImportMutation.reset,
    confirmImportMutation,
    onNext,
  ]);

  if (importError) {
    return (
      <ImportAlert
        variant="destructive"
        title={t("import.preview.importError")}
        description={importError}
      >
        <div className="mt-4">
          <Button variant="destructive" onClick={() => setImportError(null)} size="sm">
            {t("import.preview.tryAgain")}
          </Button>
        </div>
      </ImportAlert>
    );
  }

  if (!data) {
    return (
      <ImportAlert
        variant="destructive"
        title={t("import.preview.noDataAvailable")}
        description={t("import.preview.noDataDesc")}
      >
        <div className="mt-4">
          <Button variant="destructive" onClick={onBack} size="sm">
            {t("import.preview.goBack")}
          </Button>
        </div>
      </ImportAlert>
    );
  }

  // Calculate summary statistics
  const validActivitiesCount = activities.filter((activity) => activity.isValid).length;
  const hasErrors = validActivitiesCount < activities.length;

  // Extract error information from activities with validation issues using filter and map
  const csvErrors: Record<number, string[]> = Object.fromEntries(
    activities
      .filter((activity) => !activity.isValid)
      .map((activity) => {
        // Use lineNumber if available, or fall back to index + 1 (accounting for header row)
        const rowIndex = activity.lineNumber;
        const errorMessages = Object.values(activity.errors!)
          .flat()
          .filter((message) => message);

        return [rowIndex, errorMessages] as [number, string[]];
      })
      .filter(([_, messages]) => messages.length > 0),
  );

  // Prepare CSV data directly in the format required by CSVFileViewer
  const csvLines = [
    // Add header row
    {
      id: 0,
      content: headers.join(","),
      isValid: true,
      errors: undefined,
    },
    // Add data rows
    ...data.map((row, index) => ({
      id: index + 1, // Add 1 to account for header row
      content: headers.map((header) => row[header] || "").join(","),
      isValid: !csvErrors[index + 2], // Line numbers start at 2 for data rows (header is line 1)
      errors: csvErrors[index + 2], // Line numbers start at 2 for data rows
    })),
  ];

  const handleInitialClick = () => {
    setConfirmationState("confirm");
  };

  const handleConfirmClick = () => {
    // Filter only valid activities for import
    const validActivities = activities.filter((activity) => activity.isValid);

    if (validActivities.length === 0) {
      setImportError(t("import.error.noValidActivities"));
      return;
    }

    setConfirmationState("processing");

    // Ensure we have a single transaction for data integrity
    confirmImportMutation.mutate({
      activities: validActivities,
    });
  };

  const handleCancelConfirmation = () => {
    setConfirmationState("initial");
  };

  // Button animation variants
  const buttonVariants = {
    initial: { scale: 1 },
    hover: { scale: 1.01 },
    tap: { scale: 0.99 },
  } as const;

  // Pulse animation variants
  const pulseVariants = {
    pulse: {
      scale: [1, 1.015, 1] as number[],
      transition: {
        duration: 2,
        repeat: Infinity,
        repeatType: "loop" as const,
        ease: [0.42, 0, 0.58, 1] as [number, number, number, number],
      },
    },
  };

  return (
    <div className="m-0 flex h-full flex-col p-0">
      <div>
        <div className="mb-4">
          {hasErrors ? (
            <ImportAlert
              variant="warning"
              title={t("import.preview.issuesWithActivities", {
                count: activities.length - validActivitiesCount,
                total: activities.length,
              })}
              description={t("import.preview.issuesDesc")}
            />
          ) : (
            <ImportAlert
              variant="success"
              title={t("import.preview.allActivitiesValid", { count: activities.length })}
              description={t("import.preview.allActivitiesValidDesc")}
            />
          )}
        </div>

        <Card className="border-none shadow-none">
          <Tabs defaultValue="preview" className="w-full">
            <div className="relative mb-2">
              <TabsList className="bg-secondary absolute -top-5 right-0 z-50 flex space-x-1 rounded-full p-1 md:top-3">
                <TabsTrigger
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary data-[state=active]:hover:bg-primary/90 h-8 rounded-full px-2 text-sm"
                  value="preview"
                >
                  {t("import.preview.activityPreview")}
                </TabsTrigger>
                <TabsTrigger
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary data-[state=active]:hover:bg-primary/90 h-8 rounded-full px-2 text-sm"
                  value="raw"
                >
                  {t("import.preview.filePreview")}
                </TabsTrigger>
              </TabsList>
            </div>
            <CardContent className="overflow-hidden p-0 pt-5">
              <TabsContent value="preview" className="m-0 overflow-x-auto">
                <ImportPreviewTable activities={activities} accounts={accounts} />
              </TabsContent>
              <TabsContent value="raw" className="m-0 overflow-x-auto">
                <div className="space-y-2">
                  <CSVFileViewer data={csvLines} className="w-full" maxHeight="40vh" />
                </div>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        {/* Dialog for import progress */}
        <ProgressIndicator
          title={t("import.preview.importProgress")}
          description={t("import.preview.importProgressDesc")}
          message={t("import.preview.processingImport")}
          isLoading={isProcessing}
          open={isProcessing}
        />
      </div>

      <div className="flex flex-col-reverse justify-between gap-3 pt-4 md:flex-row">
        <motion.div
          whileHover="hover"
          whileTap="tap"
          variants={buttonVariants}
          className="w-full md:w-auto"
        >
          <Button
            variant="outline"
            onClick={confirmationState === "confirm" ? handleCancelConfirmation : onBack}
            disabled={isProcessing}
            className="w-full md:w-auto"
          >
            {confirmationState === "confirm" ? (
              <>
                <Icons.XCircle className="mr-2 h-4 w-4" />
                {t("import.preview.cancel")}
              </>
            ) : (
              <>
                <Icons.ArrowLeft className="mr-2 h-4 w-4" />
                {t("import.preview.back")}
              </>
            )}
          </Button>
        </motion.div>

        <AnimatePresence mode="wait">
          {confirmationState === "initial" ? (
            <motion.div
              key="initial"
              whileHover="hover"
              whileTap="tap"
              variants={buttonVariants}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="w-full md:w-auto"
            >
              <Button
                onClick={handleInitialClick}
                disabled={activities.length === 0 || validActivitiesCount === 0 || isProcessing}
                className="w-full md:w-auto"
              >
                <div className="relative flex items-center">
                  {validActivitiesCount === activities.length
                    ? t("import.preview.importActivities")
                    : t("import.preview.importValidActivities", { count: validActivitiesCount })}
                  <Icons.ArrowRight className="ml-2 h-4 w-4" />
                </div>
              </Button>
            </motion.div>
          ) : confirmationState === "confirm" ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              onMouseLeave={() => {
                setConfirmationState("initial");
              }}
              onMouseEnter={() => {}}
              className="w-full md:w-auto"
            >
              <motion.div variants={pulseVariants} animate="pulse">
                <Button
                  onClick={handleConfirmClick}
                  className="w-full bg-yellow-600 font-bold text-white shadow-md hover:bg-yellow-700"
                >
                  <Icons.AlertTriangle className="mr-2 h-4 w-4" />
                  {t("import.preview.confirmImporting", { count: validActivitiesCount })}
                </Button>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full md:w-auto"
            >
              <Button disabled className="bg-primary w-full font-medium shadow-md md:w-auto">
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                {t("import.preview.importingActivities")}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
