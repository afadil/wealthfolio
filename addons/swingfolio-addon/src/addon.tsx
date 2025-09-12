import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { AddonContext, AddonEnableFunction } from '@wealthfolio/addon-sdk';
import DashboardPage from './pages/dashboard-page';
import ActivitySelectorPage from './pages/activity-selector-page';
import SettingsPage from './pages/settings-page';
import { SwingfolioIcon } from './components/swingfolio-icon';

// Main addon component wrapper
function SwingfolioAddon({ ctx }: { ctx: AddonContext }) {
  return (
    <div className="swingfolio-addon">
      <QueryClientProvider client={ctx.api.query.getClient()}>
        <DashboardPage ctx={ctx} />
      </QueryClientProvider>
    </div>
  );
}

// Addon enable function - called when the addon is loaded
const enable: AddonEnableFunction = (context) => {
  context.api.logger.info('📈 Swingfolio addon is being enabled!');

  // Store references to items for cleanup
  const addedItems: Array<{ remove: () => void }> = [];

  try {
    // Add sidebar navigation item
    const sidebarItem = context.sidebar.addItem({
      id: 'swingfolio',
      label: 'Swingfolio',
      icon: <SwingfolioIcon />,
      route: '/addons/swingfolio',
      order: 150,
    });
    addedItems.push(sidebarItem);

    // Create wrapper component with QueryClientProvider using shared client
    const SwingfolioWrapper = () => {
      const sharedQueryClient = context.api.query.getClient();
      return (
        <QueryClientProvider client={sharedQueryClient}>
          <SwingfolioAddon ctx={context} />
        </QueryClientProvider>
      );
    };

    // Register main dashboard route

    // Register route
    context.router.add({
      path: '/addons/swingfolio',
      component: React.lazy(() =>
        Promise.resolve({
          default: SwingfolioWrapper,
        }),
      ),
    });

    // Register activity selector route
    context.router.add({
      path: '/addons/swingfolio/activities',
      component: React.lazy(() =>
        Promise.resolve({
          default: () => {
            const sharedQueryClient = context.api.query.getClient();
            return (
              <QueryClientProvider client={sharedQueryClient}>
                <ActivitySelectorPage ctx={context} />
              </QueryClientProvider>
            );
          },
        }),
      ),
    });

    // Register settings route
    context.router.add({
      path: '/addons/swingfolio/settings',
      component: React.lazy(() =>
        Promise.resolve({
          default: () => {
            const sharedQueryClient = context.api.query.getClient();
            return (
              <QueryClientProvider client={sharedQueryClient}>
                <SettingsPage ctx={context} />
              </QueryClientProvider>
            );
          },
        }),
      ),
    });

    context.api.logger.info('Swingfolio addon enabled successfully');
  } catch (error) {
    context.api.logger.error('Failed to initialize addon: ' + (error as Error).message);
    throw error;
  }

  // Register cleanup callback
  context.onDisable(() => {
    context.api.logger.info('🛑 Swingfolio addon is being disabled');

    // Remove all sidebar items
    addedItems.forEach((item) => {
      try {
        item.remove();
      } catch (error) {
        context.api.logger.error('Error removing sidebar item: ' + (error as Error).message);
      }
    });

    context.api.logger.info('Swingfolio addon disabled successfully');
  });
};

// Export the enable function as default
export default enable;
