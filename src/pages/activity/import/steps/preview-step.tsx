import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ActivityImport, CsvRowData } from '@/lib/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CSVFileViewer } from '../components/csv-file-viewer';
import { ImportPreviewTable } from '../import-preview-table';
import { ImportAlert } from '../components/import-alert';
import { useActivityImportMutations } from '../hooks/useActivityImportMutations';
import { Icons } from '@/components/icons';
import { ImportProgressIndicator } from '../components/progress-indicator';
import { motion, AnimatePresence } from 'framer-motion';

interface DataPreviewStepProps {
  data: CsvRowData[] | null;
  headers: string[];
  activities?: ActivityImport[];
  onNext: (processedActivities: ActivityImport[]) => void;
  onBack: () => void;
  onError?: () => void;
}

export const DataPreviewStep = ({
  headers,
  data,
  activities = [],
  onNext,
  onBack,
  onError,
}: DataPreviewStepProps) => {
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmationState, setConfirmationState] = useState<'initial' | 'confirm' | 'processing'>('initial');

  const { confirmImportMutation } = useActivityImportMutations({
    onSuccess: (processedActivities) => {
      setImportError(null);
      onNext(processedActivities);
    },
    onError: (error) => {
      setImportError(
        typeof error === 'string' ? error : 'An error occurred while processing your import',
      );
      onError && onError(); // Notify parent of the error
      setConfirmationState('initial');
    },
  });

  const isProcessing = confirmImportMutation.isPending;

  // Handle automatic cleanup and navigation after import completes
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (confirmImportMutation.isSuccess || confirmImportMutation.isError) {
      timer = setTimeout(() => {
        if (confirmImportMutation.isSuccess) {
          onNext(confirmImportMutation.data || []);
        }
        confirmImportMutation.reset();
        setConfirmationState('initial');
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
    onNext,
  ]);

  if (importError) {
    return (
      <ImportAlert variant="destructive" title="Import Error" description={importError}>
        <div className="mt-4">
          <Button variant="destructive" onClick={() => setImportError(null)} size="sm">
            Try Again
          </Button>
        </div>
      </ImportAlert>
    );
  }

  if (!data) {
    return (
      <ImportAlert
        variant="destructive"
        title="No Data Available"
        description="No CSV data available. Please go back and upload a valid file."
      >
        <div className="mt-4">
          <Button variant="destructive" onClick={onBack} size="sm">
            Go Back
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
      content: headers.join(','),
      isValid: true,
      errors: undefined,
    },
    // Add data rows
    ...data.map((row, index) => ({
      id: index + 1, // Add 1 to account for header row
      content: headers.map((header) => row[header] || '').join(','),
      isValid: !csvErrors[index + 2], // Line numbers start at 2 for data rows (header is line 1)
      errors: csvErrors[index + 2], // Line numbers start at 2 for data rows
    })),
  ];

  const handleInitialClick = () => {
    setConfirmationState('confirm');
  };

  const handleConfirmClick = () => {
    // Filter only valid activities for import
    const validActivities = activities.filter((activity) => activity.isValid);

    if (validActivities.length === 0) {
      setImportError('No valid activities to import');
      return;
    }

    setConfirmationState('processing');
    
    // Ensure we have a single transaction for data integrity
    confirmImportMutation.mutate({
      activities: validActivities,
    });
  };

  const handleCancelConfirmation = () => {
    setConfirmationState('initial');
  };

  // Button animation variants
  const buttonVariants = {
    initial: { scale: 1 },
    hover: { scale: 1.01 },
    tap: { scale: 0.99 },
  };


  // Pulse animation variants
  const pulseVariants = {
    pulse: {
      scale: [1, 1.015, 1],
      transition: {
        duration: 2,
        repeat: Infinity,
        repeatType: "loop" as const,
        ease: "easeInOut",
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
              title={`There are issues with ${activities.length - validActivitiesCount} of ${activities.length} activities`}
              description="Please review the errors below. You can either go back to fix the issues or proceed with only the valid entries."
            />
          ) : (
            <ImportAlert
              variant="success"
              title={`All ${activities.length} activities are valid`}
              description="Your data is ready to be imported."
            />
          )}
        </div>

        <Card className="border-none shadow-none">
          <Tabs defaultValue="preview" className="w-full">
            <div className="relative mb-2">
              <TabsList className="absolute right-0 top-3 z-50 flex space-x-1 rounded-full bg-secondary p-1">
                <TabsTrigger
                  className="h-8 rounded-full px-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:hover:bg-primary/90"
                  value="preview"
                >
                  Activity Preview
                </TabsTrigger>
                <TabsTrigger
                  className="h-8 rounded-full px-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:hover:bg-primary/90"
                  value="raw"
                >
                  File Preview
                </TabsTrigger>
              </TabsList>
            </div>
            <CardContent className="overflow-hidden p-0 pt-5">
              <TabsContent value="preview" className="m-0 overflow-x-auto">
                <ImportPreviewTable activities={activities} />
              </TabsContent>
              <TabsContent value="raw" className="m-0 overflow-x-auto">
                <div className="space-y-2">
                  <CSVFileViewer
                    data={csvLines}
                    className="w-full"
                    maxHeight="40vh"
                  />
                </div>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        {/* Dialog for import progress */}
        <ImportProgressIndicator isLoading={isProcessing} open={isProcessing} />
      </div>

      <div className="flex justify-between pt-4">
        <motion.div whileHover="hover" whileTap="tap" variants={buttonVariants}>
          <Button 
            variant="outline" 
            onClick={confirmationState === 'confirm' ? handleCancelConfirmation : onBack} 
            disabled={isProcessing}
          >
            {confirmationState === 'confirm' ? (
              <>
                <Icons.XCircle className="mr-2 h-4 w-4" />
                Cancel
              </>
            ) : (
              <>
                <Icons.ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </>
            )}
          </Button>
        </motion.div>

        <AnimatePresence mode="wait">
          {confirmationState === 'initial' ? (
            <motion.div 
              key="initial" 
              whileHover="hover" 
              whileTap="tap" 
              variants={buttonVariants}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                onClick={handleInitialClick}
                disabled={activities.length === 0 || validActivitiesCount === 0 || isProcessing}
              >
                <div className="relative flex items-center">
                  {validActivitiesCount === activities.length
                    ? 'Import Activities'
                    : `Import ${validActivitiesCount} Valid Activities`}
                  <Icons.ArrowRight className="ml-2 h-4 w-4" />
                </div>
              </Button>
            </motion.div>
          ) : confirmationState === 'confirm' ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              onMouseLeave={() => {
                setConfirmationState('initial');
              }}
              onMouseEnter={() => {}}
            >
              <motion.div
                variants={pulseVariants}
                animate="pulse"
              >
                <Button
                  onClick={handleConfirmClick}
                  className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold shadow-md"
                >
                  <Icons.AlertTriangle className="mr-2 h-4 w-4" />
                  Confirm importing {validActivitiesCount} activities
                </Button>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Button
                disabled
                className="bg-primary font-medium shadow-md"
              >
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
                Importing Activities...
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
