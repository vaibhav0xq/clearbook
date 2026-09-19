import { Link } from "wouter";
import { useListIssuers, useListAssets, useGetAppConfig } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BookOpen, Layers, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Methodology() {
  const { data: config, isLoading: isConfigLoading } = useGetAppConfig();
  const { data: issuers, isLoading: isIssuersLoading } = useListIssuers();
  const { data: assets, isLoading: isAssetsLoading } = useListAssets();

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      <header className="px-6 py-6 flex items-center justify-between border-b border-border bg-card/50">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group">
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">Home</span>
          </Link>
          <div className="h-4 w-px bg-border"></div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-primary rounded-full"></div>
            <span className="font-serif text-xl tracking-tight hidden sm:inline-block">Clearbook</span>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto p-6 md:p-12 flex flex-col gap-16">
        
        {/* Intro */}
        <section className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h1 className="text-4xl md:text-5xl font-serif leading-tight">Methodology</h1>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
            Clearbook reconstructs brokerage-grade statements from raw blockchain events. We reverse-engineer tax lots, corporate actions, and realized gains by analyzing standard token transfers and price oracles.
          </p>
        </section>

        {/* Cost Basis & Relief */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <Layers className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-serif">Cost Basis & Lot Relief</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm text-muted-foreground leading-relaxed">
            <div className="space-y-4">
              <h3 className="font-medium text-foreground">Acquisition tracking</h3>
              <p>
                Tokens acquired via DEX swaps or direct mints are recorded with their exact dollar value at the time of execution.
                Tokens transferred from external wallets are flagged with <span className="text-destructive font-mono text-xs px-1 bg-destructive/10 rounded">unknown</span> basis, meaning their cost is estimated based on the historical mark at the time of transfer, but cannot be guaranteed for tax purposes.
              </p>
            </div>
            <div className="space-y-4">
              <h3 className="font-medium text-foreground">Relief methods</h3>
              <p>
                When you sell or transfer tokens out, Clearbook must decide which acquired lots were sold to calculate capital gains. We support three methods:
              </p>
              <ul className="space-y-2 list-disc pl-4 text-foreground/80">
                <li><strong className="text-foreground">FIFO</strong> (First In, First Out) - Default. Sells the oldest acquired lots first.</li>
                <li><strong className="text-foreground">LIFO</strong> (Last In, First Out) - Sells the most recently acquired lots first.</li>
                <li><strong className="text-foreground">HIFO</strong> (Highest In, First Out) - Sells the highest-cost lots first to minimize current capital gains.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Multipliers & Corporate Actions */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <BookOpen className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-serif">Multipliers & Corporate Actions</h2>
          </div>
          <div className="prose prose-sm prose-invert max-w-none text-muted-foreground">
            <p>
              Tokenized stocks often utilize rebasing or multiplier mechanics to reflect corporate actions like dividends and stock splits without requiring users to claim tokens or pay gas.
            </p>
            <p>
              Clearbook indexes multiplier changes on supported contracts (e.g., Token-2022 extensions). When a multiplier increases, your effective exposure increases. 
              We calculate <strong>Income estimate</strong> by tracking the dollar value of multiplier growth on the exact lots you hold, simulating the effect of reinvested dividends.
            </p>
          </div>
        </section>

        {/* Data Sources */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <h2 className="text-2xl font-serif">Data sources</h2>
          </div>
          
          {isConfigLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : config?.sources ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {config.sources.map(source => (
                <div key={source.id} className="border border-card-border bg-card p-4 rounded-lg flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{source.label}</span>
                    <Badge variant="outline" className={`text-[10px] font-mono uppercase ${source.mode === 'live' ? 'border-success text-success' : source.mode === 'demo' ? 'border-primary text-primary' : 'border-destructive text-destructive'}`}>
                      {source.mode}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{source.detail}</span>
                  {source.requiredEnv.length > 0 && (
                    <div className="mt-2 text-[10px] font-mono text-muted-foreground opacity-60">
                      Requires: {source.requiredEnv.join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {/* Issuers & Assets */}
        <section className="flex flex-col gap-6">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-serif">Verified ecosystem</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-4">
              <h3 className="font-medium">Supported issuers</h3>
              {isIssuersLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : issuers ? (
                <div className="flex flex-col gap-3">
                  {issuers.map(issuer => (
                    <div key={issuer.id} className="text-sm bg-card border border-card-border p-3 rounded">
                      <div className="font-medium mb-1">{issuer.name} <span className="text-muted-foreground font-normal">({issuer.shortName})</span></div>
                      <div className="text-xs text-muted-foreground mb-2">{issuer.structure}</div>
                      <div className="flex gap-2 text-[10px] font-mono">
                        <span className="bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{issuer.tokenProgram}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-4">
              <h3 className="font-medium">Verified assets</h3>
              {isAssetsLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : assets ? (
                <div className="overflow-hidden border border-card-border rounded-lg bg-card">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/50 border-b border-card-border font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Symbol</th>
                        <th className="px-3 py-2">Issuer</th>
                        <th className="px-3 py-2">Class</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
                      {assets.map(asset => (
                        <tr key={asset.mint}>
                          <td className="px-3 py-2 font-medium">{asset.symbol}</td>
                          <td className="px-3 py-2 text-muted-foreground">{asset.issuer}</td>
                          <td className="px-3 py-2 text-muted-foreground">{asset.assetClass}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
