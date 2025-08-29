import { AlertFeedback } from '@wealthfolio/ui';
import { ApplicationHeader } from '@/components/header';
import { Separator } from '@/components/ui/separator';
import React, {useState } from 'react';
import type { Account, ActivityImport, ImportMappingData } from '@/lib/types';
import { ImportHelpPopover } from './import-help';
import { StepIndicator } from './components/step-indicator';
import { AnimatePresence, motion } from 'framer-motion';
import { AccountSelectionStep } from './steps/account-selection-step';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useCsvParser } from './hooks/use-csv-parser';
import { validateActivityImport } from './utils/validation-utils';
import { MappingStep } from './steps/mapping-step';
import { DataPreviewStep } from './steps/preview-step';
import { ResultStep } from './steps/result-step';
import { logger } from '@/adapters';
import { useNavigate } from 'react-router-dom';
import { getAccounts } from '@/commands/account';
import { QueryKeys } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';

// Define the steps in the wizard
const STEPS = [
  { id: 1, title: 'Select Account & File' },
  { id: 2, title: 'Configure Mappings' },
  { id: 3, title: 'Preview & Import' },
  { id: 4, title: 'Import Results' },
];


const ActivityImportPage = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [activities, setActivities] = useState<ActivityImport[]>([]);
  const [processedActivities, setProcessedActivities] = useState<ActivityImport[]>([]);


  const { data: accountsData } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });
  const accounts = accountsData || [];

  
  // 1. CSV Parsing Hook - Focus on parsing and structure validation
  const { 
    headers, 
    data, 
    rawData,
    errors: parsingErrors, 
    isParsing, 
    selectedFile, 
    parseCsvFile, 
    resetParserStates 
  } = useCsvParser();

  // Reset the entire import process
  const resetImportProcess = () => {
    setCurrentStep(1);
    setProcessedActivities([]);
    setActivities([]);
    resetParserStates();
  };

  // Cancel import and navigate to activities page
  const cancelImport = () => {
    navigate('/activities');
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

  // Handle mapping completion from MappingStep
  const handleMappingComplete = async (mapping: ImportMappingData) => {
    if (!selectedAccount?.id || !data || data.length < 2) {
      logger.error('Missing account ID or CSV data');
      return;
    }

    try {
      // Validate data and store results
      const results = validateActivityImport(data, mapping, selectedAccount.id, selectedAccount.currency);

      // Update state with validated activities
      setActivities(results.activities);

      // Move to the next step
      goToNextStep();
    } catch (error) {
      logger.error(`Validation error: ${error}`);
    }
  };

  // Handle successful import with processed activities
  const handlePreviewComplete = (importedActivities: ActivityImport[]) => {
    setProcessedActivities(importedActivities);
    goToNextStep();
  };

  // Render the current step
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <AccountSelectionStep
            selectedAccount={selectedAccount}
            setSelectedAccount={setSelectedAccount}
            csvFile={selectedFile}
            setCsvFile={handleFileChange}
            isParsing={isParsing}
            errors={parsingErrors}
            onNext={goToNextStep}
            onBack={cancelImport}
            rawData={rawData}
          />
        );
      case 2:
        return (
          <MappingStep
            headers={headers}
            data={data}
            accounts={accounts}
            accountId={selectedAccount?.id}
            onNext={handleMappingComplete}
            onBack={goToPreviousStep}
          />
        );
      case 3:
        return (
          <DataPreviewStep
            data={data}
            headers={headers}
            accounts={accounts}
            activities={activities}
            onNext={handlePreviewComplete}
            onBack={goToPreviousStep}
          />
        );
      case 4:
        return (
          <ResultStep
            activities={processedActivities}
            accounts={accounts}
            onBack={goToPreviousStep}
            onReset={resetImportProcess}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col p-6">
      <ApplicationHeader heading="Import Activities">
        <ImportHelpPopover />
      </ApplicationHeader>
      <Separator className="my-4" />
      <ErrorBoundary>
        <div className="flex-1 overflow-auto px-4 pb-6 md:px-6">
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
      </ErrorBoundary>
    </div>
  );
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error(`Caught error: ${error}, errorInfo: ${errorInfo}`);
  }

  render() {
    if (this.state.hasError) {
      return <AlertFeedback variant="error" title="Something went wrong." />;
    }

    return this.props.children;
  }
}

export default ActivityImportPage;
