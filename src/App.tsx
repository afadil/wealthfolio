import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsProvider } from '@/lib/settings-provider';
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
            retry: 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <AppRoutes />
      </SettingsProvider>
    </QueryClientProvider>
  );
}

export default App;
