import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  getInflationRates,
  getInflationRatesByCountry,
  createInflationRate,
  updateInflationRate,
  deleteInflationRate,
  fetchInflationRatesFromWorldBank,
  calculateInflationAdjustedPortfolio,
} from "@/commands/inflation-rates";
import { QueryKeys } from "@/lib/query-keys";
import { toast } from "@/components/ui/use-toast";
import { InflationRate, NewInflationRate, InflationAdjustedValue } from "@/lib/types";
import { logger } from "@/adapters";

export const useInflationRates = () => {
  return useQuery<InflationRate[]>({
    queryKey: [QueryKeys.INFLATION_RATES],
    queryFn: getInflationRates,
  });
};

export const useInflationRatesByCountry = (countryCode: string) => {
  return useQuery<InflationRate[]>({
    queryKey: [QueryKeys.INFLATION_RATES_BY_COUNTRY, countryCode],
    queryFn: () => getInflationRatesByCountry(countryCode),
    enabled: !!countryCode,
  });
};

export const useInflationRateMutations = () => {
  const queryClient = useQueryClient();

  const handleSuccess = (message: string) => {
    queryClient.invalidateQueries({ queryKey: [QueryKeys.INFLATION_RATES] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.INFLATION_RATES_BY_COUNTRY] });
    queryClient.invalidateQueries({ queryKey: [QueryKeys.INFLATION_ADJUSTED_PORTFOLIO] });
    toast({
      description: message,
      variant: "success",
    });
  };

  const handleError = (action: string) => {
    toast({
      title: "Uh oh! Something went wrong.",
      description: `There was a problem ${action}.`,
      variant: "destructive",
    });
  };

  const addInflationRateMutation = useMutation({
    mutationFn: createInflationRate,
    onSuccess: () => handleSuccess("Inflation rate added successfully."),
    onError: (e) => {
      logger.error(`Error adding inflation rate: ${String(e)}`);
      handleError("adding this inflation rate");
    },
  });

  const updateInflationRateMutation = useMutation({
    mutationFn: (params: { id: string; updatedRate: NewInflationRate }) =>
      updateInflationRate(params.id, params.updatedRate),
    onSuccess: () => handleSuccess("Inflation rate updated successfully."),
    onError: (e) => {
      logger.error(`Error updating inflation rate: ${String(e)}`);
      handleError("updating this inflation rate");
    },
  });

  const deleteInflationRateMutation = useMutation({
    mutationFn: deleteInflationRate,
    onSuccess: () => handleSuccess("Inflation rate deleted successfully."),
    onError: (e) => {
      logger.error(`Error deleting inflation rate: ${String(e)}`);
      handleError("deleting this inflation rate");
    },
  });

  const fetchFromWorldBankMutation = useMutation({
    mutationFn: fetchInflationRatesFromWorldBank,
    onSuccess: (rates) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.INFLATION_RATES] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.INFLATION_RATES_BY_COUNTRY] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.INFLATION_ADJUSTED_PORTFOLIO] });
      toast({
        description: `Fetched ${rates.length} inflation rates from World Bank.`,
        variant: "success",
      });
    },
    onError: (e) => {
      logger.error(`Error fetching from World Bank: ${String(e)}`);
      handleError("fetching data from World Bank");
    },
  });

  return {
    addInflationRateMutation,
    updateInflationRateMutation,
    deleteInflationRateMutation,
    fetchFromWorldBankMutation,
  };
};

export const useInflationAdjustedPortfolio = (
  nominalValues: [number, number, string][],
  countryCode: string,
  baseYear: number,
) => {
  return useQuery<InflationAdjustedValue[]>({
    queryKey: [
      QueryKeys.INFLATION_ADJUSTED_PORTFOLIO,
      countryCode,
      baseYear,
      JSON.stringify(nominalValues),
    ],
    queryFn: () => calculateInflationAdjustedPortfolio(nominalValues, countryCode, baseYear),
    enabled: nominalValues.length > 0 && !!countryCode,
  });
};
