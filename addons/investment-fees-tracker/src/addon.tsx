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
  console.log('💰 Investment Fees Tracker addon is being enabled!');

  // Store references to items for cleanup
  const addedItems: Array<{ remove: () => void }> = [];

  // Add sidebar navigation item
  const sidebarItem = context.sidebar.addItem({
    id: 'investment-fees-tracker',
    label: 'Fee Tracker',
    icon: <Icons.DollarSign className="h-4 w-4" />,
    route: '/addons/investment-fees-tracker',
    order: 200
  });
  addedItems.push(sidebarItem);

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

  // Register cleanup callback
  context.onDisable(() => {
    console.log('🛑 Investment Fees Tracker addon is being disabled');
    
    // Remove all sidebar items
    addedItems.forEach(item => {
      try {
        item.remove();
      } catch (error) {
        console.error('❌ Error removing sidebar item:', error);
      }
    });
    
    console.log('✅ Investment Fees Tracker addon has been cleanly disabled');
  });

  console.log('✨ Investment Fees Tracker addon has been successfully enabled!');
};

// Export the enable function as default
export default enable;