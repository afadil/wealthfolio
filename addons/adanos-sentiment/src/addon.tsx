import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AddonContext, AddonEnableFunction } from "@wealthfolio/addon-sdk";
import React from "react";
import DashboardPage from "./pages/dashboard-page";
import SettingsPage from "./pages/settings-page";
import { AdanosSentimentIcon } from "./components/adanos-sentiment-icon";

function AdanosSentimentDashboard({ ctx }: { ctx: AddonContext }) {
  return <DashboardPage ctx={ctx} />;
}

const enable: AddonEnableFunction = (context: AddonContext) => {
  context.api.logger.info("Adanos Sentiment addon is being enabled");

  const addedItems: Array<{ remove: () => void }> = [];

  const withSharedQueryClient = (render: () => React.ReactElement) => {
    const sharedQueryClient = context.api.query.getClient() as QueryClient;

    return <QueryClientProvider client={sharedQueryClient}>{render()}</QueryClientProvider>;
  };

  try {
    const sidebarItem = context.sidebar.addItem({
      id: "adanos-sentiment",
      label: "Adanos Sentiment",
      icon: <AdanosSentimentIcon />,
      route: "/addons/adanos-sentiment",
      order: 180,
    });
    addedItems.push(sidebarItem);

    context.router.add({
      path: "/addons/adanos-sentiment",
      component: React.lazy(() =>
        Promise.resolve({
          default: () =>
            withSharedQueryClient(() => <AdanosSentimentDashboard ctx={context} />),
        }),
      ),
    });

    context.router.add({
      path: "/addons/adanos-sentiment/settings",
      component: React.lazy(() =>
        Promise.resolve({
          default: () => withSharedQueryClient(() => <SettingsPage ctx={context} />),
        }),
      ),
    });

    context.api.logger.info("Adanos Sentiment addon enabled successfully");
  } catch (error) {
    context.api.logger.error(
      "Failed to initialize Adanos Sentiment addon: " + (error as Error).message,
    );
    throw error;
  }

  context.onDisable(() => {
    context.api.logger.info("Adanos Sentiment addon is being disabled");

    for (const item of addedItems) {
      try {
        item.remove();
      } catch (error) {
        context.api.logger.error(
          "Failed to remove Adanos sidebar item: " + (error as Error).message,
        );
      }
    }
  });
};

export default enable;
