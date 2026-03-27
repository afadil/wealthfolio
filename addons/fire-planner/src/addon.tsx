import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AddonEnableFunction, UnlistenFn } from "@wealthfolio/addon-sdk";
import { Icons } from "@wealthfolio/ui";
import React from "react";
import FirePlannerApp from "./FirePlannerApp";

const enable: AddonEnableFunction = (context) => {
  context.api.logger.info("FIRE Planner addon enabled");

  const sidebarItem = context.sidebar.addItem({
    id: "fire-planner",
    label: "FIRE Planner",
    icon: <Icons.Target className="h-5 w-5" />,
    route: "/addons/fire-planner",
    order: 150,
  });

  context.router.add({
    path: "/addons/fire-planner",
    component: React.lazy(() =>
      Promise.resolve({
        default: () => {
          const queryClient = context.api.query.getClient() as QueryClient;
          return (
            <QueryClientProvider client={queryClient}>
              <FirePlannerApp ctx={context} />
            </QueryClientProvider>
          );
        },
      }),
    ),
  });

  // Invalidate holdings cache when portfolio updates
  let cleanupEvent: UnlistenFn | undefined;
  context.api.events.portfolio
    .onUpdateComplete(() => {
      const queryClient = context.api.query.getClient() as QueryClient;
      queryClient.invalidateQueries({ queryKey: ["fire-planner-holdings"] });
    })
    .then((unlisten) => {
      cleanupEvent = unlisten;
    })
    .catch(() => {
      // Event listener not available in this environment
    });

  context.onDisable(() => {
    context.api.logger.info("FIRE Planner addon disabled");
    sidebarItem.remove();
    cleanupEvent?.();
  });
};

export default enable;
