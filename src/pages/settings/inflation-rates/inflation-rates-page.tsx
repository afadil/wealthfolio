import { getInflationRates } from "@/commands/inflation-rates";
import { QueryKeys } from "@/lib/query-keys";
import type { InflationRate } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  EmptyPlaceholder,
  Icons,
  Separator,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wealthfolio/ui";
import { useState, useMemo } from "react";
import { SettingsHeader } from "../settings-header";
import { InflationRateEditModal } from "./components/inflation-rate-edit-modal";
import { InflationRateItem } from "./components/inflation-rate-item";
import { useInflationRateMutations } from "./use-inflation-rate-mutations";

const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "CA", name: "Canada" },
  { code: "JP", name: "Japan" },
  { code: "AU", name: "Australia" },
  { code: "CH", name: "Switzerland" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "IE", name: "Ireland" },
  { code: "PT", name: "Portugal" },
  { code: "PL", name: "Poland" },
];

const SettingsInflationRatesPage = () => {
  const [visibleModal, setVisibleModal] = useState(false);
  const [selectedRate, setSelectedRate] = useState<InflationRate | null>(null);
  const [countryCode, setCountryCode] = useState("US");
  const [showPreviousYears, setShowPreviousYears] = useState(false);

  const { data: allRates, isLoading } = useQuery<InflationRate[], Error>({
    queryKey: [QueryKeys.INFLATION_RATES],
    queryFn: getInflationRates,
  });

  const { deleteInflationRateMutation, fetchFromWorldBankMutation } = useInflationRateMutations();

  const rates = useMemo(() => {
    if (!allRates) return [];
    return allRates.filter((r) => r.countryCode.toUpperCase() === countryCode.toUpperCase());
  }, [allRates, countryCode]);

  const handleAddRate = () => {
    setSelectedRate(null);
    setVisibleModal(true);
  };

  const handleEditRate = (rate: InflationRate) => {
    setSelectedRate(rate);
    setVisibleModal(true);
  };

  const handleDeleteRate = (rate: InflationRate) => {
    deleteInflationRateMutation.mutate(rate.id);
  };

  const handleFetchFromWorldBank = () => {
    fetchFromWorldBankMutation.mutate(countryCode);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  const currentYear = new Date().getFullYear();
  const currentYearRates = rates.filter((rate) => rate.year === currentYear);
  const previousYearsRates = rates
    .filter((rate) => rate.year < currentYear)
    .sort((a, b) => b.year - a.year);

  return (
    <>
      <div className="space-y-6">
        <SettingsHeader
          heading="Inflation Rates"
          text="Manage inflation rates for real value calculations."
        >
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleFetchFromWorldBank}
              disabled={fetchFromWorldBankMutation.isPending}
              className="hidden sm:inline-flex"
            >
              {fetchFromWorldBankMutation.isPending ? (
                <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Icons.Download className="mr-2 h-4 w-4" />
              )}
              Fetch from World Bank
            </Button>
            <Button size="icon" className="sm:hidden" onClick={handleAddRate}>
              <Icons.Plus className="h-4 w-4" />
            </Button>
            <Button size="sm" className="hidden sm:inline-flex" onClick={handleAddRate}>
              <Icons.Plus className="mr-2 h-4 w-4" />
              Add Rate
            </Button>
          </div>
        </SettingsHeader>
        <Separator />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Country:</span>
            <Select value={countryCode} onValueChange={setCountryCode}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.name} ({country.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleFetchFromWorldBank}
            disabled={fetchFromWorldBankMutation.isPending}
            className="sm:hidden"
          >
            {fetchFromWorldBankMutation.isPending ? (
              <Icons.Spinner className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Icons.Download className="mr-2 h-4 w-4" />
            )}
            Fetch from World Bank
          </Button>
        </div>

        <div className="w-full pt-4">
          <h2 className="text-md text-muted-foreground mb-3 font-semibold">
            Current Year ({currentYear})
          </h2>
          {currentYearRates.length ? (
            <div className="w-full space-y-2">
              {currentYearRates.map((rate) => (
                <InflationRateItem
                  key={rate.id}
                  rate={rate}
                  onEdit={handleEditRate}
                  onDelete={handleDeleteRate}
                />
              ))}
            </div>
          ) : (
            <EmptyPlaceholder>
              <EmptyPlaceholder.Icon name="TrendingUp" />
              <EmptyPlaceholder.Title>
                No inflation rate for {currentYear} ({countryCode})
              </EmptyPlaceholder.Title>
              <EmptyPlaceholder.Description>
                Add an inflation rate manually or fetch historical data from World Bank.
              </EmptyPlaceholder.Description>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleFetchFromWorldBank}>
                  <Icons.Download className="mr-2 h-4 w-4" />
                  Fetch from World Bank
                </Button>
                <Button onClick={handleAddRate}>
                  <Icons.Plus className="mr-2 h-4 w-4" />
                  Add Rate
                </Button>
              </div>
            </EmptyPlaceholder>
          )}

          {previousYearsRates.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-center">
                <Separator className="w-1/3" />
                <Button
                  variant="outline"
                  className="mx-4 rounded-full"
                  onClick={() => setShowPreviousYears(!showPreviousYears)}
                >
                  {showPreviousYears ? "Hide" : "Show"} Previous Years ({previousYearsRates.length})
                </Button>
                <Separator className="w-1/3" />
              </div>

              {showPreviousYears && (
                <div className="mt-8">
                  <h2 className="text-md text-muted-foreground mb-3">Previous Years</h2>
                  <div className="w-full space-y-2">
                    {previousYearsRates.map((rate) => (
                      <InflationRateItem
                        key={rate.id}
                        rate={rate}
                        onEdit={handleEditRate}
                        onDelete={handleDeleteRate}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <InflationRateEditModal
        rate={selectedRate}
        defaultCountryCode={countryCode}
        open={visibleModal}
        onClose={() => setVisibleModal(false)}
      />
    </>
  );
};

export default SettingsInflationRatesPage;
