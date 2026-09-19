import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateWalletQueries } from "@/lib/wallet-queries";
import { CheckCircle2, AlertTriangle, ShieldAlert, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { useGetWalletStatus, useIndexWallet, getGetWalletStatusQueryKey } from "@workspace/api-client-react";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { useCostMethod } from "@/hooks/use-cost-method";
import { CostMethod } from "@workspace/api-client-react";
import { truncateAddress } from "@/lib/format";

interface ShellProps {
  address: string;
  children: ReactNode;
}

export function Shell({ address, children }: ShellProps) {
  const [location] = useLocation();
  const { method, setMethod } = useCostMethod();
  const queryClient = useQueryClient();
  
  const { data: status, error: statusError, refetch } = useGetWalletStatus(address, {
    query: {
      queryKey: getGetWalletStatusQueryKey(address),
      refetchInterval: (query) => {
        const state = query.state.data?.state;
        return state === "indexing" ? 2000 : false;
      }
    }
  });
  
  const indexWallet = useIndexWallet();

  const handleRefresh = async () => {
    await indexWallet.mutateAsync({ address });
    await invalidateWalletQueries(queryClient, address);
    refetch();
  };

  const navItems = [
    { label: "Portfolio", path: `/w/${address}` },
    { label: "Tax lots", path: `/w/${address}/lots` },
    { label: "Activity", path: `/w/${address}/activity` },
    { label: "Events", path: `/w/${address}/events` },
    { label: "Statements", path: `/w/${address}/statements` },
    { label: "Trade", path: `/w/${address}/trade` },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-sans">
      <header className="bg-card">
        <div className="flex h-14 items-center px-6 justify-between max-w-screen-2xl mx-auto w-full border-b border-border">
          <div className="flex items-center gap-8 md:gap-12 h-full">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-2.5 h-2.5 bg-primary rounded-sm rotate-45 group-hover:rotate-90 transition-transform duration-500"></div>
              <span className="font-serif text-lg tracking-tight text-foreground font-semibold">Clearbook</span>
            </Link>
            
            <nav className="hidden md:flex items-center gap-6 h-full">
              {navItems.map(item => {
                const isActive = location === item.path || (item.path !== `/w/${address}` && location.startsWith(item.path));
                return (
                  <Link 
                    key={item.path} 
                    href={item.path}
                    className={`text-sm font-sans h-full flex items-center transition-colors border-b-2 mt-[2px] ${
                      isActive ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-2">
              <label htmlFor="cost-method" className="text-[11px] text-muted-foreground font-sans uppercase tracking-[0.08em]">Cost method</label>
              <select 
                id="cost-method"
                value={method} 
                onChange={(e) => setMethod(e.target.value as CostMethod)}
                className="bg-transparent text-sm font-sans text-foreground pb-0.5 focus:outline-none cursor-pointer"
              >
                <option value="fifo">FIFO</option>
                <option value="lifo">LIFO</option>
                <option value="hifo">HIFO</option>
              </select>
            </div>
            <WalletConnectButton />
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden border-b border-border overflow-x-auto scrollbar-none px-4">
          <div className="flex gap-6 min-w-max h-12">
            {navItems.map(item => {
              const isActive = location === item.path || (item.path !== `/w/${address}` && location.startsWith(item.path));
              return (
                <Link 
                  key={item.path} 
                  href={item.path}
                  className={`text-sm font-sans h-full flex items-center transition-colors border-b-2 mt-[2px] ${
                    isActive ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Single slim status line */}
        {status && !statusError && (
          <div className="border-b border-border/60 bg-muted/20">
            <div className="max-w-screen-2xl mx-auto w-full px-6 py-2 flex flex-col md:flex-row md:items-center justify-between gap-2 text-sm font-sans">
               <div className="flex flex-wrap items-center gap-3">
                  <span className={`flex items-center gap-1.5 font-medium ${
                    status.state === "indexing" ? "text-accent" : 
                    status.state === "ready" ? "text-success" : 
                    "text-destructive"
                  }`}>
                    {status.state === "indexing" ? <Loader2 className="h-4 w-4 animate-spin" /> :
                     status.state === "ready" ? <CheckCircle2 className="h-4 w-4" /> :
                     status.state === "partial" ? <AlertTriangle className="h-4 w-4" /> :
                     <ShieldAlert className="h-4 w-4" />}
                  </span>
                  
                  <span className="text-foreground font-medium tabular-nums">{status.displayAddress}</span>
                  <span className="text-muted-foreground text-xs">{status.isDemo ? "Demo ledger" : truncateAddress(address, 8)}</span>
                  
                  <span className="text-border mx-1">|</span>
                  
                  {status.state === "indexing" ? (
                    <span className="text-muted-foreground text-xs">Events: {status.eventsIndexed} / Sigs: {status.signaturesScanned}</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      {status.lastIndexedAt ? `Indexed ${new Date(status.lastIndexedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : "Never indexed"}
                    </span>
                  )}
               </div>

               <div className="flex items-center gap-4">
                  <button 
                    onClick={handleRefresh}
                    disabled={indexWallet.isPending || status.state === "indexing"}
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors focus:outline-none text-xs"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${indexWallet.isPending ? 'animate-spin' : ''}`} />
                    {status.state === "not_indexed" ? "Index" : "Refresh"}
                  </button>
               </div>
            </div>
            
            {/* Extended message line for demo, warnings or errors */}
            {(status.warnings?.length > 0 || status.state === 'error' || status.state === 'partial' || (status.isDemo && status.message)) && (
              <div className="max-w-screen-2xl mx-auto w-full px-6 pb-2.5 flex flex-col gap-1 text-[13px] text-muted-foreground">
                {status.isDemo && status.message && <span>{status.message}</span>}
                {(status.state === 'error' || status.state === 'partial') && !status.isDemo && <span className="text-destructive">{status.message}</span>}
                {status.warnings?.map((w, i) => <span key={i} className="text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3 w-3"/> {w}</span>)}
              </div>
            )}
          </div>
        )}
      </header>

      <main className="flex-1 w-full max-w-screen-2xl mx-auto p-6 md:px-12 md:py-8 flex flex-col">
        {statusError && (
          <div className="border border-border bg-card p-12 flex flex-col items-center justify-center text-center gap-4 max-w-2xl mx-auto w-full mt-12 shadow-sm">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h3 className="font-serif text-2xl text-foreground">
              {statusError.status === 400 ? "Invalid account address" : "Unable to load ledger"}
            </h3>
            <p className="text-muted-foreground font-sans text-sm max-w-md break-all leading-relaxed">
              {statusError.data?.message ?? statusError.message}
            </p>
            <Link href="/" className="mt-4 text-xs font-sans uppercase tracking-[0.08em] text-foreground border-b border-foreground pb-0.5 hover:text-primary hover:border-primary transition-colors">
              Return to search
            </Link>
          </div>
        )}
        
        {!statusError && children}
      </main>
    </div>
  );
}
