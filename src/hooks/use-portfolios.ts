import { logger } from '@/adapters';
import {
    createPortfolio,
    deletePortfolio,
    getPortfolioById,
    getPortfoliosContainingAccount,
    listPortfolios,
    updatePortfolioManagement,
} from '@/commands/portfolio';
import { toast } from '@/components/ui/use-toast';
import { QueryKeys } from '@/lib/query-keys';
import type { NewPortfolio, Portfolio, UpdatePortfolio } from '@/lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Hook to fetch all portfolios
 */
export function usePortfolios() {
  return useQuery<Portfolio[], Error>({
    queryKey: [QueryKeys.PORTFOLIOS],
    queryFn: listPortfolios,
  });
}

/**
 * Hook to fetch a specific portfolio by ID
 */
export function usePortfolio(portfolioId: string) {
  return useQuery<Portfolio, Error>({
    queryKey: [QueryKeys.PORTFOLIO, portfolioId],
    queryFn: () => getPortfolioById(portfolioId),
    enabled: !!portfolioId,
  });
}

/**
 * Hook to fetch portfolios containing a specific account
 */
export function usePortfoliosContainingAccount(accountId: string) {
  return useQuery<Portfolio[], Error>({
    queryKey: [QueryKeys.PORTFOLIOS, 'by-account', accountId],
    queryFn: () => getPortfoliosContainingAccount(accountId),
    enabled: !!accountId,
  });
}

interface UsePortfolioMutationsProps {
  onSuccess?: () => void;
}

/**
 * Hook providing mutations for portfolio CRUD operations
 */
export function usePortfolioMutations({
  onSuccess = () => undefined,
}: UsePortfolioMutationsProps = {}) {
  const queryClient = useQueryClient();

  const handleSuccess = (message?: string) => {
    onSuccess();
    if (message) {
      toast({ title: message, variant: 'success' });
    }
  };

  const handleError = (action: string) => {
    toast({
      title: `Uh oh! Something went wrong ${action} this portfolio.`,
      description: 'Please try again or report an issue if the problem persists.',
      variant: 'destructive',
    });
  };

  const createPortfolioMutation = useMutation({
    mutationFn: (newPortfolio: NewPortfolio) => createPortfolio(newPortfolio),
    onSuccess: () => {
      handleSuccess('Portfolio created successfully.');
      queryClient.invalidateQueries({ queryKey: [QueryKeys.PORTFOLIOS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
    },
    onError: (e) => {
      logger.error(`Error creating portfolio: ${e}`);
      handleError('creating');
    },
  });

  const updatePortfolioMutation = useMutation({
    mutationFn: (updatePortfolio: UpdatePortfolio) => updatePortfolioManagement(updatePortfolio),
    onSuccess: (_, variables) => {
      handleSuccess('Portfolio updated successfully.');
      queryClient.invalidateQueries({ queryKey: [QueryKeys.PORTFOLIOS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.PORTFOLIO, variables.id] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
    },
    onError: (e) => {
      logger.error(`Error updating portfolio: ${e}`);
      handleError('updating');
    },
  });

  const deletePortfolioMutation = useMutation({
    mutationFn: (portfolioId: string) => deletePortfolio(portfolioId),
    onSuccess: () => {
      handleSuccess('Portfolio deleted successfully.');
      queryClient.invalidateQueries({ queryKey: [QueryKeys.PORTFOLIOS] });
      queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });
    },
    onError: (e) => {
      logger.error(`Error deleting portfolio: ${e}`);
      handleError('deleting');
    },
  });

  return {
    createPortfolioMutation,
    updatePortfolioMutation,
    deletePortfolioMutation,
  };
}
