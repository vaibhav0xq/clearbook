import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { WalletSessionProvider } from '@/lib/wallet';
import { WalletPicker } from '@/components/wallet-picker';
import { ScrollReset } from '@/components/layout/scroll-reset';
import { installViewerHeader } from '@/lib/viewer';

import Home from '@/pages/home';
import NotFound from '@/pages/not-found';

// The landing page ships in the main bundle. The wallet section and the methodology page load on
// first navigation, so a visitor pays only for the page in front of them.
const WalletSection = lazy(() => import('@/pages/wallet-section'));
const Methodology = lazy(() => import('@/pages/methodology'));

installViewerHeader();

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

function RouteMetadata() {
  const [location] = useLocation();

  useEffect(() => {
    const path = location.split('?')[0];
    const walletRoute = path.match(/^\/w\/[^/]+(?:\/([^/]+))?(?:\/[^/]+)?$/);
    const section = walletRoute?.[1];
    const page =
      path === '/'
        ? null
        : path === '/methodology'
          ? 'Methodology'
          : walletRoute
            ? section === 'lots'
              ? 'Tax lots'
              : section === 'trade'
                ? 'Trade'
                : section === 'statements'
                  ? path.split('/').length > 4
                    ? 'Statement'
                    : 'Statements'
                  : section === 'activity'
                    ? 'Activity'
                    : section === 'events'
                      ? 'Corporate actions'
                      : 'Portfolio'
            : 'Page not found';
    const title = page ? `${page} | Clearbook` : 'Clearbook | Brokerage statements for tokenized stocks';
    const description =
      page === 'Methodology'
        ? 'How Clearbook reconstructs brokerage statements, tax lots, marks and income from public Solana history.'
        : 'Brokerage statements, tax lots and post trade accounting for tokenized stocks on Solana.';
    const canonical = new URL(path, 'https://clearbook.bond').href;

    document.title = title;
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.setAttribute('content', description);
    document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.setAttribute('content', canonical);
    document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.setAttribute('content', title);
    document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]')?.setAttribute('content', description);
    document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.setAttribute('content', page === 'Page not found' ? 'noindex, follow' : 'index, follow');
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute('href', canonical);
  }, [location]);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WalletSessionProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <RouteMetadata />
          <ScrollReset />
          <RoutedErrorBoundary>
            <Router />
          </RoutedErrorBoundary>
          <WalletPicker />
        </WouterRouter>
      </WalletSessionProvider>
    </QueryClientProvider>
  );
}

export default App;
