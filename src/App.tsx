import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsProvider } from '@/lib/settings-provider';
import { PrivacyProvider } from './context/privacy-context';
import { AppRoutes } from './routes';
import { useState } from 'react';
import { useAddonStartup } from '@/hooks/use-addon-startup';

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

  // Load enabled addons on app startup
  useAddonStartup();

  return (
    <QueryClientProvider client={queryClient}>
      <PrivacyProvider>
        <SettingsProvider>
          <AppRoutes />
        </SettingsProvider>
      </PrivacyProvider>
    </QueryClientProvider>
  );
}

export default App;
