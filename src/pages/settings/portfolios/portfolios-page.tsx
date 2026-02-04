import { usePortfolioMutations, usePortfolios } from '@/hooks/use-portfolios';
import type { Portfolio } from '@/lib/types';
import { Button, EmptyPlaceholder, Icons, Separator, Skeleton } from '@wealthfolio/ui';
import { useState } from 'react';
import { SettingsHeader } from '../settings-header';
import { PortfolioEditModal } from './components/portfolio-edit-modal';
import { PortfolioItem } from './components/portfolio-item';

const SettingsPortfoliosPage = () => {
  const { data: portfolios, isLoading } = usePortfolios();

  const [visibleModal, setVisibleModal] = useState(false);
  const [selectedPortfolio, setSelectedPortfolio] = useState<Portfolio | null>(null);

  const handleAddPortfolio = () => {
    setSelectedPortfolio(null);
    setVisibleModal(true);
  };

  const { deletePortfolioMutation } = usePortfolioMutations({
    onSuccess: () => setVisibleModal(false),
  });

  const handleEditPortfolio = (portfolio: Portfolio) => {
    setSelectedPortfolio(portfolio);
    setVisibleModal(true);
  };

  const handleDeletePortfolio = (portfolio: Portfolio) => {
    deletePortfolioMutation.mutate(portfolio.id);
  };

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <SettingsHeader
          heading="Portfolios"
          text="Group multiple accounts into portfolios with independent allocation strategies."
        >
          {/* Mobile: icon button; Desktop: full button */}
          <>
            <Button
              size="icon"
              className="sm:hidden"
              onClick={() => handleAddPortfolio()}
              aria-label="Add portfolio"
            >
              <Icons.Plus className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => handleAddPortfolio()}
            >
              <Icons.Plus className="mr-2 h-4 w-4" />
              Add portfolio
            </Button>
          </>
        </SettingsHeader>
        <Separator />
        <div className="w-full pt-8">
          {portfolios?.length ? (
            <div className="divide-border divide-y rounded-md border">
              {portfolios.map((portfolio: Portfolio) => (
                <PortfolioItem
                  key={portfolio.id}
                  portfolio={portfolio}
                  onEdit={handleEditPortfolio}
                  onDelete={handleDeletePortfolio}
                />
              ))}
            </div>
          ) : (
            <EmptyPlaceholder>
              <EmptyPlaceholder.Icon name="Group" />
              <EmptyPlaceholder.Title>No portfolios added!</EmptyPlaceholder.Title>
              <EmptyPlaceholder.Description>
                You don&apos;t have any portfolios yet. Start grouping your accounts into
                portfolios.
              </EmptyPlaceholder.Description>
              <Button onClick={() => handleAddPortfolio()}>
                <Icons.Plus className="mr-2 h-4 w-4" />
                Add a portfolio
              </Button>
            </EmptyPlaceholder>
          )}
        </div>
      </div>
      <PortfolioEditModal
        portfolio={selectedPortfolio || undefined}
        open={visibleModal}
        onClose={() => setVisibleModal(false)}
      />
    </>
  );
};

export default SettingsPortfoliosPage;
