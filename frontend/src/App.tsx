import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import { AppRoutes } from './app-routes';
import { AuthProvider } from './features/auth/auth-context';
import { queryClient } from './lib/query-client';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/* AuthProvider needs the query client, so it sits inside. */}
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
