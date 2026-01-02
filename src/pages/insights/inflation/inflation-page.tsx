import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useValuationHistory } from "@/hooks/use-valuation-history";
import { useSettings } from "@/hooks/use-settings";
import {
  useInflationRatesByCountry,
  useInflationAdjustedPortfolio,
} from "@/pages/settings/inflation-rates/use-inflation-rate-mutations";
import { useEffect, useMemo, useState } from "react";
import { InflationChart } from "./components/inflation-chart";
import { parseISO } from "date-fns";
import { Button, EmptyPlaceholder, Icons, Skeleton } from "@wealthfolio/ui";
import { Link } from "react-router-dom";

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
  const [referenceMonth] = useState(12); // December
  const [referenceDay] = useState(31);

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

    const yearValues: Map<number, { value: number; date: string }> = new Map();

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

  // Set default base year to first year of portfolio data (only once when data loads)
  useEffect(() => {
    if (baseYear === null && yearEndValues.length > 0) {
      setBaseYear(yearEndValues[0][0]); // First year of portfolio data
    }
  }, [yearEndValues, baseYear]);

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

  // Generate year options from available data
  const yearOptions = useMemo(() => {
    const years = yearEndValues.map(([year]) => year);
    return years.length > 0 ? years : [currentYear];
  }, [yearEndValues, currentYear]);

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
            <Select value={effectiveBaseYear.toString()} onValueChange={(v) => setBaseYear(parseInt(v))}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Reference Date</label>
            <div className="text-muted-foreground flex h-10 items-center text-sm">
              December 31st
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chart Card */}
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Value: Nominal vs Real</CardTitle>
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
                Add inflation rates for {effectiveCountryCode} to see real values.
              </EmptyPlaceholder.Description>
              <Link to="/settings/inflation-rates">
                <Button>
                  <Icons.Settings className="mr-2 h-4 w-4" />
                  Configure Inflation Rates
                </Button>
              </Link>
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
