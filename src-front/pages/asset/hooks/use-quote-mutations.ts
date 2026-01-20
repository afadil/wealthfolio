import { logger, deleteQuote, updateQuote } from "@/adapters";
import { toast } from "@wealthfolio/ui/components/ui/use-toast";
import { QueryKeys } from "@/lib/query-keys";
import { Quote } from "@/lib/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export const useQuoteMutations = (symbol: string) => {
  const queryClient = useQueryClient();

  const handleSuccess = (message: string) => {
    queryClient.invalidateQueries({ queryKey: [QueryKeys.ASSET_DATA, symbol] });
    toast({
      title: message,
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

  const saveQuoteMutation = useMutation({
    mutationFn: async (quote: Quote) => {
      await updateQuote(symbol, {
        ...quote,
        dataSource: "MANUAL",
        assetId: symbol,
        createdAt: quote.createdAt || new Date().toISOString(),
      });
    },
    // onSuccess: (_, quote) => {
    //   handleSuccess(quote.id ? "Quote updated successfully." : "Quote added successfully.");
    // },
    onError: (error) => {
      logger.error(`Error saving quote: ${error}`);
      handleError("saving the quote");
    },
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: deleteQuote,
    onSuccess: () => {
      handleSuccess("Quote deleted successfully.");
    },
    onError: (error) => {
      logger.error(`Error deleting quote: ${error}`);
      handleError("deleting the quote");
    },
  });

  return {
    saveQuoteMutation,
    deleteQuoteMutation,
  };
};
