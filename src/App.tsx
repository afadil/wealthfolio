import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsProvider } from '@/lib/settings-provider';
import { HideInvestmentValuesProvider } from './context/hideInvestmentValuesProvider';
import { AppRoutes } from './routes';
import { useState } from 'react';

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
  return (
    <QueryClientProvider client={queryClient}>
      <HideInvestmentValuesProvider>
        <SettingsProvider>
          <AppRoutes />
        </SettingsProvider>
      </HideInvestmentValuesProvider>
    </QueryClientProvider>
  );
}

export default App;
