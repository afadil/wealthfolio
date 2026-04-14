import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Button } from "@wealthfolio/ui/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@wealthfolio/ui/components/ui/form";
import { Icons } from "@wealthfolio/ui/components/ui/icons";
import { Input } from "@wealthfolio/ui/components/ui/input";
import { Label } from "@wealthfolio/ui/components/ui/label";
import { Switch } from "@wealthfolio/ui/components/ui/switch";
import { Textarea } from "@wealthfolio/ui/components/ui/textarea";
import { Badge } from "@wealthfolio/ui/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wealthfolio/ui/components/ui/collapsible";

import { useTestCustomProviderSource } from "@/hooks/use-custom-providers";
import type {
  TestSourceResult,
  DetectedHtmlElement,
  DetectedHtmlTable,
} from "@/lib/types/custom-provider";
import { cn } from "@/lib/utils";

import { TimezoneInput } from "@/pages/settings/general/timezone-input";
import { RawResponseViewer } from "./response-preview";
import { walkJson, friendlyPath, formatNumber, type PathEntry } from "./json-path-suggestions";
import {
  LATEST_TEMPLATES,
  HISTORICAL_TEMPLATES,
  type ProviderTemplate,
} from "./provider-templates";
import type { FormValues } from "./custom-provider-form";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StepIndicator({ number, completed }: { number: number; completed: boolean }) {
  const { t } = useTranslation("common");
  return (
    <div
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
        completed ? "bg-success/15 text-success" : "bg-primary/10 text-primary",
      )}
    >
      {completed ? <Icons.Check className="h-3.5 w-3.5" /> : t("settings.market_data.custom_provider.step", { number })}
    </div>
  );
}

function VerificationCard({ result }: { result: TestSourceResult }) {
  const { t } = useTranslation("common");
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-4",
        result.success
          ? "border-success/30 bg-success/5"
          : "border-destructive/30 bg-destructive/5",
      )}
    >
      {result.success ? (
        <>
          <Icons.CheckCircle className="text-success h-5 w-5 shrink-0" />
          <div>
            <p className="text-lg font-semibold tabular-nums">
              {result.price?.toLocaleString()}
              {result.currency && (
                <span className="text-muted-foreground ml-1.5 text-sm font-normal">
                  {result.currency}
                </span>
              )}
            </p>
            <p className="text-muted-foreground text-xs">
              {t("settings.market_data.custom_provider.price_verified")}
              {result.date ? ` (${result.date})` : ""}
            </p>
          </div>
        </>
      ) : (
        <>
          <Icons.XCircle className="text-destructive h-5 w-5 shrink-0" />
          <div>
            <p className="text-destructive text-sm font-medium">
              {t("settings.market_data.custom_provider.could_not_extract_price")}
            </p>
            <p className="text-muted-foreground text-xs">{result.error}</p>
          </div>
        </>
      )}
    </div>
  );
}

function ValueCardGrid({
  entries,
  selectedPath,
  onSelect,
  maxVisible = 12,
}: {
  entries: PathEntry[];
  selectedPath?: string;
  onSelect: (path: string) => void;
  maxVisible?: number;
}) {
  const { t } = useTranslation("common");
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? entries : entries.slice(0, maxVisible);
  const hasMore = entries.length > maxVisible;

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {visible.map((entry) => (
          <button
            key={entry.path}
            type="button"
            onClick={() => onSelect(entry.path)}
            className={cn(
              "relative flex flex-col rounded-lg border p-3 text-left transition-all",
              selectedPath === entry.path
                ? "border-primary bg-primary/5 ring-primary/20 ring-1"
                : "hover:border-foreground/20 hover:bg-accent/50",
            )}
          >
            <span className="text-muted-foreground truncate font-mono text-[11px]">
              {friendlyPath(entry.path)}
            </span>
            <span className="mt-0.5 font-mono text-base font-semibold tabular-nums">
              {formatNumber(entry.value)}
            </span>
            {selectedPath === entry.path && (
              <Icons.CheckCircle className="text-primary absolute right-2 top-2 h-4 w-4" />
            )}
          </button>
        ))}
      </div>
      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-muted-foreground hover:text-foreground mt-2 text-xs underline underline-offset-2"
        >
          {t("settings.market_data.custom_provider.show_more_values", {
            count: entries.length - maxVisible,
          })}
        </button>
      )}
    </div>
  );
}

