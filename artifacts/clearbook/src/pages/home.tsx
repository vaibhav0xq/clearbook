import { Link, useLocation } from "wouter";
import { useGetAppConfig, AppConfig, getGetAppConfigQueryKey } from "@workspace/api-client-react";
import { CertificateHero } from "@/components/hero/certificate-hero";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useWalletSession } from "@/lib/wallet";

export default function Home() {
  const { data: config, isLoading } = useGetAppConfig({
    query: {
      queryKey: getGetAppConfigQueryKey(),
    }
  });
  
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
      setAddressError("That is not a Solana address. Expected 32 to 44 base58 characters.");
      return;
    }
    setAddressError(null);
    setLocation(`/w/${value}`);
  };

  // Once a wallet is connected the portfolio is the natural landing page.
  useEffect(() => {
    if (wallet.connected && wallet.publicKey) setLocation(`/w/${wallet.publicKey}`);
  }, [wallet.connected, wallet.publicKey, setLocation]);

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      <header className="px-6 py-6 flex items-center justify-between z-50 relative">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-primary rounded-full"></div>
          <span className="font-serif text-xl tracking-tight">Clearbook</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link href="/methodology" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">
            Methodology
          </Link>
        </nav>
      </header>

      <main className="flex-1 px-6 pb-16 pt-6 md:pt-12">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="flex flex-col">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Post-trade accounting for tokenized stocks</p>
            <h1 className="mt-4 max-w-xl font-serif text-4xl leading-[1.05] tracking-tight md:text-5xl">
              The brokerage statement your Solana wallet never gave you.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
              Paste any wallet holding xStocks, Ondo or PreStocks tokens. Clearbook rebuilds the tax lots,
              reads issuer dividends and splits from the token itself, marks every position against Pyth
              and produces a statement you can export and notarize on chain.
            </p>

            <div className="mt-8 w-full max-w-md rounded-lg border border-card-border bg-card p-5 shadow-xl">
              <form onSubmit={handleAddressSubmit} className="flex flex-col gap-4">
                <div className="space-y-2">
                  <label htmlFor="lookup-address" className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Wallet address</label>
                  <div className="flex gap-2">
                    <Input
                      id="lookup-address"
                      placeholder="Paste a Solana address"
                      value={addressInput}
                      onChange={(e) => {
                        setAddressInput(e.target.value);
                        if (addressError) setAddressError(null);
                      }}
                      aria-invalid={!!addressError}
                      className="font-mono text-sm bg-background"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <Button type="submit" variant="secondary" className="px-3" aria-label="Open wallet">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                  {addressError && <p className="text-xs text-destructive">{addressError}</p>}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
                  {wallet.available ? (
                    <>
                      <span className="text-xs text-muted-foreground">Or sign in with {wallet.walletNames.slice(0, 2).join(" or ")}</span>
                      <WalletConnectButton />
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      No Solana wallet detected in this browser. Paste an address or open a demo ledger.
                    </span>
                  )}
                </div>
                {wallet.error && <p className="text-xs text-destructive">{wallet.error}</p>}
              </form>
            </div>

            {!isLoading && config?.demoWallets && config.demoWallets.length > 0 && (
              <div className="mt-10 w-full">
                <h2 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">Demo ledgers</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {config.demoWallets.map((demo) => (
                    <button
                      key={demo.id}
                      type="button"
                      onClick={() => setLocation(`/w/${demo.id}`)}
                      className="group flex flex-col items-start rounded border border-card-border bg-card/50 p-4 text-left transition-all hover:border-primary/50 hover:bg-card"
                    >
                      <span className="font-medium">{demo.label}</span>
                      <span className="mt-1 text-xs leading-relaxed text-muted-foreground">{demo.description}</span>
                      <span className="mt-3 flex flex-wrap gap-1.5">
                        {demo.holdingsPreview.map((holding) => (
                          <span key={holding} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {holding}
                          </span>
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative hidden lg:block">
            <div className="pointer-events-none absolute -inset-16 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative">
              <CertificateHero />
            </div>
          </div>
        </div>
      </main>

      {/* Sources Footer */}
      {!isLoading && config?.sources && (
        <footer className="w-full p-6 border-t border-border mt-auto bg-card/30">
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-8 justify-between items-start md:items-center">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Data sources</span>
              <div className="flex flex-wrap gap-3">
                {config.sources.map(s => (
                  <div key={s.id} className="flex items-center gap-1.5 text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full ${s.mode === 'live' ? 'bg-success' : s.mode === 'demo' ? 'bg-primary' : 'bg-destructive'}`}></div>
                    <span className="text-muted-foreground">{s.label} <span className="opacity-50">({s.mode})</span></span>
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
