import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import { z } from 'zod';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { Link } from 'react-router-dom';
import { Account, ActivityType, ActivityImport, ImportFormat, ImportFormSchema } from '@/lib/types';
import { getAccountImportMapping, saveAccountImportMapping } from '@/commands/activity-import';
import { useActivityImportMutations } from './hooks/useActivityImportMutations';

// Components
import { FileDropzone } from './components/file-dropzone';
import { importFormSchema } from '@/lib/schemas';
import { ImportPreviewTable } from './components/import-preview-table';
import { QueryKeys } from '@/lib/query-keys';
import { getAccounts } from '@/commands/account';
import { ErrorViewer } from './components/csv-error-viewer';

import { useCsvParser } from './hooks/useCsvParser';
import { useImportMapping } from './hooks/useImportMapping';
import { isImportMapComplete } from './utils/csvValidation';
import { validateActivities } from './utils/csvValidation';

export function ActivityImportForm({
  onSuccess,
  onError,
}: {
  onSuccess: (activities: ActivityImport[]) => void;
  onError: (error: string) => void;
}) {
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});

  const form = useForm<ImportFormSchema>({
    resolver: zodResolver(importFormSchema),
    defaultValues: {
      accountId: '',
      mapping: {
        columns: {} as Record<ImportFormat, string>,
        activityTypes: {} as Partial<Record<ActivityType, string[]>>,
      },
    },
  });

  const {
    csvData,
    headers,
    error,
    isLoading,
    selectedFile,
    isValidCsv,
    parseCsvFile,
    resetFileStates,
  } = useCsvParser();

  const { mapping, setMapping, handleColumnMapping, handleActivityTypeMapping } =
    useImportMapping(form);

  const { data: accounts } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });

  const accountId = form.watch('accountId');

  useEffect(() => {
    resetFileStates();
    setValidationErrors({});
  }, [accountId]);

  const { data: fetchedMapping } = useQuery({
    queryKey: ['mapping', accountId],
    queryFn: () => getAccountImportMapping(accountId),
    enabled: !!accountId,
  });

  useEffect(() => {
    if (fetchedMapping) {
      form.setValue('mapping', fetchedMapping as ImportFormSchema['mapping']);
      setMapping(fetchedMapping as ImportFormSchema['mapping']);
    }
  }, [fetchedMapping, form, setMapping]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      parseCsvFile(file, form);
    },
    [parseCsvFile, form],
  );

  const { checkImportMutation } = useActivityImportMutations();

  const saveMappingMutation = useMutation({
    mutationFn: saveAccountImportMapping,
    onError: (error: any) => {
      onError(`Failed to save mapping: ${error.message}`);
    },
  });

  const getMappedValue = useCallback(
    (row: string[], field: ImportFormat): string => {
      const columnIndex = headers.indexOf(mapping.columns[field] || '');
      if (columnIndex === -1) return '';
      return row[columnIndex];
    },
    [headers, mapping.columns],
  );

  const isMapComplete = useCallback(() => {
    return isImportMapComplete(headers, mapping, csvData, getMappedValue);
  }, [headers, mapping, csvData, getMappedValue]);

  const getMappedActivityType = useCallback(
    (row: string[]): ActivityType => {
      const csvType = getMappedValue(row, ImportFormat.ActivityType);
      const normalizedCsvType = csvType.trim().toUpperCase();

      for (const [appType, csvTypes] of Object.entries(mapping.activityTypes)) {
        if (
          csvTypes?.some((mappedType) => {
            const normalizedMappedType = mappedType.trim().toUpperCase();
            return normalizedCsvType.startsWith(normalizedMappedType);
          })
        ) {
          return appType as ActivityType;
        }
      }
      return csvType as ActivityType; // Fallback to original value if no mapping found
    },
    [getMappedValue, mapping.activityTypes],
  );

  const onSubmit = async (data: ImportFormSchema) => {
    try {
      await saveMappingMutation.mutateAsync({
        accountId: data.accountId,
        mapping: data.mapping,
      });

      const activitiesToImport: ActivityImport[] = csvData.slice(1).map((row) => {
        const activityType = getMappedActivityType(row);
        const isCashActivity = [
          ActivityType.DIVIDEND,
          ActivityType.DEPOSIT,
          ActivityType.WITHDRAWAL,
          ActivityType.FEE,
          ActivityType.TAX,
        ].includes(activityType);

        let amount: number | undefined;
        let quantity: number;
        let unitPrice: number;

        // Try to get amount from the CSV if the field is mapped
        const rawAmount = getMappedValue(row, ImportFormat.Amount);
        if (rawAmount) {
          amount = parseFloat(rawAmount) || undefined;
        }

        if (isCashActivity) {
          // For cash activities, calculate amount if not provided
          if (!amount) {
            quantity = parseFloat(getMappedValue(row, ImportFormat.Quantity)) || 1;
            unitPrice = parseFloat(getMappedValue(row, ImportFormat.UnitPrice)) || 0;
            amount = quantity * unitPrice;
          }
          // Set quantity and unitPrice to match the amount
          quantity = 1;
          unitPrice = amount || 0;
        } else {
          // For non-cash activities, use regular quantity and unit price
          quantity = parseFloat(getMappedValue(row, ImportFormat.Quantity));
          unitPrice = parseFloat(getMappedValue(row, ImportFormat.UnitPrice));
        }

        // Get currency from CSV if mapped, otherwise use account currency
        const currency =
          getMappedValue(row, ImportFormat.Currency) ||
          accounts?.find((a) => a.id === data.accountId)?.currency;

        return {
          date: getMappedValue(row, ImportFormat.Date),
          symbol: getMappedValue(row, ImportFormat.Symbol).trim(),
          activityType,
          quantity,
          unitPrice,
          currency,
          fee: parseFloat(getMappedValue(row, ImportFormat.Fee)) || 0,
          amount,
          accountId: data.accountId,
          isDraft: true,
          isValid: false,
          assetId: getMappedValue(row, ImportFormat.Symbol),
          comment: '',
        };
      });

      // Validate activities
      const validationErrors = validateActivities(activitiesToImport);
      if (Object.keys(validationErrors).length > 0) {
        setValidationErrors(validationErrors);
        return;
      }

      await checkImportMutation
        .mutateAsync({
          account_id: data.accountId,
          activities: activitiesToImport,
        })
        .then((result) => {
          onSuccess(result);
        })
        .catch((error) => {
          onError(`Import failed: ${error}`);
        });
    } catch (error: any) {
      onError(`Import failed: ${error}`);
    }
  };

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    open: openFilePicker,
  } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    noClick: true,
  });

  return (
    <div className="space-y-8">
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <AccountSelection control={form.control} accounts={accounts} />
        <FileDropzone
          getRootProps={getRootProps}
          getInputProps={getInputProps}
          isDragActive={isDragActive}
          selectedFile={selectedFile}
          isLoading={isLoading}
          openFilePicker={openFilePicker}
        />

        <PreviewContent
          accountId={accountId}
          selectedFile={selectedFile}
          isValidCsv={isValidCsv}
          error={error}
          headers={headers}
          mapping={mapping}
          handleColumnMapping={handleColumnMapping}
          handleActivityTypeMapping={handleActivityTypeMapping}
          importFormatFields={Object.values(ImportFormat)}
          csvData={csvData}
          getMappedValue={getMappedValue}
          validationErrors={validationErrors}
        />

        <div className="mt-4 flex justify-between">
          <Button asChild variant="outline">
            <Link to="/activities">Cancel</Link>
          </Button>
          {accountId && selectedFile && isMapComplete() && (
            <Button type="submit">Import Data</Button>
          )}
          {accountId && selectedFile && !isMapComplete() && (
            <p className="flex items-center text-sm text-red-400">
              <Icons.AlertTriangle className="mr-2 h-4 w-4" />
              Please map all columns and activity types before importing.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}

function AccountSelection({
  control,
  accounts,
}: {
  control: any;
  accounts: Account[] | undefined;
}) {
  return (
    <div className="mb-4">
      <label htmlFor="accountId" className="mb-1 block text-sm font-medium">
        Select Account
      </label>
      <Controller
        name="accountId"
        control={control}
        render={({ field }) => (
          <Select onValueChange={field.onChange} value={field.value}>
            <SelectTrigger>
              <SelectValue placeholder="Select an account" />
            </SelectTrigger>
            <SelectContent>
              {accounts ? (
                accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="">Loading accounts...</SelectItem>
              )}
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
}

function PreviewContent({
  accountId,
  selectedFile,
  isValidCsv,
  error,
  headers,
  mapping,
  handleColumnMapping,
  handleActivityTypeMapping,
  importFormatFields,
  csvData,
  getMappedValue,
  validationErrors,
}: {
  accountId: string;
  selectedFile: File | null;
  isValidCsv: boolean;
  error: string | null;
  headers: string[];
  mapping: ImportFormSchema['mapping'];
  handleColumnMapping: (field: ImportFormat, value: string) => void;
  handleActivityTypeMapping: (csvActivity: string, activityType: ActivityType) => void;
  importFormatFields: ImportFormat[];
  csvData: string[][];
  getMappedValue: (row: string[], field: ImportFormat) => string;
  validationErrors: Record<string, string[]>;
}) {
  if (!accountId) {
    return (
      <div className="mt-2">
        <p className="text-sm text-muted-foreground">Please select an account to proceed.</p>
      </div>
    );
  }

  if (!selectedFile) {
    return (
      <div className="mt-2">
        <p className="text-sm text-muted-foreground">Please select a file to proceed.</p>
      </div>
    );
  }

  if (!isValidCsv || error || Object.keys(validationErrors).length > 0) {
    const allErrors: Record<string, string[]> = {
      ...(error ? { Error: [error] } : {}),
      ...validationErrors,
    };
    return <ErrorViewer errors={allErrors} csvData={csvData} mapping={mapping} />;
  }

  return (
    <div className="pt-6">
      <h2 className="mb-2 font-semibold">Preview</h2>
      <ImportPreviewTable
        importFormatFields={importFormatFields}
        mapping={mapping}
        headers={headers}
        csvData={csvData}
        handleColumnMapping={handleColumnMapping}
        handleActivityTypeMapping={handleActivityTypeMapping}
        getMappedValue={getMappedValue}
      />
    </div>
  );
}
