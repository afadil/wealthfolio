import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icons, Icon } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Badge, SearchableSelect } from "@wealthfolio/ui";
import type { CashImportFormat, CashImportMappingData, CsvRowData, CategoryWithChildren, Event, Account, RecurrenceType } from "@/lib/types";
import { ActivityType, AccountType, RECURRENCE_TYPES } from "@/lib/types";
import { cn, tryParseDate } from "@/lib/utils";
import { motion } from "motion/react";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { ImportAlert } from "@/pages/activity/import/components/import-alert";
import { useQuery } from "@tanstack/react-query";
import { QueryKeys } from "@/lib/query-keys";
import { getCategoriesHierarchical } from "@/commands/category";
import { getEvents } from "@/commands/event";
import { getAccounts } from "@/commands/account";

// Required fields for cash import (date, name, amount, activityType)
const CASH_IMPORT_REQUIRED_FIELDS: CashImportFormat[] = ["date", "name", "amount", "activityType"];

// All available cash import fields with display labels
const CASH_IMPORT_FIELDS: { field: CashImportFormat; label: string; required: boolean }[] = [
  { field: "date", label: "Date", required: true },
  { field: "name", label: "Name", required: true },
  { field: "amount", label: "Amount", required: true },
  { field: "activityType", label: "Activity Type", required: true },
  { field: "currency", label: "Currency", required: false },
  { field: "account", label: "Account", required: false },
  { field: "category", label: "Category", required: false },
  { field: "subcategory", label: "Subcategory", required: false },
  { field: "description", label: "Description", required: false },
  { field: "event", label: "Event", required: false },
  { field: "recurrence", label: "Recurrence", required: false },
];

const SKIP_FIELD_VALUE = "__skip__";

interface CashMappingStepProps {
  headers: string[];
  data: CsvRowData[];
  accountId?: string;
  initialMapping?: CashImportMappingData | null;
  onChange?: (mapping: CashImportMappingData) => void;
  onNext: (mapping: CashImportMappingData) => void;
  onBack: () => void;
}