function HtmlElementGrid({
  elements,
  selectedSelector,
  onSelect,
  maxVisible = 10,
}: {
  elements: DetectedHtmlElement[];
  selectedSelector?: string;
  onSelect: (selector: string) => void;
  maxVisible?: number;
}) {
  const { t } = useTranslation("common");
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? elements : elements.slice(0, maxVisible);
  const hasMore = elements.length > maxVisible;

  return (
    <div className="space-y-2">
      {visible.map((entry) => {
        const isSelected = selectedSelector === entry.selector;
        return (
          <button
            key={entry.selector}
            type="button"
            onClick={() => onSelect(entry.selector)}
            className={cn(
              "group flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all",
              isSelected
                ? "border-primary bg-primary/5 ring-primary/20 ring-1"
                : "hover:border-foreground/20 hover:bg-accent/50",
            )}
          >
            {/* Checkbox */}
            <div className="mt-0.5 shrink-0">
              {isSelected ? (
                <Icons.CheckCircle className="text-primary h-4 w-4" />
              ) : (
                <div className="border-muted-foreground/30 group-hover:border-foreground/50 h-4 w-4 rounded border transition-colors" />
              )}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 space-y-1">
              {/* Selector badge */}
              <code className="bg-muted/60 inline-block max-w-full truncate rounded px-1.5 py-0.5 font-mono text-[11px]">
                {entry.selector}
              </code>
              {/* Label */}
              {entry.label && <p className="text-muted-foreground text-[11px]">{entry.label}</p>}
              {/* HTML context preview */}
              {entry.htmlContext && (
                <pre className="bg-muted/40 text-muted-foreground/80 mt-1.5 overflow-x-auto rounded p-2 font-mono text-[10px] leading-relaxed">
                  {entry.htmlContext}
                </pre>
              )}
            </div>

            {/* Value */}
            <span className="shrink-0 pt-0.5 font-mono text-base font-semibold tabular-nums">
              {formatNumber(entry.value)}
            </span>
          </button>
        );
      })}
      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-muted-foreground hover:text-foreground mt-1 text-xs underline underline-offset-2"
        >
          {t("settings.market_data.custom_provider.show_more_elements", {
            count: elements.length - maxVisible,
          })}
        </button>
      )}
    </div>
  );
}

