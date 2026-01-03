import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/hooks/use-settings";
import { useValuationHistory } from "@/hooks/use-valuation-history";
import {
  useInflationAdjustedPortfolio,
  useInflationRatesByCountry,
} from "@/pages/settings/inflation-rates/use-inflation-rate-mutations";
import { EmptyPlaceholder, Skeleton } from "@wealthfolio/ui";
import { parseISO } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { InflationChart } from "./components/inflation-chart";

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const getDaysInMonth = (month: number): number[] => {
  const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return Array.from({ length: days[month - 1] }, (_, i) => i + 1);
};

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  USD: "US",
  EUR: "FR",
  GBP: "GB",
  CAD: "CA",
  AUD: "AU",
  JPY: "JP",
  CHF: "CH",
  CNY: "CN",
  INR: "IN",
  BRL: "BR",
  MXN: "MX",
  SEK: "SE",
  NOK: "NO",
  DKK: "DK",
  PLN: "PL",
  CZK: "CZ",
  HUF: "HU",
  NZD: "NZ",
  SGD: "SG",
  HKD: "HK",
};

const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "CA", name: "Canada" },
  { code: "JP", name: "Japan" },
  { code: "AU", name: "Australia" },
  { code: "CH", name: "Switzerland" },
];

export default function InflationPage() {
  const currentYear = new Date().getFullYear();
  const { data: settings, isLoading: isSettingsLoading } = useSettings();

  // Auto-detect country from base currency
  const defaultCountry = settings?.baseCurrency
    ? CURRENCY_TO_COUNTRY[settings.baseCurrency] || "US"
    : "US";

  const [baseYear, setBaseYear] = useState<number | null>(null);
  const [countryCode, setCountryCode] = useState<string | undefined>(undefined);
  const [referenceMonth, setReferenceMonth] = useState(12); // December
  const [referenceDay, setReferenceDay] = useState(31);

  // Use detected country if not manually set
  const effectiveCountryCode = countryCode || defaultCountry;

  // Fetch all valuation history
  const { valuationHistory, isLoading: isValuationLoading } = useValuationHistory(undefined);

  // Fetch inflation rates
  const { data: inflationRates, isLoading: isRatesLoading } =
    useInflationRatesByCountry(effectiveCountryCode);

  // Extract year-end values from valuation history
  // For each year, find the valuation closest to (but not after) December 31st
  const yearEndValues = useMemo(() => {
    if (!valuationHistory || valuationHistory.length === 0) return [];

    const yearValues = new Map<number, { value: number; date: string }>();

    valuationHistory.forEach((v) => {
      const date = parseISO(v.valuationDate);
      const year = date.getFullYear();

      const referenceDate = `${year}-${String(referenceMonth).padStart(2, "0")}-${String(referenceDay).padStart(2, "0")}`;

      // Only consider dates on or before the reference date (Dec 31)
      if (v.valuationDate <= referenceDate) {
        const existing = yearValues.get(year);
        // Keep the latest date (closest to Dec 31)
        if (!existing || v.valuationDate > existing.date) {
          yearValues.set(year, { value: v.totalValue, date: v.valuationDate });
        }
      }
    });

    return Array.from(yearValues.entries())
      .map(([year, { value, date }]) => [year, value, date] as [number, number, string])
      .sort((a, b) => a[0] - b[0]);
  }, [valuationHistory, referenceMonth, referenceDay]);

  // Get available years from inflation rates (CPI data)
  const cpiYearOptions = useMemo(() => {
    if (!inflationRates || inflationRates.length === 0) return [];
    const years = [...new Set(inflationRates.map((r) => r.year))].sort((a, b) => b - a);
    return years;
  }, [inflationRates]);

  // Set default base year to latest CPI year (only once when data loads)
  useEffect(() => {
    if (baseYear === null && cpiYearOptions.length > 0) {
      setBaseYear(cpiYearOptions[0]); // Latest year with CPI data
    }
  }, [cpiYearOptions, baseYear]);

  // Effective base year (fallback to current year if not set)
  const effectiveBaseYear = baseYear ?? currentYear;

  // Calculate inflation-adjusted values
  const { data: adjustedValues, isLoading: isAdjustedLoading } = useInflationAdjustedPortfolio(
    yearEndValues,
    effectiveCountryCode,
    effectiveBaseYear,
  );

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!adjustedValues) return [];

    return adjustedValues.map((v) => ({
      year: v.year.toString(),
      nominal: v.nominalValue,
      real: v.realValue,
      inflationRate: v.inflationRate,
      cumulativeInflation: v.cumulativeInflation,
    }));
  }, [adjustedValues]);


  const isLoading = isValuationLoading || isRatesLoading || isAdjustedLoading || isSettingsLoading;
  const hasNoInflationData = !inflationRates || inflationRates.length === 0;
  const hasNoPortfolioData = !valuationHistory || valuationHistory.length === 0;

  if (isSettingsLoading) {
    return (
      <div className="space-y-6 p-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>Inflation Settings</CardTitle>
          <CardDescription>Configure how inflation adjustments are calculated</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Country</label>
            <Select value={effectiveCountryCode} onValueChange={setCountryCode}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Base Year</label>
            <Select
              value={effectiveBaseYear.toString()}
              onValueChange={(v) => setBaseYear(parseInt(v))}
              disabled={cpiYearOptions.length === 0}
            >
              <SelectTrigger className="w-28">
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {cpiYearOptions.length > 0 ? (
                  cpiYearOptions.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value={currentYear.toString()}>{currentYear}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Reference Date</label>
            <div className="flex gap-2">
              <Select
                value={referenceMonth.toString()}
                onValueChange={(v) => {
                  const newMonth = parseInt(v);
                  setReferenceMonth(newMonth);
                  // Adjust day if it exceeds days in new month
                  const maxDays = getDaysInMonth(newMonth).length;
                  if (referenceDay > maxDays) {
                    setReferenceDay(maxDays);
                  }
                }}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month) => (
                    <SelectItem key={month.value} value={month.value.toString()}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={referenceDay.toString()}
                onValueChange={(v) => setReferenceDay(parseInt(v))}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getDaysInMonth(referenceMonth).map((day) => (
                    <SelectItem key={day} value={day.toString()}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart Card */}
      <Card>
        <CardHeader>
          <CardTitle>Nominal vs Real</CardTitle>
          <CardDescription>
            Comparing nominal portfolio value with inflation-adjusted value (base year: {effectiveBaseYear})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasNoPortfolioData ? (
            <EmptyPlaceholder>
              <EmptyPlaceholder.Icon name="BarChart" />
              <EmptyPlaceholder.Title>No Portfolio Data</EmptyPlaceholder.Title>
              <EmptyPlaceholder.Description>
                Start tracking your portfolio to see inflation-adjusted values.
              </EmptyPlaceholder.Description>
            </EmptyPlaceholder>
          ) : hasNoInflationData ? (
            <EmptyPlaceholder>
              <EmptyPlaceholder.Icon name="TrendingUp" />
              <EmptyPlaceholder.Title>No Inflation Data</EmptyPlaceholder.Title>
              <EmptyPlaceholder.Description>
                Add inflation rates for {effectiveCountryCode} in{" "}
                <Link
                  to="/settings/inflation-rates"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Settings
                </Link>{" "}
                to see real values.
              </EmptyPlaceholder.Description>
            </EmptyPlaceholder>
          ) : (
            <InflationChart
              data={chartData}
              isLoading={isLoading}
              baseYear={effectiveBaseYear}
              currency={settings?.baseCurrency || "USD"}
            />
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      {!hasNoInflationData && !hasNoPortfolioData && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-muted-foreground text-sm">
              <p>
                <strong>How it works:</strong> The real value shows what your portfolio would be
                worth in {effectiveBaseYear} purchasing power, adjusted for cumulative inflation.
              </p>
              <p className="mt-2">
                Using {inflationRates?.length || 0} inflation rate records for{" "}
                {effectiveCountryCode}.{" "}
                <Link
                  to="/settings/inflation-rates"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Manage rates
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
