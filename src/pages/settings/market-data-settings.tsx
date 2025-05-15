import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SettingsHeader } from './header';
import { useRecalculatePortfolioMutation } from '@/hooks/use-calculate-portfolio';
import { Icons } from '@/components/icons';
import React from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, formatDistanceToNow } from 'date-fns';
import { useMarketDataProviders } from '@/hooks/use-market-data-providers';

export default function MarketDataSettingsPage() {
  const recalculatePortfolioMutation = useRecalculatePortfolioMutation();
  const [actingProviderId, setActingProviderId] = React.useState<string | null>(null);

  const {
    data: marketDataProviders = [],
    isLoading: isLoadingProviders,
    isError: isErrorProviders,
    error: errorProviders,
  } = useMarketDataProviders();

  const handleProviderUpdateData = (providerId: string) => {
    setActingProviderId(providerId);
    recalculatePortfolioMutation.mutate(undefined, {
      onSettled: () => setActingProviderId(null),
    });
  };

  const handleProviderRefetchAll = (providerId: string) => {
    setActingProviderId(providerId);
    recalculatePortfolioMutation.mutate(undefined, { 
      onSettled: () => setActingProviderId(null),
    });
  };

  return (
    <div className="space-y-6 text-foreground">
      <SettingsHeader
        heading="Market Data"
        text="Manage market data providers and trigger updates."
      />
      <Separator />
      <TooltipProvider>
        <div>
          <div className="mt-4 space-y-4">
            {isLoadingProviders && <p>Loading providers...</p>}
            {isErrorProviders && (
              <p className="text-destructive">
                Failed to load provider information: {errorProviders?.message || 'Unknown error'}
              </p>
            )}
            {!isLoadingProviders &&
              !isErrorProviders &&
              marketDataProviders.map((provider) => (
                <Card key={provider.id}>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <img
                        src={`/market-data/${provider.logoFilename}`}
                        alt={`${provider.name} logo`}
                        className="h-10 w-10 rounded-md"
                      />
                      <div>
                        <CardTitle className="text-base">{provider.name}</CardTitle>
                        <div className="mt-1 flex items-center">
                          {provider.lastSyncedDate ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="cursor-help text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(provider.lastSyncedDate), {
                                    addSuffix: true,
                                  })}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{format(new Date(provider.lastSyncedDate), 'PPpp')}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <p className="text-xs text-muted-foreground">Never synced</p>
                          )}
                          <span
                            className={`h-2 w-2 ${provider.lastSyncedDate ? 'bg-success' : 'bg-muted'} ml-2 rounded-full`}
                          ></span>
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        onClick={() => handleProviderUpdateData(provider.id)}
                        variant="outline"
                        size="sm"
                        className="border-border bg-secondary text-xs hover:bg-ring"
                        disabled={
                          recalculatePortfolioMutation.isPending && actingProviderId === provider.id
                        }
                      >
                        {recalculatePortfolioMutation.isPending &&
                        actingProviderId === provider.id ? (
                          <Icons.Spinner className="mr-2 h-3 w-3 animate-spin" />
                        ) : (
                          <Icons.Refresh className="mr-2 h-3 w-3" />
                        )}
                        Update Data
                      </Button>
                      <Button
                        onClick={() => handleProviderRefetchAll(provider.id)}
                        variant="outline"
                        size="sm"
                        className="border-border bg-secondary text-xs hover:bg-ring"
                        disabled={
                          recalculatePortfolioMutation.isPending && actingProviderId === provider.id
                        }
                      >
                        {recalculatePortfolioMutation.isPending &&
                        actingProviderId === provider.id ? (
                          <Icons.Spinner className="mr-2 h-3 w-3 animate-spin" />
                        ) : (
                          <Icons.Download className="mr-2 h-3 w-3" />
                        )}
                        Refetch All
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              ))}
          </div>
        </div>
      </TooltipProvider>
    </div>
  );
} 