function HtmlTablePicker({
  tables,
  onSelect,
}: {
  tables: DetectedHtmlTable[];
  onSelect: (
    pricePath: string,
    datePath?: string,
    highPath?: string,
    lowPath?: string,
    volumePath?: string,
  ) => void;
}) {
  const { t } = useTranslation("common");
  if (tables.length === 0) return null;

  const roleColor: Record<string, string> = {
    close: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    date: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    high: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    low: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    volume: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    open: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400",
  };

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {t("settings.market_data.custom_provider.tables_found", { count: tables.length })}
      </p>
      {tables.map((table) => {
        const closeCol = table.columns.find((c) => c.role === "close");
        const dateCol = table.columns.find((c) => c.role === "date");
        const highCol = table.columns.find((c) => c.role === "high");
        const lowCol = table.columns.find((c) => c.role === "low");
        const volCol = table.columns.find((c) => c.role === "volume");

        return (
          <button
            key={table.index}
            type="button"
            onClick={() => {
              const ti = table.index;
              onSelect(
                closeCol ? `${ti}:${closeCol.index}` : `${ti}:0`,
                dateCol ? `${ti}:${dateCol.index}` : undefined,
                highCol ? `${ti}:${highCol.index}` : undefined,
                lowCol ? `${ti}:${lowCol.index}` : undefined,
                volCol ? `${ti}:${volCol.index}` : undefined,
              );
            }}
            className="hover:border-foreground/20 hover:bg-accent/50 w-full rounded-lg border p-3 text-left transition-all"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-medium">
                {t("settings.market_data.custom_provider.table_n", { number: table.index + 1 })}
              </span>
              <span className="text-muted-foreground text-xs">
                {t("settings.market_data.custom_provider.table_rows_columns", {
                  rows: table.rowCount,
                  columns: table.columns.length,
                })}
              </span>
            </div>

            {/* Column role chips */}
            <div className="mb-2 flex flex-wrap gap-1">
              {table.columns.map((col) => (
                <span
                  key={col.index}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    col.role
                      ? (roleColor[col.role] ?? "bg-muted text-muted-foreground")
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {col.header || t("settings.market_data.custom_provider.column_n", { number: col.index })}
                  {col.role && ` (${col.role})`}
                </span>
              ))}
            </div>

            {/* Sample rows */}
            {table.sampleRows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="text-muted-foreground w-full text-[11px]">
                  <thead>
                    <tr>
                      {table.columns.map((col) => (
                        <th key={col.index} className="border-b px-2 py-1 text-left font-medium">
                          {col.header || t("settings.market_data.custom_provider.column_n", { number: col.index })}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.sampleRows.slice(0, 3).map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="border-b px-2 py-1">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SourceConfigPanelProps {
  form: UseFormReturn<FormValues>;
  prefix: "latestSource" | "historicalSource";
  isHistorical?: boolean;
  onUrlChange?: (url: string) => void;
}

export function SourceConfigPanel({
  form,
  prefix,
  isHistorical = false,
  onUrlChange,
}: SourceConfigPanelProps) {
  const { t } = useTranslation("common");
  const [testSymbol, setTestSymbol] = useState("");
  const [testIsin, setTestIsin] = useState("");
  const [testMic, setTestMic] = useState("");
  const [testCurrency, setTestCurrency] = useState("");
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [detectedElements, setDetectedElements] = useState<DetectedHtmlElement[]>([]);
  const [detectedTables, setDetectedTables] = useState<DetectedHtmlTable[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestSourceResult | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [rawResponseOpen, setRawResponseOpen] = useState(false);
  const { mutate: testSource, isPending: isFetching } = useTestCustomProviderSource();
  const verifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup pending timer on unmount
  useEffect(() => {
    return () => {
      if (verifyTimer.current) clearTimeout(verifyTimer.current);
    };
  }, []);

  const format = form.watch(`${prefix}.format`) ?? "json";
  const pricePath = form.watch(`${prefix}.pricePath`);
  const urlValue = form.watch(`${prefix}.url`) ?? "";

  const timezones = useMemo(() => {
    const supportedValuesOf = (
      Intl as unknown as { supportedValuesOf?: (key: "timeZone") => string[] }
    ).supportedValuesOf;
    const raw = typeof supportedValuesOf === "function" ? supportedValuesOf("timeZone") : [];
    const merged = raw.includes("UTC") ? raw : ["UTC", ...raw];
    return Array.from(new Set(merged)).sort((a, b) => a.localeCompare(b));
  }, []);

  // Detect which extra placeholders the URL uses
  const extraPlaceholders = useMemo(
    () => ({
      isin: urlValue.includes("{ISIN}"),
      mic: urlValue.includes("{MIC}"),
      currency: urlValue.includes("{CURRENCY}") || urlValue.includes("{currency}"),
    }),
    [urlValue],
  );
  /** Replace user-provided placeholder values in the URL before sending to test_source. */
  const expandTestUrl = useCallback(
    (url: string) => {
      let expanded = url;
      if (extraPlaceholders.isin) expanded = expanded.replaceAll("{ISIN}", testIsin);
      if (extraPlaceholders.mic) expanded = expanded.replaceAll("{MIC}", testMic);
      if (extraPlaceholders.currency) {
        expanded = expanded.replaceAll("{currency}", testCurrency.toLowerCase());
        expanded = expanded.replaceAll("{CURRENCY}", testCurrency);
      }
      return expanded;
    },
    [extraPlaceholders, testIsin, testMic, testCurrency],
  );

  const numericEntries = useMemo(() => {
    if (!rawResponse || format !== "json") return [];
    try {
      const parsed: unknown = JSON.parse(rawResponse);
      return walkJson(parsed);
    } catch {
      return [];
    }
  }, [rawResponse, format]);

  const hasFetched =
    rawResponse !== null || detectedElements.length > 0 || detectedTables.length > 0;

  const applyTemplate = useCallback(
    (t: ProviderTemplate) => {
      // Reset all source fields to defaults before applying template values
      form.setValue(`${prefix}.format`, t.format);
      form.setValue(`${prefix}.url`, t.url);
      form.setValue(`${prefix}.pricePath`, t.pricePath);
      form.setValue(`${prefix}.datePath`, t.datePath ?? "");
      form.setValue(`${prefix}.dateFormat`, "");
      form.setValue(`${prefix}.highPath`, t.highPath ?? "");
      form.setValue(`${prefix}.lowPath`, t.lowPath ?? "");
      form.setValue(`${prefix}.volumePath`, t.volumePath ?? "");
      form.setValue(`${prefix}.headers`, t.headers ?? "");
      form.setValue(`${prefix}.currencyPath`, "");
      form.setValue(`${prefix}.locale`, "");
      form.setValue(`${prefix}.factor`, undefined);
      form.setValue(`${prefix}.invert`, false);
      form.setValue(`${prefix}.dateTimezone`, "");
      if (t.headers) {
        setAdvancedOpen(true);
      }
      setTestSymbol(t.testSymbol);
      onUrlChange?.(t.url);
      // Reset previous fetch state
      setRawResponse(null);
      setDetectedElements([]);
      setDetectedTables([]);
      setTestResult(null);
      setFetchError(null);
    },
    [form, prefix, onUrlChange],
  );

  // Fetch raw response
  const handleFetch = useCallback(() => {
    const rawUrl = form.getValues(`${prefix}.url`);
    if (!rawUrl || !testSymbol) return;
    const url = expandTestUrl(rawUrl);

    setTestResult(null);
    setFetchError(null);
    setRawResponseOpen(false);

    const dummyPath = format === "html" ? "body" : format === "html_table" ? "" : "$";
    const headers = form.getValues(`${prefix}.headers`);

    testSource(
      {
        format,
        url,
        pricePath: dummyPath,
        symbol: testSymbol,
        headers: headers || undefined,
      },
      {
        onSuccess: (result) => {
          // Store detected HTML elements/tables from backend
          setDetectedElements(result.detectedElements ?? []);
          setDetectedTables(result.detectedTables ?? []);

          if (result.detectedTables && result.detectedTables.length > 0) {
            // HTML table format: show table picker
            setRawResponse(null);
          } else if (result.rawResponse) {
            setRawResponse(result.rawResponse);
            const trimmed = result.rawResponse.trimStart();
            const detected = trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : "html";
            // Only auto-switch format on the initial connect (when price path is still
            // at the dummy placeholder), so we don't overwrite a user's explicit choice.
            if (!isHistorical && format !== "csv" && !pricePath) {
              form.setValue(`${prefix}.format`, detected);
            }
          } else if (result.detectedElements && result.detectedElements.length > 0) {
            // HTML format: no rawResponse needed, we have structured elements
            setRawResponse(null);
          } else if (result.success) {
            setRawResponse(null);
            setTestResult(result);
          } else {
            setRawResponse(null);
            setFetchError(result.error ?? "Empty response from server.");
            if (result.error && /403|forbidden|denied/i.test(result.error)) {
              setAdvancedOpen(true);
            }
          }
        },
        onError: (err) => {
          setRawResponse(null);
          setDetectedElements([]);
          setDetectedTables([]);
          setFetchError(err.message);
          if (/403|forbidden|denied/i.test(err.message)) {
            setAdvancedOpen(true);
          }
        },
      },
    );
  }, [form, prefix, format, testSymbol, testSource, isHistorical, expandTestUrl]);

  // Debounced verify
  const scheduleVerify = useCallback(
    (path: string) => {
      if (verifyTimer.current) clearTimeout(verifyTimer.current);
      if (
        (!rawResponse && detectedElements.length === 0 && detectedTables.length === 0) ||
        !path ||
        path === "$" ||
        path === "body"
      )
        return;

      verifyTimer.current = setTimeout(() => {
        const rawUrl = form.getValues(`${prefix}.url`);
        if (!rawUrl || !testSymbol) return;
        const url = expandTestUrl(rawUrl);

        const values = form.getValues(prefix);
        testSource(
          {
            format: values?.format ?? "json",
            url,
            pricePath: path,
            datePath: values?.datePath || undefined,
            dateFormat: values?.dateFormat || undefined,
            currencyPath: values?.currencyPath || undefined,
            factor: values?.factor ?? undefined,
            invert: values?.invert ?? undefined,
            locale: values?.locale || undefined,
            headers: values?.headers || undefined,
            symbol: testSymbol,
          },
          {
            onSuccess: (result) => setTestResult(result),
            onError: (err) => setTestResult({ success: false, error: err.message }),
          },
        );
      }, 300);
    },
    [
      rawResponse,
      detectedElements,
      detectedTables,
      form,
      prefix,
      testSymbol,
      testSource,
      expandTestUrl,
    ],
  );

  const handlePathSelect = useCallback(
    (path: string) => {
      form.setValue(`${prefix}.pricePath`, path, { shouldValidate: true });
      scheduleVerify(path);
    },
    [form, prefix, scheduleVerify],
  );

  const handleHtmlTest = useCallback(() => {
    const values = form.getValues(prefix);
    const rawUrl = form.getValues(`${prefix}.url`);
    if (!values?.pricePath || !rawUrl || !testSymbol) return;
    const url = expandTestUrl(rawUrl);
    testSource(
      {
        format: "html",
        url,
        pricePath: values.pricePath,
        currencyPath: values.currencyPath || undefined,
        factor: values.factor ?? undefined,
        invert: values.invert ?? undefined,
        locale: values.locale || undefined,
        headers: values.headers || undefined,
        symbol: testSymbol,
      },
      {
        onSuccess: (result) => setTestResult(result),
        onError: (err) => setTestResult({ success: false, error: err.message }),
      },
    );
  }, [form, prefix, testSymbol, testSource, expandTestUrl]);

  return (
    <div className="space-y-3">
      {/* ── Step 1: Connect ── */}
      <div className="rounded-xl border p-4">
        <div className="mb-3 flex items-center gap-2.5">
          <StepIndicator number={1} completed={hasFetched} />
            <h3 className="text-sm font-semibold">
              {t("settings.market_data.custom_provider.connect_data_source")}
            </h3>
        </div>

        <div className="space-y-4">
          {/* Source type toggle */}
          <FormField
            control={form.control}
            name={`${prefix}.format`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("settings.market_data.custom_provider.source_type")}</FormLabel>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    [
                      {
                        value: "json",
                        label: t("settings.market_data.custom_provider.format_json"),
                        desc: t("settings.market_data.custom_provider.format_json_desc"),
                      },
                      {
                        value: "html",
                        label: t("settings.market_data.custom_provider.format_html"),
                        desc: t("settings.market_data.custom_provider.format_html_desc"),
                      },
                      {
                        value: "html_table",
                        label: t("settings.market_data.custom_provider.format_html_table"),
                        desc: t("settings.market_data.custom_provider.format_html_table_desc"),
                      },
                      {
                        value: "csv",
                        label: t("settings.market_data.custom_provider.format_csv"),
                        desc: t("settings.market_data.custom_provider.format_csv_desc"),
                      },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => field.onChange(opt.value)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border p-2.5 text-center transition-all",
                        field.value === opt.value
                          ? "border-primary bg-primary/5 ring-primary/20 ring-1"
                          : "hover:border-foreground/20 hover:bg-accent/50",
                      )}
                    >
                      <span className="text-sm font-medium">{opt.label}</span>
                      <span className="text-muted-foreground text-[10px]">{opt.desc}</span>
                    </button>
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Quick-start templates */}
          {(() => {
            const templates = (isHistorical ? HISTORICAL_TEMPLATES : LATEST_TEMPLATES).filter(
              (t) => t.format === format,
            );
            if (templates.length === 0) return null;
            return (
              <div>
                <p className="text-muted-foreground mb-2 text-[11px] font-medium uppercase tracking-wide">
                  {t("settings.market_data.custom_provider.quick_start")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {templates.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="hover:bg-accent hover:border-foreground/20 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors"
                    >
                      <Icons.Globe className="text-muted-foreground h-3 w-3" />
                      <span className="font-medium">{t.name}</span>
                      <span className="text-muted-foreground hidden sm:inline">
                        — {t.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* URL */}
          <FormField
            control={form.control}
            name={`${prefix}.url`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("settings.market_data.custom_provider.url_template")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={
                      format === "json"
                        ? t("settings.market_data.custom_provider.url_placeholder_json")
                        : t("settings.market_data.custom_provider.url_placeholder_html")
                    }
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      onUrlChange?.(e.target.value);
                    }}
                  />
                </FormControl>
                <p className="text-muted-foreground text-[11px]">
                  {t("settings.market_data.custom_provider.placeholders")}:{" "}
                  <code className="bg-muted rounded px-1 font-mono">{"{SYMBOL}"}</code>{" "}
                  <code className="bg-muted rounded px-1 font-mono">{"{ISIN}"}</code>{" "}
                  <code className="bg-muted rounded px-1 font-mono">{"{MIC}"}</code>{" "}
                  <code className="bg-muted rounded px-1 font-mono">{"{CURRENCY}"}</code>{" "}
                  <code className="bg-muted rounded px-1 font-mono">{"{currency}"}</code>{" "}
                  <code className="bg-muted rounded px-1 font-mono">{"{TODAY}"}</code>{" "}
                  <code className="bg-muted rounded px-1 font-mono">{"{FROM}"}</code>{" "}
                  <code className="bg-muted rounded px-1 font-mono">{"{TO}"}</code>{" "}
                  <code className="bg-muted rounded px-1 font-mono">{"{DATE:%Y-%m-%d}"}</code>
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Symbol + extra placeholders + Fetch */}
          <div className="flex items-end gap-2">
            <div className="flex min-w-0 flex-1 gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label className="text-sm">
                  {t("settings.market_data.custom_provider.test_with_symbol")}
                </Label>
                <Input
                  placeholder={t("settings.market_data.custom_provider.placeholder_symbol")}
                  value={testSymbol}
                  onChange={(e) => setTestSymbol(e.target.value)}
                />
              </div>
              {extraPlaceholders.isin && (
                <div className="w-28 space-y-1.5">
                  <Label className="text-sm">{t("settings.market_data.custom_provider.isin")}</Label>
                  <Input
                    placeholder={t("settings.market_data.custom_provider.placeholder_isin")}
                    value={testIsin}
                    onChange={(e) => setTestIsin(e.target.value)}
                  />
                </div>
              )}
              {extraPlaceholders.mic && (
                <div className="w-24 space-y-1.5">
                  <Label className="text-sm">{t("settings.market_data.custom_provider.mic")}</Label>
                  <Input
                    placeholder={t("settings.market_data.custom_provider.placeholder_mic")}
                    value={testMic}
                    onChange={(e) => setTestMic(e.target.value)}
                  />
                </div>
              )}
              {extraPlaceholders.currency && (
                <div className="w-20 space-y-1.5">
                  <Label className="text-sm">{t("settings.market_data.custom_provider.currency")}</Label>
                  <Input
                    placeholder={t("settings.market_data.custom_provider.placeholder_currency")}
                    value={testCurrency}
                    onChange={(e) => setTestCurrency(e.target.value)}
                  />
                </div>
              )}
            </div>
            <Button
              type="button"
              onClick={handleFetch}
              disabled={isFetching || !testSymbol || !form.getValues(`${prefix}.url`)}
              className="shrink-0"
            >
              {isFetching ? (
                <Icons.Spinner className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icons.PlayCircle className="mr-1.5 h-3.5 w-3.5" />
              )}
              {t("settings.market_data.custom_provider.fetch")}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Fetch error ── */}
      {fetchError && !isFetching && (
        <div className="border-destructive/20 bg-destructive/5 rounded-xl border p-4">
          <div className="flex items-start gap-2">
            <Icons.XCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="text-destructive text-sm">{fetchError}</p>
              {/403|forbidden|denied/i.test(fetchError) && (
                <p className="text-muted-foreground mt-1 text-xs">
                  {t("settings.market_data.custom_provider.site_blocks_requests_hint")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Loading state ── */}
      {isFetching && !hasFetched && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-8">
          <Icons.Spinner className="text-muted-foreground h-4 w-4 animate-spin" />
          <span className="text-muted-foreground text-sm">
            {t("settings.market_data.custom_provider.fetching_response")}
          </span>
        </div>
      )}

      {/* ── Step 2: Select price ── */}
      {hasFetched && (
        <div className="rounded-xl border p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <StepIndicator number={2} completed={!!testResult?.success} />
            <h3 className="text-sm font-semibold">
              {format === "html_table"
                ? t("settings.market_data.custom_provider.select_table")
                : format === "csv"
                  ? t("settings.market_data.custom_provider.configure_csv_columns")
                  : format === "json"
                    ? t("settings.market_data.custom_provider.select_price_value")
                    : t("settings.market_data.custom_provider.find_price_on_page")}
            </h3>
            <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px] font-normal">
              {format.toUpperCase().replace("_", " ")}
            </Badge>
          </div>

          {format === "html_table" ? (
            <div className="space-y-3">
              <HtmlTablePicker
                tables={detectedTables}
                onSelect={(pp, dp, hp, lp, vp) => {
                  form.setValue(`${prefix}.pricePath`, pp, { shouldValidate: true });
                  if (dp) form.setValue(`${prefix}.datePath`, dp);
                  if (hp) form.setValue(`${prefix}.highPath`, hp);
                  if (lp) form.setValue(`${prefix}.lowPath`, lp);
                  if (vp) form.setValue(`${prefix}.volumePath`, vp);
                  scheduleVerify(pp);
                }}
              />

              {/* Manual path inputs */}
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name={`${prefix}.pricePath`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">
                        {t("settings.market_data.custom_provider.price_column_table_col")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("settings.market_data.custom_provider.placeholder_table_col_price")}
                          className="font-mono text-xs"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`${prefix}.datePath`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">
                        {t("settings.market_data.custom_provider.date_column_table_col")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("settings.market_data.custom_provider.placeholder_table_col_date")}
                          className="font-mono text-xs"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {testResult && <VerificationCard result={testResult} />}
            </div>
          ) : format === "csv" ? (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">
                {t("settings.market_data.custom_provider.enter_column_or_index")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name={`${prefix}.pricePath`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">
                        {t("settings.market_data.custom_provider.price_column")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("settings.market_data.custom_provider.placeholder_close_or_3")}
                          className="font-mono text-xs"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`${prefix}.datePath`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">
                        {t("settings.market_data.custom_provider.date_column")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("settings.market_data.custom_provider.placeholder_date_or_0")}
                          className="font-mono text-xs"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {testResult && <VerificationCard result={testResult} />}

              {rawResponse && (
                <Collapsible open={rawResponseOpen} onOpenChange={setRawResponseOpen}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
                    >
                      <Icons.ChevronRight
                        className={cn(
                          "h-3 w-3 transition-transform",
                          rawResponseOpen && "rotate-90",
                        )}
                      />
                      {t("settings.market_data.custom_provider.view_raw_csv")}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="bg-muted/30 mt-2 max-h-60 overflow-auto rounded-lg border p-3 font-mono text-xs">
                      {rawResponse.slice(0, 3000)}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          ) : format === "json" ? (
            <div className="space-y-3">
              {numericEntries.length > 0 ? (
                <>
                  <p className="text-muted-foreground text-sm">
                    {t("settings.market_data.custom_provider.click_price_value")}
                  </p>
                  <ValueCardGrid
                    entries={numericEntries}
                    selectedPath={pricePath}
                    onSelect={handlePathSelect}
                  />
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {t("settings.market_data.custom_provider.no_numeric_values")}
                </p>
              )}

              {/* Manual path input */}
              <FormField
                control={form.control}
                name={`${prefix}.pricePath`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-muted-foreground text-xs">
                      {t("settings.market_data.custom_provider.extraction_path")}
                      {numericEntries.length > 0 && (
                        <span className="ml-1 font-normal">
                          ({t("settings.market_data.custom_provider.extraction_path_autofill")})
                        </span>
                      )}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("settings.market_data.custom_provider.placeholder_data_price")}
                        className="font-mono text-xs"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          scheduleVerify(e.target.value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Verification result */}
              {testResult && <VerificationCard result={testResult} />}

              {/* Raw JSON collapsible */}
              <Collapsible open={rawResponseOpen} onOpenChange={setRawResponseOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
                  >
                    <Icons.ChevronRight
                      className={cn("h-3 w-3 transition-transform", rawResponseOpen && "rotate-90")}
                    />
                    {t("settings.market_data.custom_provider.view_raw_json")}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {rawResponse && (
                    <div className="bg-muted/30 mt-2 max-h-60 overflow-auto rounded-lg border">
                      <RawResponseViewer
                        rawResponse={rawResponse}
                        format="json"
                        onPathClick={handlePathSelect}
                      />
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">
                {t("settings.market_data.custom_provider.page_fetched_hint")}
              </p>

              {/* CSS Selector input + test — primary action */}
              <FormField
                control={form.control}
                name={`${prefix}.pricePath`}
                render={({ field }) => (
                  <FormItem>
                      <FormLabel>{t("settings.market_data.custom_provider.css_selector")}</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder={t("settings.market_data.custom_provider.placeholder_css_selector")}
                          className="font-mono text-xs"
                          {...field}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        onClick={handleHtmlTest}
                        disabled={isFetching || !pricePath}
                        className="shrink-0"
                        size="sm"
                      >
                        {isFetching ? (
                          <Icons.Spinner className="mr-1.5 h-3 w-3 animate-spin" />
                        ) : (
                          <Icons.PlayCircle className="mr-1.5 h-3 w-3" />
                        )}
                        {t("settings.market_data.custom_provider.test")}
                      </Button>
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      {t("settings.market_data.custom_provider.css_tip")}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Verification result */}
              {testResult && <VerificationCard result={testResult} />}

              {/* Detected elements — shown when available */}
              {detectedElements.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-2 text-[11px] font-medium uppercase tracking-wide">
                    {t("settings.market_data.custom_provider.detected_elements", {
                      count: detectedElements.length,
                    })}
                  </p>
                  <p className="text-muted-foreground mb-2 text-xs">
                    {t("settings.market_data.custom_provider.detected_elements_hint")}
                  </p>
                  <div className="max-h-72 overflow-y-auto rounded-lg border p-2">
                    <HtmlElementGrid
                      elements={detectedElements}
                      selectedSelector={pricePath}
                      onSelect={handlePathSelect}
                    />
                  </div>
                </div>
              )}

              {/* Raw HTML collapsible — only shown when backend returns raw response */}
              {rawResponse && (
                <Collapsible open={rawResponseOpen} onOpenChange={setRawResponseOpen}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
                    >
                      <Icons.ChevronRight
                        className={cn(
                          "h-3 w-3 transition-transform",
                          rawResponseOpen && "rotate-90",
                        )}
                      />
                      {t("settings.market_data.custom_provider.view_page_source")}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="bg-muted/30 mt-2 max-h-60 overflow-auto rounded-lg border">
                      <RawResponseViewer rawResponse={rawResponse} format="html" />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Historical fields ── */}
      {isHistorical && format !== "html_table" && format !== "csv" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="historicalSource.datePath"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("settings.market_data.custom_provider.date_path")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("settings.market_data.custom_provider.placeholder_data_date")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="historicalSource.dateFormat"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("settings.market_data.custom_provider.date_format")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("settings.market_data.custom_provider.placeholder_date_format")} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {/* ── Advanced options ── */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            <Icons.ChevronRight
              className={cn("h-3 w-3 transition-transform", advancedOpen && "rotate-90")}
            />
            {t("settings.market_data.custom_provider.advanced_options")}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-3 rounded-xl border p-4">
            <FormField
              control={form.control}
              name={`${prefix}.currencyPath`}
              render={({ field }) => (
                <FormItem>
                <FormLabel>{t("settings.market_data.custom_provider.currency_path")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("settings.market_data.custom_provider.placeholder_currency_path")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name={`${prefix}.headers`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.market_data.custom_provider.custom_headers")}</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder='{"Authorization": "Bearer token"}' {...field} />
                  </FormControl>
                  <p className="text-muted-foreground text-[11px]">
                    {t("settings.market_data.custom_provider.secret_prefix_hint")}
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <FormField
                control={form.control}
                name={`${prefix}.factor`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.market_data.custom_provider.factor")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder={t("settings.market_data.custom_provider.placeholder_factor")}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`${prefix}.locale`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.market_data.custom_provider.locale")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("settings.market_data.custom_provider.placeholder_locale")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`${prefix}.invert`}
                render={({ field }) => (
                  <FormItem className="flex flex-col justify-end">
                    <div className="flex items-center gap-2 pb-1">
                      <Switch
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        id={`${prefix}-invert`}
                      />
                      <Label htmlFor={`${prefix}-invert`} className="text-sm">
                        {t("settings.market_data.custom_provider.invert")}
                      </Label>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* OHLCV extraction paths */}
            {(format === "json" || format === "csv") && (
              <div className="grid gap-3 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name={`${prefix}.highPath`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settings.market_data.custom_provider.high_path")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={format === "csv" ? "High" : "$.high"}
                          className="font-mono text-xs"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`${prefix}.lowPath`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settings.market_data.custom_provider.low_path")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={format === "csv" ? "Low" : "$.low"}
                          className="font-mono text-xs"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`${prefix}.volumePath`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settings.market_data.custom_provider.volume_path")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={format === "csv" ? "Volume" : "$.volume"}
                          className="font-mono text-xs"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Default price + date timezone */}
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name={`${prefix}.defaultPrice`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.market_data.custom_provider.default_price")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder={t("settings.market_data.custom_provider.static_fallback_price")}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                        }
                      />
                    </FormControl>
                    <p className="text-muted-foreground text-[11px]">
                      {t("settings.market_data.custom_provider.default_price_hint")}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`${prefix}.dateTimezone`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("settings.market_data.custom_provider.date_timezone")}</FormLabel>
                    <FormControl>
                      <TimezoneInput
                        value={field.value || ""}
                        onChange={field.onChange}
                        timezones={timezones}
                        placeholder={t("settings.market_data.custom_provider.placeholder_europe_berlin")}
                      />
                    </FormControl>
                    <p className="text-muted-foreground text-[11px]">
                      {t("settings.market_data.custom_provider.date_timezone_hint")}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
