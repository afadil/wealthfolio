import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AddonEnableFunction } from "@wealthfolio/addon-sdk";
import { Icons } from "@wealthfolio/ui";
import React from "react";
import DividendPage from "./pages/dividend-page";

const enable: AddonEnableFunction = (context) => {
  context.api.logger.info("Dividend Tracker addon is being enabled!");

  const addedItems: { remove: () => void }[] = [];

  try {
    const sidebarItem = context.sidebar.addItem({
      id: "dividend-tracker",
      label: "Dividends",
      icon: <Icons.BadgeDollarSign className="h-4 w-4" />,
      route: "/addons/dividend-tracker",
      order: 160,
    });
    addedItems.push(sidebarItem);

    context.router.add({
      path: "/addons/dividend-tracker",
      component: React.lazy(() =>
        Promise.resolve({
          default: () => {
            const queryClient = context.api.query.getClient() as QueryClient;
            return (
              <QueryClientProvider client={queryClient}>
                <DividendPage ctx={context} />
              </QueryClientProvider>
            );
          },
        }),
      ),
    });

    context.api.logger.info("Dividend Tracker addon enabled successfully");
  } catch (error) {
    context.api.logger.error("Failed to initialize addon: " + (error as Error).message);
    throw error;
  }

  context.onDisable(() => {
    context.api.logger.info("Dividend Tracker addon is being disabled");
    addedItems.forEach((item) => {
      try {
        item.remove();
      } catch (error) {
        context.api.logger.error("Error removing sidebar item: " + (error as Error).message);
      }
    });
  });
};

export default enable;
