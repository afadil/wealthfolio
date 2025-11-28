import { logger } from "@/adapters";
import { getAccounts } from "@/commands/account";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { usePlatform } from "@/hooks/use-platform";
import { QueryKeys } from "@/lib/query-keys";
import type { Account, ActivityImport, CashImportMappingData, CashImportRow } from "@/lib/types";
import { AccountType } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { AlertFeedback, Page, PageContent, PageHeader } from "@wealthfolio/ui";
import { AnimatePresence, motion } from "motion/react";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { StepIndicator } from "@/pages/activity/import/components/step-indicator";
import { useCsvParser } from "@/pages/activity/import/hooks/use-csv-parser";
import { CashImportHelpPopover } from "./components/cash-import-help";
import { CashAccountSelectionStep } from "./steps/cash-account-selection-step";
import { CashMappingStep } from "./steps/cash-mapping-step";
import { CashImportEditStep } from "./steps/cash-import-edit-step";
import { CashPreviewStep } from "./steps/cash-preview-step";
import { CashResultStep } from "./steps/cash-result-step";
import { parseCsvToCashImportRows, convertCashImportRowToActivity } from "./utils/cash-validation-utils";

const STEPS = [
  { id: 1, title: "Select Account & File" },
  { id: 2, title: "Map Columns" },
  { id: 3, title: "Edit Transactions" },
  { id: 4, title: "Preview & Import" },
  { id: 5, title: "Import Results" },
];

function CashImportPage() {
  const navigate = useNavigate();
  const { isMobile } = usePlatform();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [importRows, setImportRows] = useState<CashImportRow[]>([]);
  const [processedActivities, setProcessedActivities] = useState<ActivityImport[]>([]);
  const [mappingData, setMappingData] = useState<CashImportMappingData | null>(null);

  const { data: accountsData } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });

  // Filter to only show CASH accounts
  const cashAccounts = (accountsData ?? []).filter((acc) => acc.accountType === AccountType.CASH);

  // Pre-select account from URL params
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const accountParam = urlParams.get("account");

    if (accountParam && cashAccounts.length > 0 && !selectedAccount) {
      const preSelectedAccount = cashAccounts.find((acc) => acc.id === accountParam);
      if (preSelectedAccount) {
        setSelectedAccount(preSelectedAccount);
      }
    }
  }, [cashAccounts, selectedAccount]);

  // CSV Parsing Hook
  const {
    headers,
    data,
    rawData,
    errors: parsingErrors,
    isParsing,
    selectedFile,
    parseCsvFile,
    resetParserStates,
  } = useCsvParser();

  // Reset the entire import process
  const resetImportProcess = () => {
    setCurrentStep(1);
    setProcessedActivities([]);
    setImportRows([]);
    setMappingData(null);
    resetParserStates();
  };

  // Cancel import and navigate to cash activities page
  const cancelImport = () => {
    navigate("/cash/activities");
  };

  // Handle file selection
  const handleFileChange = (file: File | null) => {
    if (file) {
      parseCsvFile(file);
    } else {
      resetParserStates();
    }
  };

  // Navigation functions
  const goToNextStep = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Handle mapping changes (persist state for back navigation)
  const handleMappingChange = (mapping: CashImportMappingData) => {
    setMappingData(mapping);
  };

  // Handle mapping completion from MappingStep
  const handleMappingComplete = (mapping: CashImportMappingData) => {
    if (!selectedAccount?.id || !data || data.length < 1) {
      logger.error("Missing account ID or CSV data");
      return;
    }

    try {
      // Save the mapping state
      setMappingData(mapping);

      // Parse CSV into CashImportRows for the rules step
      const rows = parseCsvToCashImportRows(data, mapping);
      setImportRows(rows);

      // Move to the rules step
      goToNextStep();
    } catch (error) {
      logger.error(`Parsing error: ${String(error)}`);
    }
  };

  // Handle edit step completion (combined rules + events)
  const handleEditComplete = (updatedRows: CashImportRow[]) => {
    setImportRows(updatedRows);
    goToNextStep();
  };

  // Handle successful import with processed activities
  const handlePreviewComplete = (importedActivities: ActivityImport[]) => {
    setProcessedActivities(importedActivities);
    goToNextStep();
  };

  // Create account currency map for accounts that may be used via CSV account mapping
  const accountCurrencyMap = React.useMemo(() => {
    const map = new Map<string, string>();
    cashAccounts.forEach((acc) => map.set(acc.id, acc.currency));
    return map;
  }, [cashAccounts]);

  // Convert CashImportRows to ActivityImport for preview/import
  const getActivitiesFromRows = (): ActivityImport[] => {
    if (!selectedAccount) return [];

    return importRows.map((row) =>
      convertCashImportRowToActivity(row, selectedAccount.id, selectedAccount.currency, accountCurrencyMap),
    );
  };

  // Render the current step
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <CashAccountSelectionStep
            selectedAccount={selectedAccount}
            setSelectedAccount={setSelectedAccount}
            csvFile={selectedFile}
            setCsvFile={handleFileChange}
            isParsing={isParsing}
            errors={parsingErrors}
            onNext={goToNextStep}
            onBack={cancelImport}
            rawData={rawData}
            accounts={cashAccounts}
          />
        );
      case 2:
        return (
          <CashMappingStep
            headers={headers}
            data={data}
            accountId={selectedAccount?.id}
            initialMapping={mappingData}
            onChange={handleMappingChange}
            onNext={handleMappingComplete}
            onBack={goToPreviousStep}
          />
        );
      case 3:
        return (
          <CashImportEditStep
            transactions={importRows}
            accountId={selectedAccount?.id || ""}
            accounts={cashAccounts}
            onNext={handleEditComplete}
            onBack={goToPreviousStep}
          />
        );
      case 4:
        return (
          <CashPreviewStep
            data={data}
            headers={headers}
            activities={getActivitiesFromRows()}
            onNext={handlePreviewComplete}
            onBack={goToPreviousStep}
          />
        );
      case 5:
        return (
          <CashResultStep
            activities={processedActivities}
            onBack={goToPreviousStep}
            onReset={resetImportProcess}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Page>
      <PageHeader
        heading="Import Cashflow Activity"
        onBack={isMobile ? () => navigate("/cash/activities") : undefined}
        actions={<CashImportHelpPopover />}
      />
      <PageContent withPadding={false}>
        <ErrorBoundary>
          <div className="px-2 pt-2 pb-6 sm:px-4 sm:pt-4 md:px-6 md:pt-6">
            <Card className="w-full">
              <CardHeader className="border-b px-3 py-3 sm:px-6 sm:py-4">
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
                    className="p-3 sm:p-6"
                  >
                    {renderStep()}
                  </motion.div>
                </AnimatePresence>
              </CardContent>
            </Card>
          </div>
        </ErrorBoundary>
      </PageContent>
    </Page>
  );
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }> {
  override state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error(`Caught error: ${error}, info: ${errorInfo.componentStack}`);
  }

  override render() {
    if (this.state.hasError) {
      return <AlertFeedback variant="error" title="Something went wrong." />;
    }

    return this.props.children;
  }
}

export default CashImportPage;
