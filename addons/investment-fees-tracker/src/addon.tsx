import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AddonContext, AddonEnableFunction } from '@wealthfolio/addon-sdk';
import { Icons } from '@wealthfolio/ui';
import FeesPage from './pages/fees-page';

// Create a query client for this addon
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error && typeof error === 'object' && 'status' in error) {
          const status = (error as any).status;
          if (status >= 400 && status < 500) {
            return false;
          }
        }
        return failureCount < 3;
      },
    },
  },
});

// Main addon component
function InvestmentFeesTrackerAddon({ ctx }: { ctx: AddonContext }) {
  return (
    <div className="investment-fees-tracker-addon">
      <FeesPage ctx={ctx} />
    </div>
  );
}

// Addon enable function - called when the addon is loaded
const enable: AddonEnableFunction = (context) => {
  context.api.logger.info('💰 Investment Fees Tracker addon is being enabled!');

  // Store references to items for cleanup
  const addedItems: Array<{ remove: () => void }> = [];

  try {
    // Add sidebar navigation item
    const sidebarItem = context.sidebar.addItem({
      id: 'investment-fees-tracker',
      label: 'Fee Tracker',
      icon: <Icons.DollarSign className="h-4 w-4" />,
      route: '/addons/investment-fees-tracker',
      order: 200
    });
    addedItems.push(sidebarItem);
    
    context.api.logger.debug('Sidebar navigation item added successfully');

    // Create wrapper component with QueryClientProvider
    const InvestmentFeesTrackerWrapper = () => (
      <QueryClientProvider client={queryClient}>
        <InvestmentFeesTrackerAddon ctx={context} />
      </QueryClientProvider>
    );

    // Register route
    context.router.add({
      path: '/addons/investment-fees-tracker',
      component: React.lazy(() => Promise.resolve({ 
        default: InvestmentFeesTrackerWrapper 
      }))
    });
    
    context.api.logger.debug('Route registered successfully');
    context.api.logger.info('Investment Fees Tracker addon enabled successfully');

  } catch (error) {
    context.api.logger.error('Failed to initialize addon: ' + (error as Error).message);
    // Re-throw the error so the addon system can handle it
    throw error;
  }

  // Register cleanup callback
  context.onDisable(() => {
    context.api.logger.info('🛑 Investment Fees Tracker addon is being disabled');
    
    // Remove all sidebar items
    addedItems.forEach(item => {
      try {
        item.remove();
      } catch (error) {
        context.api.logger.error('Error removing sidebar item: ' + (error as Error).message);
      }
    });
    
    context.api.logger.info('Investment Fees Tracker addon disabled successfully');
  });
};

// Export the enable function as default
export default enable;