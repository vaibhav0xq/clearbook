import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { WalletSessionProvider } from '@/lib/wallet';

import Home from '@/pages/home';
import Portfolio from '@/pages/portfolio';
import Lots from '@/pages/lots';
import Activity from '@/pages/activity';
import Events from '@/pages/events';
import Statements from '@/pages/statements';
import StatementDetail from '@/pages/statement-detail';
import Trade from '@/pages/trade';
import Methodology from '@/pages/methodology';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Client errors are final. Retrying a 400 or 404 only delays the message.
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/methodology" component={Methodology} />
      
      {/* Wallet routes */}
      <Route path="/w/:address/statements/:statementId" component={StatementDetail} />
      <Route path="/w/:address/statements" component={Statements} />
      <Route path="/w/:address/lots" component={Lots} />
      <Route path="/w/:address/activity" component={Activity} />
      <Route path="/w/:address/events" component={Events} />
      <Route path="/w/:address/trade" component={Trade} />
      <Route path="/w/:address" component={Portfolio} />

      <Route component={NotFound} />
    </Switch>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WalletSessionProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <RoutedErrorBoundary>
              <Router />
            </RoutedErrorBoundary>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </WalletSessionProvider>
    </QueryClientProvider>
  );
}

export default App;
