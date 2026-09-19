import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { WalletSessionProvider } from '@/lib/wallet';

import Home from '@/pages/home';
import NotFound from '@/pages/not-found';

// The landing page ships in the main bundle. The wallet section and the methodology page load on
// first navigation, so a visitor pays only for the page in front of them.
const WalletSection = lazy(() => import('@/pages/wallet-section'));
const Methodology = lazy(() => import('@/pages/methodology'));

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
      // Moving between wallet pages reuses the ledger fetched moments ago instead of showing
      // skeletons again. Mutations invalidate explicitly through invalidateWalletQueries.
      staleTime: 20_000,
    },
  },
});

/** Shown for the moment a route chunk takes to arrive. The page background is already dark. */
function RouteFallback() {
  return (
    <div className="min-h-screen" aria-busy="true">
      <span className="label fixed bottom-5 left-5 text-foreground/40">Loading</span>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/methodology" component={Methodology} />
        <Route path="/w/:address/*?">{(params) => <WalletSection address={params.address ?? ''} />}</Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
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
