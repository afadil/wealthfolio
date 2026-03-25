import { AuthProvider } from "@/context/auth-context";
import { SettingsProvider } from "@/lib/settings-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@wealthvn/ui";
import { useState } from "react";
import { PrivacyProvider } from "./context/privacy-context";
import { AppRoutes } from "./routes";
// Import i18n to ensure it's initialized
import "@/locales";

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
  window.__wealthvn_query_client__ = queryClient;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PrivacyProvider>
          <SettingsProvider>
            <TooltipProvider>
              <AppRoutes />
            </TooltipProvider>
          </SettingsProvider>
        </PrivacyProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
