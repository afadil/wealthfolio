import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AddonContext, AddonEnableFunction } from "@wealthfolio/addon-sdk";
import React from "react";
import DashboardPage from "./pages/dashboard-page";
import SettingsPage from "./pages/settings-page";
import { AdanosPulseIcon } from "./components/adanos-pulse-icon";

function AdanosPulseDashboard({ ctx }: { ctx: AddonContext }) {
  return <DashboardPage ctx={ctx} />;
}

const enable: AddonEnableFunction = (context: AddonContext) => {
  context.api.logger.info("Adanos Pulse addon is being enabled");

  const addedItems: Array<{ remove: () => void }> = [];

  const withSharedQueryClient = (render: () => React.ReactElement) => {
    const sharedQueryClient = context.api.query.getClient() as QueryClient;

    return <QueryClientProvider client={sharedQueryClient}>{render()}</QueryClientProvider>;
  };

  try {
    const sidebarItem = context.sidebar.addItem({
      id: "adanos-pulse",
      label: "Adanos Pulse",
      icon: <AdanosPulseIcon />,
      route: "/addons/adanos-pulse",
      order: 180,
    });
    addedItems.push(sidebarItem);

    context.router.add({
      path: "/addons/adanos-pulse",
      component: React.lazy(() =>
        Promise.resolve({
          default: () => withSharedQueryClient(() => <AdanosPulseDashboard ctx={context} />),
        }),
      ),
    });

    context.router.add({
      path: "/addons/adanos-pulse/settings",
      component: React.lazy(() =>
        Promise.resolve({
          default: () => withSharedQueryClient(() => <SettingsPage ctx={context} />),
        }),
      ),
    });

    context.api.logger.info("Adanos Pulse addon enabled successfully");
  } catch (error) {
    context.api.logger.error(
      "Failed to initialize Adanos Pulse addon: " + (error as Error).message,
    );
    throw error;
  }

  context.onDisable(() => {
    context.api.logger.info("Adanos Pulse addon is being disabled");

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