export const CashMappingStep = ({
  headers,
  data,
  accountId,
  initialMapping,
  onChange,
  onNext,
  onBack,
}: CashMappingStepProps) => {
  // Initialize state from initialMapping if provided, otherwise start empty
  const [fieldMappings, setFieldMappings] = useState<Partial<Record<CashImportFormat, string>>>(
    initialMapping?.fieldMappings ?? {}
  );
  const [invertAmountSign, setInvertAmountSign] = useState(
    initialMapping?.invertAmountSign ?? false
  );

  // Value mappings state
  const [activityTypeMappings, setActivityTypeMappings] = useState<Partial<Record<ActivityType, string[]>>>(
    initialMapping?.activityTypeMappings ?? {}
  );
  const [categoryMappings, setCategoryMappings] = useState<Record<string, { categoryId: string; subCategoryId?: string }>>(
    initialMapping?.categoryMappings ?? {}
  );
  const [eventMappings, setEventMappings] = useState<Record<string, string>>(
    initialMapping?.eventMappings ?? {}
  );
  const [accountMappings, setAccountMappings] = useState<Record<string, string>>(
    initialMapping?.accountMappings ?? {}
  );
  const [recurrenceMappings, setRecurrenceMappings] = useState<Record<string, RecurrenceType>>(
    initialMapping?.recurrenceMappings ?? {}
  );

  // Fetch categories and events for mapping
  const { data: categories = [] } = useQuery<CategoryWithChildren[]>({
    queryKey: [QueryKeys.CATEGORIES_HIERARCHICAL],
    queryFn: getCategoriesHierarchical,
  });

  const { data: events = [] } = useQuery<Event[]>({
    queryKey: [QueryKeys.EVENTS],
    queryFn: getEvents,
  });

  // Fetch cash accounts for account mapping
  const { data: accountsData = [] } = useQuery<Account[]>({
    queryKey: [QueryKeys.ACCOUNTS],
    queryFn: getAccounts,
  });

  // Filter to only show CASH accounts
  const cashAccounts = useMemo(
    () => accountsData.filter((acc) => acc.accountType === AccountType.CASH),
    [accountsData],
  );

  // Build the current mapping object
  const currentMapping = useMemo((): CashImportMappingData | null => {
    if (!accountId) return null;
    return {
      accountId,
      fieldMappings,
      invertAmountSign,
      activityTypeMappings: Object.keys(activityTypeMappings).length > 0 ? activityTypeMappings : undefined,
      categoryMappings: Object.keys(categoryMappings).length > 0 ? categoryMappings : undefined,
      eventMappings: Object.keys(eventMappings).length > 0 ? eventMappings : undefined,
      accountMappings: Object.keys(accountMappings).length > 0 ? accountMappings : undefined,
      recurrenceMappings: Object.keys(recurrenceMappings).length > 0 ? recurrenceMappings : undefined,
    };
  }, [accountId, fieldMappings, invertAmountSign, activityTypeMappings, categoryMappings, eventMappings, accountMappings, recurrenceMappings]);

  // Track if this is the initial render to avoid calling onChange on mount
  const isInitialMount = useRef(true);

  // Notify parent of mapping changes for persistence (skip initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (onChange && currentMapping) {
      onChange(currentMapping);
    }
  }, [currentMapping]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle column mapping
  const handleColumnMapping = useCallback((field: CashImportFormat, value: string) => {
    setFieldMappings((prev) => ({
      ...prev,
      [field]: value || undefined,
    }));
  }, []);

  // Helper to get mapped value from a row
  const getMappedValue = useCallback(
    (row: CsvRowData, field: CashImportFormat): string => {
      const headerName = fieldMappings[field];
      if (!headerName) return "";
      return row[headerName] || "";
    },
    [fieldMappings],
  );

  // Check if a field is mapped
  const isFieldMapped = (field: CashImportFormat) => {
    const mappedHeader = fieldMappings[field];
    return typeof mappedHeader === "string" && headers.includes(mappedHeader);
  };

  // Check if all required fields are mapped
  const requiredFieldsMapped = CASH_IMPORT_REQUIRED_FIELDS.every(
    (field) => fieldMappings[field] && headers.includes(fieldMappings[field]!),
  );

  // Get distinct activity types from CSV
  const distinctActivityTypes = useMemo(() => {
    if (!isFieldMapped("activityType")) return [];
    const types = new Map<string, number>();
    data.forEach((row) => {
      const type = getMappedValue(row, "activityType");
      if (type) {
        types.set(type.trim(), (types.get(type.trim()) || 0) + 1);
      }
    });
    return Array.from(types.entries()).map(([csvType, count]) => ({
      csvType,
      count,
      appType: findAppTypeForCsvType(csvType, activityTypeMappings),
    }));
  }, [data, fieldMappings, activityTypeMappings, getMappedValue]);

  // Get distinct categories from CSV
  const distinctCategories = useMemo(() => {
    if (!isFieldMapped("category")) return [];
    const cats = new Map<string, number>();
    data.forEach((row) => {
      const cat = getMappedValue(row, "category");
      if (cat) {
        cats.set(cat.trim(), (cats.get(cat.trim()) || 0) + 1);
      }
    });
    return Array.from(cats.entries()).map(([csvCat, count]) => ({
      csvCategory: csvCat,
      count,
      mappedCategory: categoryMappings[csvCat],
    }));
  }, [data, fieldMappings, categoryMappings, getMappedValue]);

  // Get distinct events from CSV
  const distinctEvents = useMemo(() => {
    if (!isFieldMapped("event")) return [];
    const evts = new Map<string, number>();
    data.forEach((row) => {
      const evt = getMappedValue(row, "event");
      if (evt) {
        evts.set(evt.trim(), (evts.get(evt.trim()) || 0) + 1);
      }
    });
    return Array.from(evts.entries()).map(([csvEvent, count]) => ({
      csvEvent,
      count,
      mappedEventId: eventMappings[csvEvent],
    }));
  }, [data, fieldMappings, eventMappings, getMappedValue]);

  // Get distinct accounts from CSV
  const distinctAccounts = useMemo(() => {
    if (!isFieldMapped("account")) return [];
    const accs = new Map<string, number>();
    data.forEach((row) => {
      const acc = getMappedValue(row, "account");
      if (acc) {
        accs.set(acc.trim(), (accs.get(acc.trim()) || 0) + 1);
      }
    });
    return Array.from(accs.entries()).map(([csvAccount, count]) => ({
      csvAccount,
      count,
      mappedAccountId: accountMappings[csvAccount],
    }));
  }, [data, fieldMappings, accountMappings, getMappedValue]);

  // Get distinct recurrences from CSV
  const distinctRecurrences = useMemo(() => {
    if (!isFieldMapped("recurrence")) return [];
    const recs = new Map<string, number>();
    data.forEach((row) => {
      const rec = getMappedValue(row, "recurrence");
      if (rec) {
        recs.set(rec.trim(), (recs.get(rec.trim()) || 0) + 1);
      }
    });
    return Array.from(recs.entries()).map(([csvRecurrence, count]) => ({
      csvRecurrence,
      count,
      mappedRecurrence: recurrenceMappings[csvRecurrence],
    }));
  }, [data, fieldMappings, recurrenceMappings, getMappedValue]);

  // Handle activity type mapping
  const handleActivityTypeMapping = useCallback((csvType: string, appType: ActivityType | "") => {
    setActivityTypeMappings((prev) => {
      const next = { ...prev };
      // Remove from any existing mapping
      Object.keys(next).forEach((key) => {
        const types = next[key as ActivityType];
        if (types) {
          next[key as ActivityType] = types.filter((t) => t !== csvType);
          if (next[key as ActivityType]?.length === 0) {
            delete next[key as ActivityType];
          }
        }
      });
      // Add to new mapping if not empty
      if (appType) {
        if (!next[appType]) {
          next[appType] = [];
        }
        next[appType]!.push(csvType);
      }
      return next;
    });
  }, []);

  // Handle category mapping
  const handleCategoryMapping = useCallback((csvCategory: string, categoryId: string, subCategoryId?: string) => {
    setCategoryMappings((prev) => {
      if (!categoryId) {
        const { [csvCategory]: _, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [csvCategory]: { categoryId, subCategoryId },
      };
    });
  }, []);

  // Handle event mapping
  const handleEventMapping = useCallback((csvEvent: string, eventId: string) => {
    setEventMappings((prev) => {
      if (!eventId) {
        const { [csvEvent]: _, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [csvEvent]: eventId,
      };
    });
  }, []);

  // Handle account mapping
  const handleAccountMapping = useCallback((csvAccount: string, accountId: string) => {
    setAccountMappings((prev) => {
      if (!accountId) {
        const { [csvAccount]: _, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [csvAccount]: accountId,
      };
    });
  }, []);

  // Handle recurrence mapping
  const handleRecurrenceMapping = useCallback((csvRecurrence: string, recurrenceType: RecurrenceType | "") => {
    setRecurrenceMappings((prev) => {
      if (!recurrenceType) {
        const { [csvRecurrence]: _, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [csvRecurrence]: recurrenceType,
      };
    });
  }, []);

  // Count unmapped values
  const unmappedActivityTypesCount = distinctActivityTypes.filter((t) => !t.appType).length;
  const unmappedCategoriesCount = distinctCategories.filter((c) => !c.mappedCategory).length;
  const unmappedEventsCount = distinctEvents.filter((e) => !e.mappedEventId).length;
  const unmappedAccountsCount = distinctAccounts.filter((a) => !a.mappedAccountId).length;
  const unmappedRecurrencesCount = distinctRecurrences.filter((r) => !r.mappedRecurrence).length;

  // Count date parsing status
  const dateParsingStatus = useMemo(() => {
    if (!isFieldMapped("date")) return { parsed: 0, failed: 0, total: 0 };
    let parsed = 0;
    let failed = 0;
    data.forEach((row) => {
      const dateValue = getMappedValue(row, "date");
      if (dateValue) {
        const parsedDate = tryParseDate(dateValue);
        if (parsedDate) {
          parsed++;
        } else {
          failed++;
        }
      }
    });
    return { parsed, failed, total: parsed + failed };
  }, [data, fieldMappings, getMappedValue]);

  // All value mappings complete (only require if column is mapped)
  const allValueMappingsComplete =
    (unmappedActivityTypesCount === 0 || !isFieldMapped("activityType")) &&
    (unmappedCategoriesCount === 0 || !isFieldMapped("category")) &&
    (unmappedEventsCount === 0 || !isFieldMapped("event")) &&
    (unmappedAccountsCount === 0 || !isFieldMapped("account")) &&
    (unmappedRecurrencesCount === 0 || !isFieldMapped("recurrence"));

  // All dates must parse successfully
  const allDatesParsed = !isFieldMapped("date") || dateParsingStatus.failed === 0;

  // Handle next click
  const handleNextClick = () => {
    if (!accountId) return;

    const mapping: CashImportMappingData = {
      accountId,
      fieldMappings,
      invertAmountSign,
      activityTypeMappings: Object.keys(activityTypeMappings).length > 0 ? activityTypeMappings : undefined,
      categoryMappings: Object.keys(categoryMappings).length > 0 ? categoryMappings : undefined,
      eventMappings: Object.keys(eventMappings).length > 0 ? eventMappings : undefined,
      accountMappings: Object.keys(accountMappings).length > 0 ? accountMappings : undefined,
      recurrenceMappings: Object.keys(recurrenceMappings).length > 0 ? recurrenceMappings : undefined,
    };

    onNext(mapping);
  };

  // Helper function to find app type for csv type
  function findAppTypeForCsvType(
    csvType: string,
    mappings: Partial<Record<ActivityType, string[]>>,
  ): ActivityType | null {
    const normalizedCsvType = csvType.trim().toUpperCase();
    for (const [appType, csvTypes] of Object.entries(mappings)) {
      if (csvTypes?.some((t) => t.trim().toUpperCase() === normalizedCsvType)) {
        return appType as ActivityType;
      }
    }
    return null;
  }

  // Mapped fields count
  const requiredFieldsCount = CASH_IMPORT_REQUIRED_FIELDS.length;
  const mappedRequiredCount = CASH_IMPORT_REQUIRED_FIELDS.filter((f) => isFieldMapped(f)).length;

  return (
    <div className="m-0 flex h-full flex-col p-0">
      {/* Status cards */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ImportAlert
          variant={requiredFieldsMapped ? "success" : "destructive"}
          size="sm"
          title="Required Fields"
          description={`${mappedRequiredCount} of ${requiredFieldsCount} mapped`}
          icon={Icons.ListChecks}
          className="mb-0"
          rightIcon={requiredFieldsMapped ? Icons.CheckCircle : Icons.AlertCircle}
        />

        {/* Date parsing status - only show if date column is mapped */}
        {isFieldMapped("date") && dateParsingStatus.total > 0 && (
          <ImportAlert
            variant={dateParsingStatus.failed === 0 ? "success" : "destructive"}
            size="sm"
            title="Date Parsing"
            description={
              dateParsingStatus.failed === 0
                ? `All ${dateParsingStatus.total} dates parsed`
                : `${dateParsingStatus.failed} of ${dateParsingStatus.total} failed`
            }
            icon={Icons.Calendar}
            className="mb-0"
            rightIcon={dateParsingStatus.failed === 0 ? Icons.CheckCircle : Icons.AlertCircle}
          />
        )}

        {/* Activity Type mapping status - only show if column is mapped */}
        {isFieldMapped("activityType") && (
          <ImportAlert
            variant={unmappedActivityTypesCount === 0 ? "success" : "destructive"}
            size="sm"
            title="Activity Types"
            description={`${distinctActivityTypes.length - unmappedActivityTypesCount} of ${distinctActivityTypes.length} mapped`}
            icon={Icons.Activity as Icon}
            className="mb-0"
            rightIcon={unmappedActivityTypesCount === 0 ? Icons.CheckCircle : Icons.AlertCircle}
          />
        )}

        {/* Category mapping status - only show if column is mapped */}
        {isFieldMapped("category") && (
          <ImportAlert
            variant={unmappedCategoriesCount === 0 ? "success" : "destructive"}
            size="sm"
            title="Categories"
            description={`${distinctCategories.length - unmappedCategoriesCount} of ${distinctCategories.length} mapped`}
            icon={Icons.Tag}
            className="mb-0"
            rightIcon={unmappedCategoriesCount === 0 ? Icons.CheckCircle : Icons.AlertCircle}
          />
        )}

        {/* Event mapping status - only show if column is mapped */}
        {isFieldMapped("event") && (
          <ImportAlert
            variant={unmappedEventsCount === 0 ? "success" : "destructive"}
            size="sm"
            title="Events"
            description={`${distinctEvents.length - unmappedEventsCount} of ${distinctEvents.length} mapped`}
            icon={Icons.Calendar}
            className="mb-0"
            rightIcon={unmappedEventsCount === 0 ? Icons.CheckCircle : Icons.AlertCircle}
          />
        )}

        {/* Account mapping status - only show if column is mapped */}
        {isFieldMapped("account") && (
          <ImportAlert
            variant={unmappedAccountsCount === 0 ? "success" : "destructive"}
            size="sm"
            title="Accounts"
            description={`${distinctAccounts.length - unmappedAccountsCount} of ${distinctAccounts.length} mapped`}
            icon={Icons.Wallet}
            className="mb-0"
            rightIcon={unmappedAccountsCount === 0 ? Icons.CheckCircle : Icons.AlertCircle}
          />
        )}

        {/* Recurrence mapping status - only show if column is mapped */}
        {isFieldMapped("recurrence") && (
          <ImportAlert
            variant={unmappedRecurrencesCount === 0 ? "success" : "destructive"}
            size="sm"
            title="Recurrence"
            description={`${distinctRecurrences.length - unmappedRecurrencesCount} of ${distinctRecurrences.length} mapped`}
            icon={Icons.RefreshCw}
            className="mb-0"
            rightIcon={unmappedRecurrencesCount === 0 ? Icons.CheckCircle : Icons.AlertCircle}
          />
        )}
      </div>

      {/* Activity Preview */}
      <div className="flex flex-1 flex-col">
        <div className="py-2">
          <div className="text-muted-foreground text-sm">
            <span className="font-medium">{data.length} </span>total row
            {data.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-0">
          <CashMappingTable
            fieldMappings={fieldMappings}
            headers={headers}
            data={data}
            handleColumnMapping={handleColumnMapping}
            getMappedValue={getMappedValue}
            isFieldMapped={isFieldMapped}
            activityTypeMappings={activityTypeMappings}
            categoryMappings={categoryMappings}
            eventMappings={eventMappings}
            accountMappings={accountMappings}
            recurrenceMappings={recurrenceMappings}
            handleActivityTypeMapping={handleActivityTypeMapping}
            handleCategoryMapping={handleCategoryMapping}
            handleEventMapping={handleEventMapping}
            handleAccountMapping={handleAccountMapping}
            handleRecurrenceMapping={handleRecurrenceMapping}
            categories={categories}
            events={events}
            cashAccounts={cashAccounts}
          />
        </div>
      </div>

      {/* Amount sign toggle */}
      <div className="border-t pt-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="invertSign"
            checked={invertAmountSign}
            onCheckedChange={(checked) => setInvertAmountSign(checked === true)}
          />
          <Label htmlFor="invertSign" className="text-sm">
            Invert amount sign (treat positive as withdrawal, negative as deposit)
          </Label>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          <Icons.ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={handleNextClick}
          disabled={!requiredFieldsMapped || !allValueMappingsComplete || !allDatesParsed}
          className="min-w-[120px]"
        >
          Next
          <Icons.ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

// Mapping Table Component
interface CashMappingTableProps {
  fieldMappings: Partial<Record<CashImportFormat, string>>;
  headers: string[];
  data: CsvRowData[];
  handleColumnMapping: (field: CashImportFormat, value: string) => void;
  getMappedValue: (row: CsvRowData, field: CashImportFormat) => string;
  isFieldMapped: (field: CashImportFormat) => boolean;
  activityTypeMappings: Partial<Record<ActivityType, string[]>>;
  categoryMappings: Record<string, { categoryId: string; subCategoryId?: string }>;
  eventMappings: Record<string, string>;
  accountMappings: Record<string, string>;
  recurrenceMappings: Record<string, RecurrenceType>;
  handleActivityTypeMapping: (csvType: string, appType: ActivityType | "") => void;
  handleCategoryMapping: (csvCategory: string, categoryId: string, subCategoryId?: string) => void;
  handleEventMapping: (csvEvent: string, eventId: string) => void;
  handleAccountMapping: (csvAccount: string, accountId: string) => void;
  handleRecurrenceMapping: (csvRecurrence: string, recurrenceType: RecurrenceType | "") => void;
  categories: CategoryWithChildren[];
  events: Event[];
  cashAccounts: Account[];
}

function CashMappingTable({
  fieldMappings,
  headers,
  data,
  handleColumnMapping,
  getMappedValue,
  isFieldMapped,
  activityTypeMappings,
  categoryMappings,
  eventMappings,
  accountMappings,
  recurrenceMappings,
  handleActivityTypeMapping,
  handleCategoryMapping,
  handleEventMapping,
  handleAccountMapping,
  handleRecurrenceMapping,
  categories,
  events,
  cashAccounts,
}: CashMappingTableProps) {
  return (
    <div className="border-border bg-card h-full max-h-[50vh] w-full overflow-auto rounded-md border shadow-sm">
      <div className="min-w-fit">
        <TooltipProvider>
          <Table>
            <TableHeader className="sticky top-0 z-20">
              <TableRow>
                <TableHead className="border-border sticky left-0 z-30 w-12 min-w-12 border-r">
                  <div className="bg-muted/50 flex items-center justify-center rounded-sm p-1">
                    <span className="text-muted-foreground text-xs font-semibold">#</span>
                  </div>
                </TableHead>
                {CASH_IMPORT_FIELDS.map(({ field, label, required }) => (
                  <TableHead
                    key={field}
                    className={cn(
                      "p-2 whitespace-nowrap transition-colors",
                      required
                        ? !isFieldMapped(field)
                          ? "bg-amber-50 dark:bg-amber-950/20"
                          : ""
                        : "",
                    )}
                  >
                    <CashMappingHeaderCell
                      field={field}
                      label={label}
                      required={required}
                      fieldMappings={fieldMappings}
                      headers={headers}
                      handleColumnMapping={handleColumnMapping}
                      isFieldMapped={isFieldMapped}
                    />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, index) => (
                <motion.tr
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.5) }}
                  key={`row-${row.lineNumber}`}
                  className={cn(
                    "group hover:bg-muted/50 transition-colors",
                    index % 2 === 0 ? "bg-background" : "bg-muted/20",
                  )}
                >
                  <TableCell className="border-border bg-muted/30 text-muted-foreground sticky left-0 z-20 w-12 border-r font-mono text-xs font-medium">
                    {row.lineNumber}
                  </TableCell>
                  {CASH_IMPORT_FIELDS.map(({ field }) => (
                    <TableCell
                      key={field}
                      className={cn("p-2 text-xs transition-colors", "group-hover:bg-muted/50")}
                    >
                      <CashMappingCell
                        field={field}
                        row={row}
                        getMappedValue={getMappedValue}
                        activityTypeMappings={activityTypeMappings}
                        categoryMappings={categoryMappings}
                        eventMappings={eventMappings}
                        accountMappings={accountMappings}
                        recurrenceMappings={recurrenceMappings}
                        handleActivityTypeMapping={handleActivityTypeMapping}
                        handleCategoryMapping={handleCategoryMapping}
                        handleEventMapping={handleEventMapping}
                        handleAccountMapping={handleAccountMapping}
                        handleRecurrenceMapping={handleRecurrenceMapping}
                        categories={categories}
                        events={events}
                        cashAccounts={cashAccounts}
                      />
                    </TableCell>
                  ))}
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>
    </div>
  );
}

// Header Cell Component
interface CashMappingHeaderCellProps {
  field: CashImportFormat;
  label: string;
  required: boolean;
  fieldMappings: Partial<Record<CashImportFormat, string>>;
  headers: string[];
  handleColumnMapping: (field: CashImportFormat, value: string) => void;
  isFieldMapped: (field: CashImportFormat) => boolean;
}

function CashMappingHeaderCell({
  field,
  label,
  required,
  fieldMappings,
  headers,
  handleColumnMapping,
  isFieldMapped,
}: CashMappingHeaderCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const mappedHeader = fieldMappings[field];
  const isMapped = isFieldMapped(field);
  const showEditor = isEditing || !isMapped;

  return (
    <div>
      <div className="flex items-center gap-2 pt-2 pb-0">
        <span className="font-bold">
          {label}
          {required && !isMapped && (
            <span className="ml-1 text-amber-600 dark:text-amber-400">*</span>
          )}
        </span>
      </div>
      {showEditor ? (
        <Select
          onValueChange={(val) => {
            handleColumnMapping(field, val === SKIP_FIELD_VALUE ? "" : val);
            setIsEditing(false);
          }}
          value={mappedHeader || SKIP_FIELD_VALUE}
          onOpenChange={(open) => !open && setIsEditing(false)}
        >
          <SelectTrigger className="text-muted-foreground h-8 w-full py-2 font-normal">
            <SelectValue placeholder={required ? "Select column" : "Optional"} />
          </SelectTrigger>
          <SelectContent className="max-h-[300px] overflow-y-auto">
            {!required && (
              <>
                <SelectItem value={SKIP_FIELD_VALUE}>Ignore</SelectItem>
                <SelectSeparator />
              </>
            )}
            {headers.map((header) => (
              <SelectItem key={header || "-"} value={header || "-"}>
                {header || "-"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground h-8 py-0 pl-0 font-normal"
          onClick={() => setIsEditing(true)}
        >
          {mappedHeader || (required ? "Select column" : "Ignore")}
        </Button>
      )}
    </div>
  );
}

// Cell Component - shows value with mapping UI for special fields
interface CashMappingCellProps {
  field: CashImportFormat;
  row: CsvRowData;
  getMappedValue: (row: CsvRowData, field: CashImportFormat) => string;
  activityTypeMappings: Partial<Record<ActivityType, string[]>>;
  categoryMappings: Record<string, { categoryId: string; subCategoryId?: string }>;
  eventMappings: Record<string, string>;
  accountMappings: Record<string, string>;
  recurrenceMappings: Record<string, RecurrenceType>;
  handleActivityTypeMapping: (csvType: string, appType: ActivityType | "") => void;
  handleCategoryMapping: (csvCategory: string, categoryId: string, subCategoryId?: string) => void;
  handleEventMapping: (csvEvent: string, eventId: string) => void;
  handleAccountMapping: (csvAccount: string, accountId: string) => void;
  handleRecurrenceMapping: (csvRecurrence: string, recurrenceType: RecurrenceType | "") => void;
  categories: CategoryWithChildren[];
  events: Event[];
  cashAccounts: Account[];
}

function CashMappingCell({
  field,
  row,
  getMappedValue,
  activityTypeMappings,
  categoryMappings,
  eventMappings,
  accountMappings,
  recurrenceMappings,
  handleActivityTypeMapping,
  handleCategoryMapping,
  handleEventMapping,
  handleAccountMapping,
  handleRecurrenceMapping,
  categories,
  events,
  cashAccounts,
}: CashMappingCellProps) {
  const value = getMappedValue(row, field);

  if (!value || value.trim() === "") {
    return <span className="text-muted-foreground text-xs">-</span>;
  }

  // Date - show parsed preview with validation
  if (field === "date") {
    const parsedDate = tryParseDate(value);

    if (parsedDate) {
      const formattedDate = format(parsedDate, "MMM d, yyyy h:mm a");
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
              <Icons.CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-600" />
              <span className="text-xs">{formattedDate}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs">
              <span className="text-muted-foreground">Original: </span>
              <span className="font-mono">{value}</span>
            </p>
          </TooltipContent>
        </Tooltip>
      );
    }

    // Date parsing failed
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5">
            <Icons.AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
            <span className="text-destructive text-xs">{value}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="mb-1 text-xs font-medium text-red-600">Could not parse date</p>
          <p className="text-muted-foreground text-xs">
            Try formats like: 2024-01-15, 01/15/2024, Jan 15 2024, or 2024/01/15 14:30
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Activity Type - show mapping UI
  if (field === "activityType") {
    const normalizedValue = value.trim();
    const appType = findAppTypeForCsvTypeFn(normalizedValue, activityTypeMappings);

    if (appType) {
      return (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => handleActivityTypeMapping(normalizedValue, "")}
            >
              {appType}
            </Button>
          </Badge>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <Badge variant="destructive" className="text-xs">
          {normalizedValue}
        </Badge>
        <SearchableSelect
          options={[
            { value: ActivityType.DEPOSIT, label: "Deposit" },
            { value: ActivityType.WITHDRAWAL, label: "Withdrawal" },
            { value: ActivityType.TRANSFER_IN, label: "Transfer In" },
            { value: ActivityType.TRANSFER_OUT, label: "Transfer Out" },
          ]}
          onValueChange={(v) => handleActivityTypeMapping(normalizedValue, v as ActivityType)}
          placeholder="Map to..."
          value=""
        />
      </div>
    );
  }

  // Category - show mapping UI
  if (field === "category") {
    const normalizedValue = value.trim();
    const mappedCategory = categoryMappings[normalizedValue];
    const categoryName = mappedCategory
      ? categories.find((c) => c.id === mappedCategory.categoryId)?.name
      : null;

    if (mappedCategory && categoryName) {
      return (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => handleCategoryMapping(normalizedValue, "", undefined)}
            >
              {categoryName}
            </Button>
          </Badge>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <Badge variant="destructive" className="text-xs">
          {normalizedValue}
        </Badge>
        <SearchableSelect
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          onValueChange={(v) => handleCategoryMapping(normalizedValue, v, undefined)}
          placeholder="Map to..."
          value=""
        />
      </div>
    );
  }

  // Event - show mapping UI
  if (field === "event") {
    const normalizedValue = value.trim();
    const mappedEventId = eventMappings[normalizedValue];
    const eventName = mappedEventId ? events.find((e) => e.id === mappedEventId)?.name : null;

    if (mappedEventId && eventName) {
      return (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => handleEventMapping(normalizedValue, "")}
            >
              {eventName}
            </Button>
          </Badge>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <Badge variant="destructive" className="text-xs">
          {normalizedValue}
        </Badge>
        <SearchableSelect
          options={events.map((e) => ({ value: e.id, label: e.name }))}
          onValueChange={(v) => handleEventMapping(normalizedValue, v)}
          placeholder="Map to..."
          value=""
        />
      </div>
    );
  }

  // Account - show mapping UI with AccountSelector
  if (field === "account") {
    const normalizedValue = value.trim();
    const mappedAccountId = accountMappings[normalizedValue];
    const account = mappedAccountId ? cashAccounts.find((a) => a.id === mappedAccountId) : null;

    if (mappedAccountId && account) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground max-w-[100px] truncate text-xs" title={normalizedValue}>
            {normalizedValue}
          </span>
          <Badge variant="secondary" className="text-xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => handleAccountMapping(normalizedValue, "")}
            >
              {account.name}
            </Button>
          </Badge>
        </div>
      );
    }

    return (
      <div className="flex w-full flex-col items-start gap-2 sm:flex-row sm:items-center">
        <span className="text-destructive max-w-[100px] truncate text-xs" title={normalizedValue}>
          {normalizedValue}
        </span>
        <SearchableSelect
          options={cashAccounts.map((acc) => ({ value: acc.id, label: acc.name }))}
          onValueChange={(v) => handleAccountMapping(normalizedValue, v)}
          placeholder="Map to..."
          value=""
        />
      </div>
    );
  }

  // Recurrence - show mapping UI
  if (field === "recurrence") {
    const normalizedValue = value.trim();
    const mappedRecurrence = recurrenceMappings[normalizedValue];

    const recurrenceLabel = (type: RecurrenceType) => {
      const labels: Record<RecurrenceType, string> = {
        fixed: "Fixed",
        variable: "Variable",
        periodic: "Periodic",
      };
      return labels[type] || type;
    };

    if (mappedRecurrence) {
      return (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => handleRecurrenceMapping(normalizedValue, "")}
            >
              {recurrenceLabel(mappedRecurrence)}
            </Button>
          </Badge>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <Badge variant="destructive" className="text-xs">
          {normalizedValue}
        </Badge>
        <SearchableSelect
          options={RECURRENCE_TYPES.map((type) => ({ value: type, label: recurrenceLabel(type) }))}
          onValueChange={(v) => handleRecurrenceMapping(normalizedValue, v as RecurrenceType)}
          placeholder="Map to..."
          value=""
        />
      </div>
    );
  }

  return <span className="text-muted-foreground text-xs">{value}</span>;
}

// Helper function outside the component
function findAppTypeForCsvTypeFn(
  csvType: string,
  mappings: Partial<Record<ActivityType, string[]>>,
): ActivityType | null {
  const normalizedCsvType = csvType.trim().toUpperCase();
  for (const [appType, csvTypes] of Object.entries(mappings)) {
    if (csvTypes?.some((t) => t.trim().toUpperCase() === normalizedCsvType)) {
      return appType as ActivityType;
    }
  }
  return null;
}
