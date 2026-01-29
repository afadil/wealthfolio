import { getAccountImportMapping, parseCsv } from "@/adapters";
import { AccountSelector } from "@/components/account-selector";
import { AccountSelectorMobile } from "@/components/account-selector-mobile";
import { useAccounts } from "@/hooks/use-accounts";
import { usePlatform } from "@/hooks/use-platform";
import type { Account } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@wealthfolio/ui/components/ui/card";
import { Checkbox } from "@wealthfolio/ui/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wealthfolio/ui/components/ui/collapsible";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Label } from "@wealthfolio/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui/components/ui/select";
import { useCallback, useEffect, useState } from "react";
import { FileDropzone } from "../components/file-dropzone";
import { HelpTooltip } from "../components/help-tooltip";
import {
  setAccountId,
  setFile,
  setMapping,
  setParseConfig,
  setParsedData,
} from "../context/import-actions";
import { useImportContext, type ParseConfig } from "../context/import-context";

// ─────────────────────────────────────────────────────────────────────────────
// CSV Preview Component
// ─────────────────────────────────────────────────────────────────────────────

interface CsvPreviewProps {
  headers: string[];
  rows: string[][];
  maxRows?: number;
}

function CsvPreview({ headers, rows, maxRows = 50 }: CsvPreviewProps) {
  const displayRows = rows.slice(0, maxRows);
  const hasMoreRows = rows.length > maxRows;

  if (headers.length === 0 && rows.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">CSV Preview</CardTitle>
          <span className="text-muted-foreground text-xs">
            {rows.length} row{rows.length !== 1 ? "s" : ""}
            {hasMoreRows && ` (showing first ${maxRows})`}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[300px] overflow-auto border-t">
          <table className="w-full">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-muted-foreground bg-muted w-12 border-r px-2 py-1.5 text-right font-mono text-xs">
                  #
                </th>
                {headers.map((header, idx) => (
                  <th
                    key={idx}
                    className="border-r px-2 py-1.5 text-left font-mono text-xs font-semibold last:border-r-0"
                  >
                    {header || <span className="text-muted-foreground italic">empty</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {displayRows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={cn(
                    "border-t transition-colors",
                    rowIdx % 2 === 0 ? "bg-background" : "bg-muted/30",
                    "hover:bg-muted/50",
                  )}
                >
                  <td className="text-muted-foreground bg-muted/20 w-12 border-r px-2 py-1 text-right">
                    {rowIdx + 1}
                  </td>
                  {row.map((cell, cellIdx) => (
                    <td
                      key={cellIdx}
                      className="max-w-[200px] truncate border-r px-2 py-1 last:border-r-0"
                      title={cell}
                    >
                      {cell || <span className="text-muted-foreground italic">-</span>}
                    </td>
                  ))}
                  {/* Fill empty cells if row has fewer columns than headers */}
                  {row.length < headers.length &&
                    Array.from({ length: headers.length - row.length }).map((_, idx) => (
                      <td key={`empty-${idx}`} className="border-r px-2 py-1 last:border-r-0">
                        <span className="text-muted-foreground italic">-</span>
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse Settings Panel Component
// ─────────────────────────────────────────────────────────────────────────────

interface ParseSettingsPanelProps {
  config: ParseConfig;
  onChange: (config: Partial<ParseConfig>) => void;
  hasErrors?: boolean;
}

// Format config value for display
function formatConfigValue(key: string, value: string | number | boolean): string {
  if (key === "delimiter") {
    const delimiterLabels: Record<string, string> = {
      auto: "Auto",
      ",": "Comma",
      ";": "Semicolon",
      "\t": "Tab",
    };
    return delimiterLabels[value as string] || String(value);
  }
  if (key === "dateFormat") {
    return value === "auto" ? "Auto" : String(value);
  }
  if (key === "decimalSeparator") {
    const decimalLabels: Record<string, string> = {
      auto: "Auto",
      ".": "Period",
      ",": "Comma",
    };
    return decimalLabels[value as string] || String(value);
  }
  return String(value);
}

// Build compact summary of parse settings
function buildConfigSummary(config: ParseConfig): string {
  const parts: string[] = [];

  // Only show non-default/non-auto values
  if (config.delimiter && config.delimiter !== "auto") {
    parts.push(`Delimiter: ${formatConfigValue("delimiter", config.delimiter)}`);
  }
  if (config.dateFormat && config.dateFormat !== "auto") {
    parts.push(`Date: ${config.dateFormat}`);
  }
  if (config.decimalSeparator && config.decimalSeparator !== "auto") {
    parts.push(`Decimal: ${formatConfigValue("decimalSeparator", config.decimalSeparator)}`);
  }
  if (config.skipTopRows > 0) {
    parts.push(`Skip top: ${config.skipTopRows}`);
  }
  if (config.skipBottomRows > 0) {
    parts.push(`Skip bottom: ${config.skipBottomRows}`);
  }
  if (!config.hasHeaderRow) {
    parts.push("No header");
  }

  return parts.length > 0 ? parts.join(" · ") : "Auto-detect";
}

function ParseSettingsPanel({ config, onChange, hasErrors = false }: ParseSettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(hasErrors);

  // Auto-open if there are errors
  useEffect(() => {
    if (hasErrors) {
      setIsOpen(true);
    }
  }, [hasErrors]);

  const configSummary = buildConfigSummary(config);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="hover:bg-muted/50 cursor-pointer px-4 py-3 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icons.Settings2 className="text-muted-foreground h-4 w-4" />
                <CardTitle className="text-sm font-medium">Parse Settings</CardTitle>
                {hasErrors && (
                  <span className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5 text-xs">
                    Adjust settings to fix errors
                  </span>
                )}
                {!isOpen && !hasErrors && (
                  <span className="text-muted-foreground text-xs font-normal">{configSummary}</span>
                )}
              </div>
              <Icons.ChevronDown
                className={cn(
                  "text-muted-foreground h-4 w-4 transition-transform duration-200",
                  isOpen && "rotate-180",
                )}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="border-t pt-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Has Header Row */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hasHeaderRow"
                  checked={config.hasHeaderRow}
                  onCheckedChange={(checked) => onChange({ hasHeaderRow: checked === true })}
                />
                <Label htmlFor="hasHeaderRow" className="cursor-pointer text-sm">
                  First row is header
                </Label>
              </div>

              {/* Skip Top Rows */}
              <div className="space-y-1.5">
                <Label htmlFor="skipTopRows" className="text-sm">
                  Skip top rows
                </Label>
                <Input
                  id="skipTopRows"
                  type="number"
                  min={0}
                  value={config.skipTopRows}
                  onChange={(e) =>
                    onChange({ skipTopRows: Math.max(0, parseInt(e.target.value) || 0) })
                  }
                  className="h-9"
                />
              </div>

              {/* Skip Bottom Rows */}
              <div className="space-y-1.5">
                <Label htmlFor="skipBottomRows" className="text-sm">
                  Skip bottom rows
                </Label>
                <Input
                  id="skipBottomRows"
                  type="number"
                  min={0}
                  value={config.skipBottomRows}
                  onChange={(e) =>
                    onChange({ skipBottomRows: Math.max(0, parseInt(e.target.value) || 0) })
                  }
                  className="h-9"
                />
              </div>

              {/* Delimiter */}
              <div className="space-y-1.5">
                <Label htmlFor="delimiter" className="text-sm">
                  Delimiter
                </Label>
                <Select
                  value={config.delimiter}
                  onValueChange={(value) => onChange({ delimiter: value })}
                >
                  <SelectTrigger id="delimiter" className="h-9">
                    <SelectValue placeholder="Select delimiter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect</SelectItem>
                    <SelectItem value=",">Comma (,)</SelectItem>
                    <SelectItem value=";">Semicolon (;)</SelectItem>
                    <SelectItem value="\t">Tab</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date Format */}
              <div className="space-y-1.5">
                <Label htmlFor="dateFormat" className="text-sm">
                  Date format
                </Label>
                <Select
                  value={config.dateFormat}
                  onValueChange={(value) => onChange({ dateFormat: value })}
                >
                  <SelectTrigger id="dateFormat" className="h-9">
                    <SelectValue placeholder="Select date format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="DD-MM-YYYY">DD-MM-YYYY</SelectItem>
                    <SelectItem value="MM-DD-YYYY">MM-DD-YYYY</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Decimal Separator */}
              <div className="space-y-1.5">
                <Label htmlFor="decimalSeparator" className="text-sm">
                  Decimal separator
                </Label>
                <Select
                  value={config.decimalSeparator}
                  onValueChange={(value) => onChange({ decimalSeparator: value })}
                >
                  <SelectTrigger id="decimalSeparator" className="h-9">
                    <SelectValue placeholder="Select separator" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect</SelectItem>
                    <SelectItem value=".">Period (.)</SelectItem>
                    <SelectItem value=",">Comma (,)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload Step Component
// ─────────────────────────────────────────────────────────────────────────────

export function UploadStep() {
  const { state, dispatch } = useImportContext();
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const { accounts } = useAccounts();
  const { isMobile } = usePlatform();

  // Sync selected account with context accountId on mount
  useEffect(() => {
    if (state.accountId && accounts) {
      const account = accounts.find((a: Account) => a.id === state.accountId);
      if (account) {
        setSelectedAccount(account);
      }
    }
  }, [state.accountId, accounts]);

  const handleAccountSelect = useCallback(
    async (account: Account) => {
      setSelectedAccount(account);
      dispatch(setAccountId(account.id));

      // Start with account's currency as default
      const parseConfigUpdates: Partial<ParseConfig> = {
        defaultCurrency: account.currency,
      };

      // Fetch and apply the import mapping profile for this account
      try {
        const mappingProfile = await getAccountImportMapping(account.id);
        if (mappingProfile) {
          // Store the mapping in context for the mapping step
          dispatch(setMapping(mappingProfile));

          // Apply parse config from the profile if available
          if (mappingProfile.parseConfig) {
            // Only apply non-null/undefined values from the profile
            if (mappingProfile.parseConfig.hasHeaderRow !== undefined) {
              parseConfigUpdates.hasHeaderRow = mappingProfile.parseConfig.hasHeaderRow;
            }
            if (mappingProfile.parseConfig.headerRowIndex !== undefined) {
              parseConfigUpdates.headerRowIndex = mappingProfile.parseConfig.headerRowIndex;
            }
            if (mappingProfile.parseConfig.delimiter) {
              parseConfigUpdates.delimiter = mappingProfile.parseConfig.delimiter;
            }
            if (mappingProfile.parseConfig.skipTopRows !== undefined) {
              parseConfigUpdates.skipTopRows = mappingProfile.parseConfig.skipTopRows;
            }
            if (mappingProfile.parseConfig.skipBottomRows !== undefined) {
              parseConfigUpdates.skipBottomRows = mappingProfile.parseConfig.skipBottomRows;
            }
            if (mappingProfile.parseConfig.skipEmptyRows !== undefined) {
              parseConfigUpdates.skipEmptyRows = mappingProfile.parseConfig.skipEmptyRows;
            }
            if (mappingProfile.parseConfig.dateFormat) {
              parseConfigUpdates.dateFormat = mappingProfile.parseConfig.dateFormat;
            }
            if (mappingProfile.parseConfig.decimalSeparator) {
              parseConfigUpdates.decimalSeparator = mappingProfile.parseConfig.decimalSeparator;
            }
            if (mappingProfile.parseConfig.thousandsSeparator) {
              parseConfigUpdates.thousandsSeparator = mappingProfile.parseConfig.thousandsSeparator;
            }
            // Profile's default currency takes precedence over account currency
            if (mappingProfile.parseConfig.defaultCurrency) {
              parseConfigUpdates.defaultCurrency = mappingProfile.parseConfig.defaultCurrency;
            }
          }
        }
      } catch {
        // Silently ignore errors - mapping profile may not exist for this account
        // This is expected for new accounts or accounts that haven't imported before
      }

      // Apply the config updates
      dispatch(setParseConfig(parseConfigUpdates));

      // Re-parse the file if one is already loaded
      if (state.file) {
        const newConfig = { ...state.parseConfig, ...parseConfigUpdates };
        parseCsv(state.file, newConfig)
          .then((result) => {
            setParseError(null);
            dispatch(setParsedData(result.headers, result.rows));
          })
          .catch((error) => {
            setParseError(error instanceof Error ? error.message : "Failed to parse CSV file");
          });
      }
    },
    [dispatch, state.file, state.parseConfig],
  );

  const { mutate: parseFile, isPending } = useMutation({
    mutationFn: (file: File) => parseCsv(file, state.parseConfig),
    onSuccess: (result) => {
      setParseError(null);
      dispatch(setParsedData(result.headers, result.rows));
      // Update config with auto-detected values
      dispatch(setParseConfig(result.detectedConfig));
    },
    onError: (error) => {
      setParseError(error instanceof Error ? error.message : "Failed to parse CSV file");
    },
  });

  const handleFileSelect = useCallback(
    (file: File | null) => {
      if (file) {
        dispatch(setFile(file));
        parseFile(file);
      } else {
        dispatch(setFile(null as unknown as File));
        dispatch(setParsedData([], []));
      }
    },
    [dispatch, parseFile],
  );

  // Re-parse when settings change
  const handleConfigChange = useCallback(
    (updates: Partial<ParseConfig>) => {
      dispatch(setParseConfig(updates));
      // Re-parse with new config if we have a file
      if (state.file) {
        const newConfig = { ...state.parseConfig, ...updates };
        parseCsv(state.file, newConfig)
          .then((result) => {
            setParseError(null);
            dispatch(setParsedData(result.headers, result.rows));
          })
          .catch((error) => {
            setParseError(error instanceof Error ? error.message : "Failed to parse CSV file");
          });
      }
    },
    [dispatch, state.file, state.parseConfig],
  );

  const hasParseErrors = parseError !== null;

  return (
    <div className="flex flex-col gap-4">
      {/* Row 1: Account and file selection */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Account Selection */}
        <div>
          <div className="mb-1 flex items-center">
            <h2 className="font-semibold">Select Account</h2>
            <HelpTooltip content="Choose the default account for imported activities. If your CSV includes an Account column with valid account ids, those will take priority for each row." />
          </div>
          <div className="h-[120px]">
            {isMobile ? (
              <div
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-3 rounded-lg border p-4 transition-colors",
                  selectedAccount && state.file
                    ? "border-border bg-background"
                    : "border-border bg-background/50 hover:border-muted-foreground/50 hover:bg-background/80 border-dashed",
                )}
              >
                {selectedAccount ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Icons.Briefcase className="text-primary h-5 w-5" />
                      <div className="text-center">
                        <p className="text-sm font-medium">{selectedAccount.name}</p>
                        <p className="text-muted-foreground text-xs">{selectedAccount.currency}</p>
                      </div>
                    </div>
                    <AccountSelectorMobile
                      setSelectedAccount={handleAccountSelect}
                      includePortfolio={false}
                      iconOnly={false}
                    />
                  </>
                ) : (
                  <>
                    <Icons.Briefcase className="text-muted-foreground h-8 w-8" />
                    <p className="text-muted-foreground text-center text-sm">No account selected</p>
                    <AccountSelectorMobile
                      setSelectedAccount={handleAccountSelect}
                      includePortfolio={false}
                      iconOnly={false}
                    />
                  </>
                )}
              </div>
            ) : (
              <AccountSelector
                selectedAccount={selectedAccount}
                setSelectedAccount={handleAccountSelect}
              />
            )}
          </div>
        </div>

        {/* File Upload */}
        <div>
          <div className="mb-1 flex items-center">
            <h2 className="font-semibold">Upload CSV File</h2>
            <HelpTooltip content="Upload a CSV file containing your investment activities. The file should include headers in the first row." />
          </div>
          <div className="h-[120px]">
            <FileDropzone
              file={state.file}
              onFileChange={handleFileSelect}
              isLoading={isPending}
              accept=".csv"
              isValid={!hasParseErrors}
              error={parseError}
            />
          </div>
        </div>
      </div>

      {/* Parse Settings - collapsed by default, opens on errors */}
      {state.file && (
        <ParseSettingsPanel
          config={state.parseConfig}
          onChange={handleConfigChange}
          hasErrors={hasParseErrors}
        />
      )}

      {/* CSV Preview */}
      {state.file && state.headers.length > 0 && (
        <CsvPreview headers={state.headers} rows={state.parsedRows} maxRows={50} />
      )}
    </div>
  );
}
