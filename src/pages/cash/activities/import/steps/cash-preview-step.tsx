import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";
import { ProgressIndicator } from "@/components/ui/progress-indicator";
import type {
  Account,
  ActivityImport,
  Category,
  CategoryWithChildren,
  CsvRowData,
  Event,
} from "@/lib/types";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { ImportAlert } from "@/pages/activity/import/components/import-alert";
import { useCashImportMutations } from "../hooks/use-cash-import-mutations";
import { CashImportPreviewTable } from "../components/cash-import-preview-table";
import { useQuery } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import { getAccounts } from "@/commands/account";
import { getCategoriesHierarchical } from "@/commands/category";
import { getEvents } from "@/commands/event";

interface CashPreviewStepProps {
  data: CsvRowData[] | null;
  activities?: ActivityImport[];
  onNext: (processedActivities: ActivityImport[]) => void;
  onBack: () => void;
  onError?: () => void;
}

export const CashPreviewStep = ({
  data,
  activities = [],
  onNext,
  onBack,
  onError,
}: CashPreviewStepProps) => {
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmationState, setConfirmationState] = useState<"initial" | "confirm" | "processing">(
    "initial",
  );

  // Fetch accounts for filtering
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });

  // Fetch categories for display
  const { data: categories = [] } = useQuery<CategoryWithChildren[]>({
    queryKey: [QueryKeys.CATEGORIES_HIERARCHICAL],
    queryFn: getCategoriesHierarchical,
  });

  // Fetch events for display
  const { data: events = [] } = useQuery<Event[]>({
    queryKey: [QueryKeys.EVENTS],
    queryFn: getEvents,
  });

  // Create category map for lookup
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((cat) => {
      map.set(cat.id, cat);
      cat.children?.forEach((sub) => map.set(sub.id, sub));
    });
    return map;
  }, [categories]);

  // Create event map for lookup
  const eventMap = useMemo(() => {
    const map = new Map<string, Event>();
    events.forEach((event) => map.set(event.id, event));
    return map;
  }, [events]);

  const { confirmImportMutation } = useCashImportMutations({
    onSuccess: (processedActivities) => {
      setImportError(null);
      onNext(processedActivities as ActivityImport[]);
    },
    onError: (error) => {
      setImportError(
        typeof error === "string" ? error : "An error occurred while processing your import",
      );
      onError?.();
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

  const handleInitialClick = () => {
    setConfirmationState("confirm");
  };

  const handleConfirmClick = () => {
    const validActivities = activities.filter((activity) => activity.isValid);

    if (validActivities.length === 0) {
      setImportError("No valid activities to import");
      return;
    }

    setConfirmationState("processing");

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
          <CardContent className="overflow-hidden p-0">
            <CashImportPreviewTable
              activities={activities}
              accounts={accounts}
              categories={categories}
              categoryMap={categoryMap}
              events={events}
              eventMap={eventMap}
            />
          </CardContent>
        </Card>

        {/* Dialog for import progress */}
        <ProgressIndicator
          title="Import Progress"
          description="Please wait while the application processes your data."
          message="Processing Import..."
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
                    ? "Import Activities"
                    : `Import ${validActivitiesCount} Valid Activities`}
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
              className="w-full md:w-auto"
            >
              <motion.div variants={pulseVariants} animate="pulse">
                <Button
                  onClick={handleConfirmClick}
                  className="w-full bg-yellow-600 font-bold text-white shadow-md hover:bg-yellow-700"
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
              className="w-full md:w-auto"
            >
              <Button disabled className="bg-primary w-full font-medium shadow-md md:w-auto">
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
