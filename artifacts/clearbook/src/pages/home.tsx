import { Link, useLocation } from "wouter";
import { useGetAppConfig, useGetPortfolio, getGetAppConfigQueryKey } from "@workspace/api-client-react";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useWalletSession } from "@/lib/wallet";
import { Figure } from "@/components/figure";
import { formatUSD, formatQuantity } from "@/lib/format";

export default function Home() {
  const { data: config, isLoading } = useGetAppConfig({
    query: {
      queryKey: getGetAppConfigQueryKey(),
    }
  });
  
  // Hero query
  const { data: demoPortfolio, error: demoPortfolioError } = useGetPortfolio("demo-holder");
  
  const [addressInput, setAddressInput] = useState("");
  const [, setLocation] = useLocation();
  const wallet = useWalletSession();
  const [addressError, setAddressError] = useState<string | null>(null);

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = addressInput.trim();
    if (!value) return;
    const isDemo = config?.demoWallets?.some((demo) => demo.id === value);
    if (!isDemo && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
      setAddressError("Not a recognized format. Expected 32-44 base58 characters.");
      return;
    }
    setAddressError(null);
    setLocation(`/w/${value}`);
  };

  useEffect(() => {
    if (wallet.connected && wallet.publicKey) setLocation(`/w/${wallet.publicKey}`);
  }, [wallet.connected, wallet.publicKey, setLocation]);

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground font-sans selection:bg-primary/20">
      <header className="px-6 py-6 md:px-10 md:py-8 flex items-center justify-between z-10 relative">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-primary rounded-sm rotate-45"></div>
          <span className="font-serif text-xl tracking-tight font-semibold">Clearbook</span>
        </div>
        <nav className="flex items-center gap-6">
          <Link href="/methodology" className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground transition-colors">
            Methodology
          </Link>
        </nav>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-12 flex items-center z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 w-full items-center">
          
          {/* Left Column: Form & Copy */}
          <div className="flex flex-col max-w-lg mx-auto lg:mx-0">
            <div className="text-[11px] font-sans uppercase tracking-[0.08em] text-primary font-semibold mb-6">Post-trade accounting</div>
            <h1 className="font-serif text-4xl md:text-[44px] tracking-tight text-foreground leading-[1.1] mb-6">
              The brokerage statement your wallet never gave you.
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed mb-10">
              Rebuild tax lots, read dividends from the token itself, mark positions to market and produce a document whose hash can be written to Solana.
            </p>

            <div className="bg-card border border-border p-6 md:p-8 shadow-sm relative mb-12">
              <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
              <form onSubmit={handleAddressSubmit} className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label htmlFor="lookup-address" className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground">Ledger address</label>
                  <div className="flex items-center border-b border-foreground focus-within:border-primary transition-colors group">
                    <input
                      id="lookup-address"
                      type="text"
                      placeholder="Paste a Solana address..."
                      value={addressInput}
                      onChange={(e) => {
                        setAddressInput(e.target.value);
                        if (addressError) setAddressError(null);
                      }}
                      className="flex-1 bg-transparent py-2.5 outline-none font-mono text-sm placeholder:text-muted-foreground/50 tabular-nums"
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <button type="submit" aria-label="Open ledger" className="px-2 text-foreground group-focus-within:text-primary hover:opacity-70 transition-colors">
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                  {addressError && <p className="text-[10px] font-mono text-destructive mt-1">{addressError}</p>}
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-border"></div>
                  <span className="text-[10px] font-sans uppercase tracking-[0.08em] text-muted-foreground">Or</span>
                  <div className="flex-1 h-px bg-border"></div>
                </div>

                <div className="flex justify-center">
                  {wallet.available ? (
                    <WalletConnectButton />
                  ) : (
                    <span className="text-xs font-sans text-muted-foreground">No Solana wallet detected in this browser.</span>
                  )}
                </div>
              </form>
            </div>

            {/* Demo Ledgers */}
            {!isLoading && config?.demoWallets && config.demoWallets.length > 0 && (
              <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200 fill-mode-both">
                <h2 className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground mb-4 border-b border-border pb-2">Demo ledgers</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  {config.demoWallets.map((demo) => (
                    <button
                      key={demo.id}
                      onClick={() => setLocation(`/w/${demo.id}`)}
                      className="group flex flex-col text-left py-2 border-b border-border/50 hover:border-primary transition-colors"
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="font-serif text-lg text-foreground group-hover:text-primary transition-colors">{demo.label}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:text-primary -translate-x-2 group-hover:translate-x-0 transition-all" />
                      </div>
                      <span className="text-xs text-muted-foreground mb-2">{demo.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Hero Statement Preview */}
          <div className="hidden lg:block w-full max-w-lg mx-auto animate-in fade-in duration-[1200ms] delay-300 fill-mode-both">
            <div className="bg-card shadow-xl shadow-foreground/5 border border-border p-10 relative overflow-hidden min-h-[520px]">
              {/* Sheet Masthead */}
              <div className="border-b-2 border-foreground pb-5 mb-8">
                 <div className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground mb-1.5">Statement</div>
                 <div className="font-serif text-4xl text-foreground tracking-tight">Clearbook</div>
                 <div className="mt-4 text-xs font-sans text-muted-foreground flex justify-between">
                   <span>Account: <span className="font-mono">demo-holder</span></span>
                   <span>{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                 </div>
              </div>
              
              {/* Sheet Figures */}
              <div className="flex items-start justify-between mb-8 pb-8 border-b border-border">
                 <Figure label="Net value" value={demoPortfolio ? formatUSD(demoPortfolio.totals.netValue) : "-"} size="lg" />
                 <Figure label="Unrealized" value={demoPortfolio ? formatUSD(demoPortfolio.totals.unrealizedPnl) : "-"} subTone={demoPortfolio?.totals.unrealizedPnl} size="md" className="text-right" />
                 <Figure label="Income est." value={demoPortfolio ? formatUSD(demoPortfolio.totals.incomeEstimate) : "-"} subTone={demoPortfolio?.totals.incomeEstimate} size="md" className="text-right" />
              </div>
              
              {/* Sheet Holdings */}
              <div className="flex flex-col gap-3">
                 <div className="text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground border-b border-border pb-1.5 flex justify-between">
                   <span>Asset</span>
                   <span>Value</span>
                 </div>
                 {demoPortfolio?.positions.slice(0,5).map((pos, idx) => (
                   <div 
                     key={pos.mint} 
                     className="flex justify-between items-baseline text-sm animate-in fade-in fill-mode-both"
                     style={{ animationDelay: `${500 + idx * 100}ms`, animationDuration: '800ms' }}
                   >
                     <div>
                       <span className="font-serif text-base mr-3 text-foreground">{pos.symbol}</span>
                       <span className="text-xs text-muted-foreground tabular-nums">{formatQuantity(pos.quantity)} shares</span>
                     </div>
                     <span className="tabular-nums text-foreground">{formatUSD(pos.marketValue)}</span>
                   </div>
                 ))}
                 {!demoPortfolio && (
                   <div className="text-xs text-muted-foreground">{demoPortfolioError ? "Preview unavailable. The API did not respond." : "Loading ledger..."}</div>
                 )}
              </div>
              
              {/* Soft Fade Out */}
              <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-card to-transparent pointer-events-none" />
            </div>
          </div>
          
        </div>
      </main>

      {!isLoading && config?.sources && (
        <footer className="w-full px-6 py-6 md:px-10 border-t border-border mt-auto bg-muted/20">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-sans text-muted-foreground uppercase tracking-[0.08em]">Data sources</span>
              <div className="flex flex-wrap gap-6">
                {config.sources.map(s => (
                  <div key={s.id} className="flex items-center gap-2 text-xs font-sans">
                    <div className={`w-1.5 h-1.5 rounded-full ${s.mode === 'live' ? 'bg-success' : s.mode === 'demo' ? 'bg-primary' : 'bg-destructive'}`}></div>
                    <span className="text-muted-foreground">{s.label} <span className="opacity-50 ml-1">({s.mode})</span></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
