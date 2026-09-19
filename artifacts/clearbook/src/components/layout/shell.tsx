import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateWalletQueries } from "@/lib/wallet-queries";
import { LayoutDashboard, Receipt, Activity, Clock, FileText, ArrowRightLeft, ShieldAlert, CheckCircle2, AlertTriangle, AlertCircle, Info, Loader2 } from "lucide-react";
import { useGetWalletStatus, useIndexWallet, getGetWalletStatusQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { useCostMethod } from "@/hooks/use-cost-method";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CostMethod } from "@workspace/api-client-react";

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
    { label: "Portfolio", path: `/w/${address}`, icon: LayoutDashboard },
    { label: "Tax lots", path: `/w/${address}/lots`, icon: Receipt },
    { label: "Activity", path: `/w/${address}/activity`, icon: Activity },
    { label: "Events", path: `/w/${address}/events`, icon: Clock },
    { label: "Statements", path: `/w/${address}/statements`, icon: FileText },
    { label: "Trade", path: `/w/${address}/trade`, icon: ArrowRightLeft },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex h-16 items-center px-4 md:px-6 justify-between max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-4 h-4 bg-primary rounded-full group-hover:scale-110 transition-transform"></div>
              <span className="font-serif text-xl tracking-tight hidden sm:inline-block">Clearbook</span>
            </Link>
            
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map(item => {
                const isActive = location === item.path || (item.path !== `/w/${address}` && location.startsWith(item.path));
                return (
                  <Link 
                    key={item.path} 
                    href={item.path}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Method</span>
              <Select value={method} onValueChange={(v) => setMethod(v as CostMethod)}>
                <SelectTrigger className="w-[90px] h-8 text-xs font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fifo">FIFO</SelectItem>
                  <SelectItem value="lifo">LIFO</SelectItem>
                  <SelectItem value="hifo">HIFO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="h-4 w-px bg-border hidden sm:block" />
            
            <WalletConnectButton />
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <div className="md:hidden border-b border-border bg-card overflow-x-auto scrollbar-none">
        <div className="flex p-2 gap-1 min-w-max">
          {navItems.map(item => {
            const isActive = location === item.path || (item.path !== `/w/${address}` && location.startsWith(item.path));
            return (
              <Link 
                key={item.path} 
                href={item.path}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap ${
                  isActive ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 lg:p-8 flex flex-col gap-6">
        {statusError && (
          <div className="p-8 border border-destructive/20 bg-destructive/10 text-destructive rounded-lg flex flex-col items-center justify-center text-center gap-2">
            <AlertCircle className="h-8 w-8" />
            <h3 className="font-semibold">
              {statusError.status === 400 ? "This is not a valid Solana address" : "Unable to load this wallet"}
            </h3>
            <p className="text-sm opacity-80 max-w-md break-all">{statusError.data?.message ?? statusError.message}</p>
            <Link href="/" className="mt-2 text-sm underline underline-offset-4">Back to the address lookup</Link>
          </div>
        )}
        {/* Status Bar */}
        {status && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card border border-card-border p-4 rounded-lg">
            <div className="flex items-center gap-3">
              {status.state === "indexing" ? (
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
              ) : status.state === "ready" ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : status.state === "error" ? (
                <ShieldAlert className="h-5 w-5 text-destructive" />
              ) : status.state === "partial" ? (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              ) : (
                <Info className="h-5 w-5 text-muted-foreground" />
              )}
              
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">{status.displayAddress}</span>
                  {status.isDemo && (
                    <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-mono uppercase tracking-wider">Demo</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{status.message}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
              {status.state === "indexing" ? (
                <span>Events: {status.eventsIndexed} / Sigs: {status.signaturesScanned}</span>
              ) : (
                <span>{status.lastIndexedAt ? new Date(status.lastIndexedAt).toLocaleTimeString() : "Never indexed"}</span>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh} 
                disabled={indexWallet.isPending || status.state === "indexing"}
                className="h-7 text-xs"
              >
                {status.state === "not_indexed" ? "Index now" : "Refresh"}
              </Button>
            </div>
          </div>
        )}
        
        {/* Warnings */}
        {status?.warnings && status.warnings.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex flex-col gap-2">
            <h4 className="text-sm font-semibold text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Indexing Warnings
            </h4>
            <ul className="text-xs text-destructive/80 space-y-1 list-disc list-inside pl-5">
              {status.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {!statusError && children}
      </main>
    </div>
  );
}
