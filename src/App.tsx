import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsProvider } from "@/lib/settings-provider";
import { PrivacyProvider } from "./context/privacy-context";
import { AppRoutes } from "./routes";
import { useState } from "react";
import { TooltipProvider } from "@wealthfolio/ui";

function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 5 * 60 * 1000,
            retry: false,
          },
        },
      }),
  );

  // Make QueryClient available globally for addons
  (window as any).__wealthfolio_query_client__ = queryClient;

  return (
    <QueryClientProvider client={queryClient}>
      <PrivacyProvider>
        <SettingsProvider>
          <TooltipProvider>
            <AppRoutes />
          </TooltipProvider>
        </SettingsProvider>
      </PrivacyProvider>
    </QueryClientProvider>
  );
}

export default App;
