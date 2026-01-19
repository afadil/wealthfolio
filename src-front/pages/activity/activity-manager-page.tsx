import { getAccounts } from "@/commands/account";
import { useIsMobileViewport } from "@/hooks/use-platform";
import { ActivityType } from "@/lib/constants";
import { QueryKeys } from "@/lib/query-keys";
import type { Account, ActivityDetails } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Icons,
  Page,
  PageContent,
  PageHeader,
} from "@wealthfolio/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { AccountSelectOption } from "./components/forms/fields";
import {
  ActivityTypePicker,
  type ActivityType as PickerActivityType,
} from "./components/activity-type-picker";
import { ActivityFormRenderer } from "./components/activity-form-renderer";
import { MobileActivityForm } from "./components/mobile-forms/mobile-activity-form";
import { useActivityForm } from "./hooks/use-activity-form";
import { mapActivityTypeToPicker } from "./utils/activity-form-utils";

const ActivityManagerPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobileViewport = useIsMobileViewport();

  // Parse URL parameters
  const typeParam = searchParams.get("type") as ActivityType | null;
  const accountParam = searchParams.get("account");
  const symbolParam = searchParams.get("symbol");
  const redirectTo = searchParams.get("redirect-to");

  const { data: accountsData } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });

  // Prepare account options for the form
  const accountOptions: AccountSelectOption[] = useMemo(
    () =>
      (accountsData ?? [])
        .filter((acc) => acc.isActive)
        .map((account) => ({
          value: account.id,
          label: account.name,
          currency: account.currency,
        })),
    [accountsData],
  );

  const handleClose = useCallback(() => {
    if (redirectTo) {
      navigate(redirectTo);
      return;
    }
    navigate(-1);
  }, [navigate, redirectTo]);

  // Get the account name if pre-selected
  const selectedAccountName = useMemo(() => {
    if (accountParam && accountsData) {
      const account = accountsData.find((acc) => acc.id === accountParam);
      return account?.name;
    }
    return null;
  }, [accountParam, accountsData]);

  // Build initial activity from URL params
  const initialActivity: Partial<ActivityDetails> = useMemo(() => {
    const activity: Partial<ActivityDetails> = {};

    if (typeParam) {
      activity.activityType = typeParam;
    }

    if (accountParam) {
      activity.accountId = accountParam;
    }

    if (symbolParam) {
      activity.assetId = symbolParam;
    }

    return activity;
  }, [typeParam, accountParam, symbolParam]);

  const [selectedType, setSelectedType] = useState<PickerActivityType | undefined>(
    mapActivityTypeToPicker(typeParam),
  );

  // Update selected type when URL param changes
  useEffect(() => {
    setSelectedType(mapActivityTypeToPicker(typeParam));
  }, [typeParam]);

  // Use the activity form hook
  const { defaultValues, isEditing, isLoading, isError, error, handleSubmit } = useActivityForm({
    accounts: accountOptions,
    activity: initialActivity,
    selectedType,
    onSuccess: handleClose,
  });

  // For mobile, use the existing mobile form component
  if (isMobileViewport) {
    return (
      <Page>
        <PageHeader
          heading="Add Activity"
          text={
            selectedAccountName
              ? `Add a new transaction to ${selectedAccountName}`
              : "Create a new transaction or activity for your account"
          }
          onBack={handleClose}
        />
        <PageContent>
          <MobileActivityForm
            key={initialActivity?.id ?? "new"}
            accounts={accountOptions}
            activity={initialActivity}
            open={true}
            onClose={handleClose}
          />
        </PageContent>
      </Page>
    );
  }

  // Desktop inline form with activity type picker
  return (
    <Page>
      <PageHeader
        heading="Add Activity"
        text={
          selectedAccountName
            ? `Add a new transaction to ${selectedAccountName}`
            : "Create a new transaction or activity for your account"
        }
        onBack={handleClose}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <a
              href="https://wealthfolio.app/docs/concepts/activity-types"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5"
            >
              <Icons.HelpCircle className="h-4 w-4" />
              Learn more
            </a>
          </Button>
        }
      />
      <PageContent>
        <div className="mx-auto max-w-5xl">
          <Card>
            <CardContent className="space-y-6 p-6">
              {/* Activity Type Picker */}
              {!isEditing && (
                <ActivityTypePicker value={selectedType} onSelect={setSelectedType} />
              )}

              {/* When editing, show the activity type as a badge */}
              {isEditing && selectedType && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Activity Type:</span>
                  <span className="rounded-md bg-primary/10 px-2 py-1 font-medium text-primary">
                    {selectedType}
                  </span>
                </div>
              )}

              {/* Render the appropriate form */}
              <ActivityFormRenderer
                selectedType={selectedType}
                accounts={accountOptions}
                defaultValues={defaultValues}
                onSubmit={handleSubmit}
                onCancel={handleClose}
                isLoading={isLoading}
                isEditing={isEditing}
              />

              {/* Display mutation error */}
              {isError && (
                <Alert variant="destructive">
                  <Icons.AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{String(error)}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </Page>
  );
};

export default ActivityManagerPage;
