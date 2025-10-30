import { SettingsProvider } from "@/lib/settings-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@wealthfolio/ui";
import { useState } from "react";
import { PrivacyProvider } from "./context/privacy-context";
import { AppRoutes } from "./routes";

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
  window.__wealthfolio_query_client__ = queryClient;

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
