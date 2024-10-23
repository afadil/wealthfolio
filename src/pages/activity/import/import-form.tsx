import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
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
import { Account, ActivityType, ImportActivity, ImportFormat } from '@/lib/types';
import { getAccountImportMapping, saveAccountImportMapping } from '@/commands/activity-import';
import { useActivityImportMutations } from './useActivityImportMutations';
import { ActivityImport } from '@/lib/types';
import { ACTIVITY_TYPE_PREFIX_LENGTH } from '@/lib/types';

// Components
import { FileDropzone } from './components/file-dropzone';
import { importActivitySchema, importFormSchema, type ImportFormSchema } from '@/lib/schemas';
import { ImportPreviewTable } from './components/import-preview-table';
import { QueryKeys } from '@/lib/query-keys';
import { getAccounts } from '@/commands/account';
import { ErrorViewer } from './components/csv-error-viewer';

export function ActivityImportForm({
  onSuccess,
  onError,
}: {
  onSuccess: (activities: ActivityImport[]) => void;
  onError: (error: string) => void;
}) {
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ImportFormSchema['mapping']>({
    columns: {} as Record<ImportFormat, string>,
    activityTypes: {} as Partial<Record<ActivityType, string[]>>,
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isValidCsv, setIsValidCsv] = useState(true);
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});

  const { data: accounts } = useQuery<Account[], Error>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });

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

  const accountId = form.watch('accountId');

  // Add this effect to reset states when account changes
  useEffect(() => {
    resetAccountStates();
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
  }, [fetchedMapping, form]);

  const { checkImportMutation } = useActivityImportMutations();

  const saveMappingMutation = useMutation({
    mutationFn: saveAccountImportMapping,
    onSuccess: () => {
      // Optionally, you can show a success message here
    },
    onError: (error: any) => {
      setError(`Failed to save mapping: ${error.message}`);
      onError(`Failed to save mapping: ${error.message}`);
    },
  });

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      resetFileStates();
      const file = acceptedFiles[0];
      setSelectedFile(file);
      Papa.parse(file, {
        complete: (results: Papa.ParseResult<string[]>) => {
          if (results.data && results.data.length > 0) {
            setCsvData(results.data);
            const headerRow = results.data[0];
            setHeaders(headerRow);

            const isValid = validateCsvStructure(headerRow);

            if (!isValid) {
              setIsValidCsv(false);
              setError(
                "Oops! The CSV file structure doesn't look quite right. Please make sure your file starts with a header row containing multiple column names.",
              );
            } else {
              initializeMapping(headerRow);
            }
          } else {
            setIsValidCsv(false);
            setError('The CSV file appears to be empty.');
          }
          setIsLoading(false);
        },
        error: (error: any) => {
          setIsValidCsv(false);
          setError(`Error parsing CSV: ${error.message}`);
          setIsLoading(false);
        },
      });
    },
    [form],
  );

  const validateCsvStructure = (headerRow: string[]): boolean => {
    return headerRow.length >= 3 && !headerRow.some((header) => header.trim() === '');
  };

  const initializeMapping = (headerRow: string[]) => {
    const initialMapping: Partial<Record<ImportFormat, string>> = {};
    Object.values(ImportFormat).forEach((field) => {
      const matchingHeader = headerRow.find(
        (header) => header.toLowerCase().trim() === field.toLowerCase(),
      );
      if (matchingHeader) {
        initialMapping[field] = matchingHeader;
      }
    });

    form.setValue('mapping.columns', {
      ...form.getValues('mapping.columns'),
      ...initialMapping,
    } as Record<ImportFormat, string>);
    setMapping((prev) => ({ ...prev, columns: { ...prev.columns, ...initialMapping } }));
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

  const handleColumnMapping = (field: ImportFormat, value: string) => {
    form.setValue('mapping.columns', {
      ...form.getValues('mapping.columns'),
      [field]: value,
    } as Record<ImportFormat, string>);
    setMapping((prev) => ({ ...prev, columns: { ...prev.columns, [field]: value } }));
  };

  const handleActivityTypeMapping = useCallback(
    (csvActivity: string, activityType: ActivityType) => {
      const updatedActivityTypes = {
        ...form.getValues('mapping.activityTypes'),
      };

      // Ensure each activity type is initialized as an array
      Object.keys(updatedActivityTypes).forEach((key) => {
        if (!Array.isArray(updatedActivityTypes[key as ActivityType])) {
          updatedActivityTypes[key as ActivityType] = [];
        }
      });

      // Remove the csvActivity from any existing mappings using prefix match
      Object.keys(updatedActivityTypes).forEach((key) => {
        const compareValue =
          csvActivity.length > ACTIVITY_TYPE_PREFIX_LENGTH
            ? csvActivity.substring(0, ACTIVITY_TYPE_PREFIX_LENGTH).toUpperCase()
            : csvActivity.toUpperCase();
        updatedActivityTypes[key as ActivityType] = updatedActivityTypes[
          key as ActivityType
        ]?.filter((type) => {
          const mappedValue =
            type.length > ACTIVITY_TYPE_PREFIX_LENGTH
              ? type.substring(0, ACTIVITY_TYPE_PREFIX_LENGTH).toUpperCase()
              : type.toUpperCase();
          return mappedValue !== compareValue;
        });
      });

      // Add the csvActivity to the new activityType mapping
      if (!updatedActivityTypes[activityType]) {
        updatedActivityTypes[activityType] = [];
      }
      const valueToStore =
        csvActivity.length > ACTIVITY_TYPE_PREFIX_LENGTH
          ? csvActivity.substring(0, ACTIVITY_TYPE_PREFIX_LENGTH).toUpperCase()
          : csvActivity.toUpperCase();
      updatedActivityTypes[activityType]?.push(valueToStore);

      form.setValue('mapping.activityTypes', updatedActivityTypes);
      setMapping((prev) => ({
        ...prev,
        activityTypes: updatedActivityTypes,
      }));
    },
    [form, setMapping],
  );

  const getMappedValue = useCallback(
    (row: string[], field: ImportFormat): string => {
      const columnIndex = headers.indexOf(mapping.columns[field] || '');
      if (columnIndex === -1) return '';
      return row[columnIndex];
    },
    [headers, mapping.columns],
  );

  const isMapComplete = useCallback(() => {
    const columnsComplete = Object.values(ImportFormat).every(
      (field) => mapping.columns[field] && headers.includes(mapping.columns[field]),
    );

    const uniqueCsvTypes = new Set(
      csvData.slice(1).map((row) => getMappedValue(row, ImportFormat.ActivityType)),
    );

    const activityTypesComplete = Array.from(uniqueCsvTypes).every((csvType) => {
      const compareValue =
        csvType.length > ACTIVITY_TYPE_PREFIX_LENGTH
          ? csvType.substring(0, ACTIVITY_TYPE_PREFIX_LENGTH).toUpperCase()
          : csvType.toUpperCase();

      return Object.entries(mapping.activityTypes).some(([_, csvTypes]) =>
        csvTypes?.some((mappedType) => {
          const mappedValue =
            mappedType.length > ACTIVITY_TYPE_PREFIX_LENGTH
              ? mappedType.substring(0, ACTIVITY_TYPE_PREFIX_LENGTH).toUpperCase()
              : mappedType.toUpperCase();
          return mappedValue === compareValue;
        }),
      );
    });

    return columnsComplete && activityTypesComplete;
  }, [headers, mapping.columns, mapping.activityTypes, csvData, getMappedValue]);

  const getMappedActivityType = useCallback(
    (row: string[]): ActivityType => {
      const csvType = getMappedValue(row, ImportFormat.ActivityType);
      const compareValue =
        csvType.length > ACTIVITY_TYPE_PREFIX_LENGTH
          ? csvType.substring(0, ACTIVITY_TYPE_PREFIX_LENGTH).toUpperCase()
          : csvType.toUpperCase();

      for (const [appType, csvTypes] of Object.entries(mapping.activityTypes)) {
        if (
          csvTypes?.some((type) => {
            const mappedValue =
              type.length > ACTIVITY_TYPE_PREFIX_LENGTH
                ? type.substring(0, ACTIVITY_TYPE_PREFIX_LENGTH).toUpperCase()
                : type.toUpperCase();
            return mappedValue === compareValue;
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
      // Save the mapping
      await saveMappingMutation.mutateAsync({
        accountId: data.accountId,
        mapping: data.mapping,
      });

      // Prepare activities for import
      const activitiesToImport: ImportActivity[] = csvData.slice(1).map((row) => ({
        date: getMappedValue(row, ImportFormat.Date),
        symbol: getMappedValue(row, ImportFormat.Symbol),
        activityType: getMappedActivityType(row),
        quantity: parseFloat(getMappedValue(row, ImportFormat.Quantity)),
        unitPrice: parseFloat(getMappedValue(row, ImportFormat.UnitPrice)),
        currency:
          getMappedValue(row, ImportFormat.Currency) ||
          accounts?.find((a) => a.id === data.accountId)?.currency,
        fee: parseFloat(getMappedValue(row, ImportFormat.Fee)) || 0,
        accountId: data.accountId,
        isDraft: true,
        assetId: getMappedValue(row, ImportFormat.Symbol),
        comment: '',
      }));

      // Validate activities
      const validationErrors: Record<string, string[]> = {};
      setValidationErrors({});
      activitiesToImport.forEach((activity, index) => {
        try {
          importActivitySchema.parse(activity);
        } catch (error) {
          if (error instanceof z.ZodError) {
            validationErrors[`${index + 2}`] = error.errors.map(
              (e) => `${e.path.join('.')}: ${e.message}`,
            );
          }
        }
      });

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

  // Add this function to reset states
  const resetAccountStates = () => {
    setError(null);
    setIsLoading(false);
    setIsValidCsv(true);
    setValidationErrors({});
  };

  const resetFileStates = () => {
    setCsvData([]);
    setHeaders([]);
    setError(null);
    setIsLoading(false);
    setIsValidCsv(true);
    setValidationErrors({});
  };

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
