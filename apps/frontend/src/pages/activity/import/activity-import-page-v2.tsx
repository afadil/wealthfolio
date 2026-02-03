import React, { useMemo, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@wealthfolio/ui/components/ui/card";
import { Button } from "@wealthfolio/ui/components/ui/button";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { AlertFeedback, Page, PageContent, PageHeader } from "@wealthfolio/ui";
import { AnimatePresence, motion } from "motion/react";
import { logger, getAccounts } from "@/adapters";
import { usePlatform } from "@/hooks/use-platform";
import { useQuery } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import type { Account } from "@/lib/types";
import { canImportCSV } from "@/lib/activity-restrictions";

// Context
import { ImportProvider, useImportContext, nextStep, prevStep, type ImportStep } from "./context";

// Components
import { WizardStepIndicator, type WizardStep } from "./components/wizard-step-indicator";
import { StepNavigation } from "./components/step-navigation";
import { CancelConfirmationDialog } from "./components/cancel-confirmation-dialog";
import { ImportHelpPopover } from "./import-help";

// Steps
import { UploadStep } from "./steps/upload-step";
import { MappingStepUnified } from "./steps/mapping-step-unified";
import { ReviewStep } from "./steps/review-step";
import { ConfirmStep } from "./steps/confirm-step";
import { ContextResultStep } from "./steps/context-result-step";

// Holdings Import Steps
import { HoldingsMappingStep, HoldingsFormat } from "./steps/holdings-mapping-step";
import { HoldingsReviewStep } from "./steps/holdings-review-step";
import { HoldingsConfirmStep } from "./steps/holdings-confirm-step";

// Constants
import { IMPORT_REQUIRED_FIELDS, ImportFormat, ActivityType } from "@/lib/constants";

// Activity types where symbol is optional (can be cash or asset-related)
const NO_SYMBOL_REQUIRED_ACTIVITY_TYPES = [
  ActivityType.DEPOSIT,
  ActivityType.WITHDRAWAL,
  ActivityType.FEE,
  ActivityType.TAX,
  ActivityType.INTEREST, // Can be cash interest or bond/asset interest
  ActivityType.TRANSFER_IN, // Can be cash or share transfer
  ActivityType.TRANSFER_OUT,
] as const;

// Smart defaults for activity type mapping (duplicated from mapping-step-v2 for validation)
const ACTIVITY_TYPE_SMART_DEFAULTS: Record<string, string> = {
  BUY: ActivityType.BUY,
  PURCHASE: ActivityType.BUY,
  BOUGHT: ActivityType.BUY,
  SELL: ActivityType.SELL,
  SOLD: ActivityType.SELL,
  DIVIDEND: ActivityType.DIVIDEND,
  DIV: ActivityType.DIVIDEND,
  DEPOSIT: ActivityType.DEPOSIT,
  WITHDRAWAL: ActivityType.WITHDRAWAL,
  WITHDRAW: ActivityType.WITHDRAWAL,
  FEE: ActivityType.FEE,
  TAX: ActivityType.TAX,
  TRANSFER_IN: ActivityType.TRANSFER_IN,
  TRANSFER: ActivityType.TRANSFER_IN,
  TRANSFER_OUT: ActivityType.TRANSFER_OUT,
  INTEREST: ActivityType.INTEREST,
  INT: ActivityType.INTEREST,
  SPLIT: ActivityType.SPLIT,
  CREDIT: ActivityType.CREDIT,
  ADJUSTMENT: ActivityType.ADJUSTMENT,
};

// ─────────────────────────────────────────────────────────────────────────────
// Step Configuration
// ─────────────────────────────────────────────────────────────────────────────

const STEPS: WizardStep[] = [
  { id: "upload", label: "Upload" },
  { id: "mapping", label: "Mapping" },
  { id: "review", label: "Review" },
  { id: "confirm", label: "Confirm" },
  { id: "result", label: "Result" },
];

const STEP_COMPONENTS: Record<ImportStep, React.ComponentType> = {
  upload: UploadStep,
  mapping: MappingStepUnified,
  review: ReviewStep,
  confirm: ConfirmStep,
  result: ContextResultStep,
};

// Holdings import steps (for HOLDINGS-mode accounts)
const HOLDINGS_STEP_COMPONENTS: Record<ImportStep, React.ComponentType> = {
  upload: UploadStep, // Same upload step
  mapping: HoldingsMappingStep,
  review: HoldingsReviewStep,
  confirm: HoldingsConfirmStep,
  result: ContextResultStep, // Same result step
};

const HOLDINGS_STEPS: WizardStep[] = [
  { id: "upload", label: "Upload" },
  { id: "mapping", label: "Mapping" },
  { id: "review", label: "Review" },
  { id: "confirm", label: "Confirm" },
  { id: "result", label: "Result" },
];

// Holdings import required fields
const HOLDINGS_REQUIRED_FIELDS: HoldingsFormat[] = [
  HoldingsFormat.DATE,
  HoldingsFormat.SYMBOL,
  HoldingsFormat.QUANTITY,
];

// ─────────────────────────────────────────────────────────────────────────────
// Validation Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the mapped activity type for a CSV value (explicit mapping or smart default)
 * Returns null if no mapping found
 */
function findMappedActivityType(
  csvValue: string,
  activityMappings: Record<string, string[]>,
): string | null {
  const normalized = csvValue.trim().toUpperCase();

  // Check explicit mappings first
  for (const [activityType, csvValues] of Object.entries(activityMappings)) {
    if (csvValues?.some((v) => normalized.startsWith(v.trim().toUpperCase()))) {
      return activityType;
    }
  }

  // Check smart defaults - exact match
  if (ACTIVITY_TYPE_SMART_DEFAULTS[normalized]) {
    return ACTIVITY_TYPE_SMART_DEFAULTS[normalized];
  }

  // Check smart defaults - partial match
  for (const [key, value] of Object.entries(ACTIVITY_TYPE_SMART_DEFAULTS)) {
    if (normalized.startsWith(key) || normalized.includes(key)) {
      return value;
    }
  }

  return null;
}

/**
 * Check if an activity type value has a mapping (explicit or smart default)
 */
function hasActivityTypeMapping(
  csvValue: string,
  activityMappings: Record<string, string[]>,
): boolean {
  return findMappedActivityType(csvValue, activityMappings) !== null;
}

/**
 * Check if a symbol is resolved (valid format or has explicit mapping)
 */
function isSymbolResolved(csvSymbol: string, symbolMappings: Record<string, string>): boolean {
  // Has explicit mapping
  if (symbolMappings[csvSymbol]) {
    return true;
  }
  // Valid symbol format (1-10 alphanumeric chars, optionally with dots/hyphens)
  const isValidFormat = /^[A-Z0-9]{1,10}([.-][A-Z0-9]+){0,2}$/.test(csvSymbol.trim());
  return isValidFormat;
}

/**
 * Check if a step can proceed to the next step (for activity import)
 */
function useStepValidation(isHoldingsMode: boolean) {
  const { state } = useImportContext();

  return useMemo(() => {
    const { step, file, headers, parsedRows, mapping, draftActivities } = state;

    switch (step) {
      case "upload":
        // Can proceed if file is uploaded and parsed successfully
        return file !== null && headers.length > 0 && parsedRows.length > 0;

      case "mapping": {
        if (isHoldingsMode) {
          // Holdings mode: check if required holdings fields are mapped
          if (!mapping) return false;
          const requiredFieldsMapped = HOLDINGS_REQUIRED_FIELDS.every(
            (field) =>
              mapping.fieldMappings[field] && headers.includes(mapping.fieldMappings[field]),
          );
          return requiredFieldsMapped;
        }

        // Activity mode: existing validation logic
        if (!mapping) return false;
        const requiredFieldsMapped = IMPORT_REQUIRED_FIELDS.every(
          (field) => mapping.fieldMappings[field],
        );
        if (!requiredFieldsMapped) return false;

        // Check if all activity types have mappings
        const activityTypeColumn = mapping.fieldMappings[ImportFormat.ACTIVITY_TYPE];
        if (activityTypeColumn) {
          const headerIndex = headers.indexOf(activityTypeColumn);
          if (headerIndex !== -1) {
            // Get unique activity type values from data
            const uniqueValues = new Set<string>();
            parsedRows.forEach((row) => {
              const value = row[headerIndex]?.trim();
              if (value) uniqueValues.add(value);
            });

            // Check if any values are unmapped
            for (const value of uniqueValues) {
              if (!hasActivityTypeMapping(value, mapping.activityMappings || {})) {
                return false;
              }
            }
          }
        }

        // Check if all symbols are resolved (only for non-cash activities)
        const symbolColumn = mapping.fieldMappings[ImportFormat.SYMBOL];
        const activityTypeCol = mapping.fieldMappings[ImportFormat.ACTIVITY_TYPE];
        if (symbolColumn) {
          const symbolHeaderIndex = headers.indexOf(symbolColumn);
          const activityHeaderIndex = activityTypeCol ? headers.indexOf(activityTypeCol) : -1;

          if (symbolHeaderIndex !== -1) {
            // Get unique symbol values from activities that require symbols
            const symbolsNeedingResolution = new Set<string>();

            parsedRows.forEach((row) => {
              const symbol = row[symbolHeaderIndex]?.trim();
              if (!symbol) return;

              // Determine if this row's activity type requires a symbol
              let requiresSymbol = true;
              if (activityHeaderIndex !== -1) {
                const csvActivityType = row[activityHeaderIndex]?.trim();
                if (csvActivityType) {
                  // Find the mapped activity type (explicit or smart default)
                  const mappedType = findMappedActivityType(
                    csvActivityType,
                    mapping.activityMappings || {},
                  );

                  if (
                    mappedType &&
                    (NO_SYMBOL_REQUIRED_ACTIVITY_TYPES as readonly string[]).includes(mappedType)
                  ) {
                    requiresSymbol = false;
                  }
                }
              }

              // Only require symbol resolution for activities that need symbols
              if (requiresSymbol) {
                symbolsNeedingResolution.add(symbol);
              }
            });

            // Check if any non-cash symbols are unresolved
            for (const symbol of symbolsNeedingResolution) {
              if (!isSymbolResolved(symbol, mapping.symbolMappings || {})) {
                return false;
              }
            }
          }
        }

        return true;
      }

      case "review":
        if (isHoldingsMode) {
          // Holdings mode: can proceed if we have parsed rows
          return parsedRows.length > 0;
        }
        // Activity mode: can proceed if there are activities to review
        return draftActivities.length > 0;

      case "confirm":
        // This step handles its own navigation via the import button
        return false;

      case "result":
        // Final step, no next
        return false;

      default:
        return false;
    }
  }, [state, isHoldingsMode]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Wizard Content Component
// ─────────────────────────────────────────────────────────────────────────────

function ImportWizardContent() {
  const { state, dispatch } = useImportContext();
  const navigate = useNavigate();
  const { isMobile } = usePlatform();

  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Fetch accounts to determine tracking mode based on selected account
  const { data: accounts } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: () => getAccounts(),
  });

  // Determine if the selected account is in HOLDINGS mode
  const selectedAccount = useMemo(() => {
    if (!state.accountId || !accounts) return undefined;
    return accounts.find((a: Account) => a.id === state.accountId);
  }, [state.accountId, accounts]);

  const isHoldingsMode = useMemo(() => {
    return selectedAccount?.trackingMode === "HOLDINGS";
  }, [selectedAccount]);

  const isCsvImportAllowed = canImportCSV(selectedAccount);

  const canProceed = useStepValidation(isHoldingsMode);

  // Select the appropriate steps and components based on mode
  const steps = isHoldingsMode ? HOLDINGS_STEPS : STEPS;
  const stepComponents = isHoldingsMode ? HOLDINGS_STEP_COMPONENTS : STEP_COMPONENTS;

  // Step navigation
  const currentStepIndex = useMemo(
    () => steps.findIndex((s) => s.id === state.step),
    [state.step, steps],
  );

  const canGoBack = currentStepIndex > 0 && state.step !== "result";
  const canGoNext = canProceed;

  // Show navigation buttons only on certain steps
  // ConfirmStep and ResultStep handle their own navigation
  const showNavigation = !["confirm", "result"].includes(state.step);

  // Get current step component
  const CurrentStepComponent = stepComponents[state.step];

  // Handlers
  const handleNext = useCallback(() => {
    if (canGoNext) {
      dispatch(nextStep());
    }
  }, [dispatch, canGoNext]);

  const handleBack = useCallback(() => {
    if (canGoBack) {
      dispatch(prevStep());
    }
  }, [dispatch, canGoBack]);

  const handleCancelClick = useCallback(() => {
    // On first step or result step, just navigate back without confirmation
    if (state.step === "upload" || state.step === "result") {
      navigate(-1);
    } else {
      // Show confirmation dialog for other steps
      setShowCancelDialog(true);
    }
  }, [state.step, navigate]);

  const handleConfirmCancel = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Get step-specific next button label
  const getNextLabel = useCallback(() => {
    switch (state.step) {
      case "upload":
        return "Configure Mapping";
      case "mapping":
        return isHoldingsMode ? "Review Holdings" : "Review Activities";
      case "review":
        return "Continue to Import";
      default:
        return "Continue";
    }
  }, [state.step, isHoldingsMode]);

  // Page title
  const pageTitle = isHoldingsMode ? "Import Holdings" : "Import Activities";

  if (selectedAccount && !isCsvImportAllowed) {
    return (
      <Page>
        <PageHeader heading={pageTitle} onBack={() => navigate(-1)} />
        <PageContent>
          <div className="mx-auto max-w-3xl space-y-4 py-6">
            <AlertFeedback variant="warning" title="CSV import disabled">
              Holdings CSV import is disabled for connected accounts using Holdings tracking.
            </AlertFeedback>
            <Button variant="outline" onClick={() => navigate(`/account/${selectedAccount.id}`)}>
              Go to Account
            </Button>
          </div>
        </PageContent>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        heading={pageTitle}
        onBack={isMobile ? handleCancelClick : undefined}
        actions={
          <div className="flex items-center gap-2">
            {!isHoldingsMode && <ImportHelpPopover />}
            {!isMobile && (
              <Button variant="ghost" size="sm" onClick={handleCancelClick}>
                <Icons.X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        }
      />

      <PageContent withPadding={false}>
        <ErrorBoundary>
          <div className="px-2 pb-6 pt-2 sm:px-4 sm:pt-4 md:px-6 md:pt-6">
            <Card className="w-full">
              {/* Step indicator */}
              <CardHeader className="border-b px-3 py-3 sm:px-6 sm:py-4">
                <WizardStepIndicator steps={steps} currentStep={state.step} />
              </CardHeader>

              {/* Step content */}
              <CardContent className="overflow-hidden p-0">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={state.step}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="p-3 sm:p-6"
                  >
                    <CurrentStepComponent />

                    {/* Navigation buttons */}
                    {showNavigation && (
                      <div className="mt-6">
                        <StepNavigation
                          onNext={handleNext}
                          onBack={handleBack}
                          canGoBack={canGoBack}
                          canGoNext={canGoNext}
                          nextLabel={getNextLabel()}
                        />
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </CardContent>
            </Card>
          </div>
        </ErrorBoundary>
      </PageContent>

      {/* Cancel confirmation dialog */}
      <CancelConfirmationDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        onConfirm={handleConfirmCancel}
      />
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Boundary
// ─────────────────────────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
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

// ─────────────────────────────────────────────────────────────────────────────
// Main Export
// ─────────────────────────────────────────────────────────────────────────────

export function ActivityImportPageV2() {
  const [searchParams] = useSearchParams();
  const accountId = searchParams.get("account") || "";

  return (
    <ImportProvider initialAccountId={accountId}>
      <ImportWizardContent />
    </ImportProvider>
  );
}

export default ActivityImportPageV2;
