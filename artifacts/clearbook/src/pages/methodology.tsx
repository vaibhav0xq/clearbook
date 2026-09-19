import { Link } from "wouter";
import { useListIssuers, useListAssets, useGetAppConfig } from "@workspace/api-client-react";
import { ArrowLeft } from "lucide-react";

export default function Methodology() {
  const { data: config, isLoading: isConfigLoading } = useGetAppConfig();
  const { data: issuers, isLoading: isIssuersLoading } = useListIssuers();
  const { data: assets, isLoading: isAssetsLoading } = useListAssets();

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground font-sans">
      <header className="px-6 h-14 flex items-center justify-between border-b border-border bg-card">
        <div className="flex items-center gap-4 max-w-screen-2xl mx-auto w-full">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-2.5 h-2.5 bg-primary rounded-sm rotate-45 group-hover:rotate-90 transition-transform duration-500"></div>
            <span className="font-serif text-lg tracking-tight text-foreground font-semibold">Clearbook</span>
          </Link>
          <div className="h-4 w-px bg-border"></div>
          <Link href="/" className="text-xs font-sans text-muted-foreground hover:text-foreground transition-colors uppercase tracking-[0.08em] flex items-center gap-1.5">
            <ArrowLeft className="w-3 h-3" /> Return
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto p-6 md:p-12 lg:p-16 flex flex-col">
        <div className="bg-card border border-border p-8 md:p-14 lg:p-20 relative shadow-sm animate-in fade-in duration-700">
          <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
          
          <div className="flex flex-col gap-4 mb-12 border-b-2 border-foreground pb-10">
            <div className="text-[11px] font-sans uppercase tracking-[0.08em] text-primary font-semibold">Documentation</div>
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight text-foreground leading-none">Methodology</h1>
            <p className="text-muted-foreground text-sm font-sans mt-4 max-w-2xl leading-relaxed">
              Clearbook rebuilds a brokerage statement from public Solana history. This page describes how each figure is built, what is measured and what is estimated. Nothing here is tax advice.
            </p>
          </div>

          <div className="flex flex-col gap-16 text-sm font-sans">
            <section className="flex flex-col gap-6">
              <h2 className="text-2xl font-serif border-b border-border pb-2 text-foreground">Quantities and multipliers</h2>
              <div className="text-muted-foreground leading-relaxed space-y-4 max-w-3xl">
                <p>
                  Balances are kept in raw token units. Shares of exposure are raw units divided by the token decimals and multiplied by the current Token-2022 multiplier of the mint. A multiplier increase therefore grows the shares in a lot without changing what was paid for it.
                </p>
                <p>
                  Multiplier changes are read from the mint and classified by their ratio. An increase of less than five percent is recorded as a reinvested dividend. A change of one and a half times or more is recorded as a split and a change to two thirds or less as a reverse split. Anything else is listed as a multiplier change with its cause marked as not classified. Every classification is best effort and says so.
                </p>
              </div>
            </section>

            <section className="flex flex-col gap-6">
              <h2 className="text-2xl font-serif border-b border-border pb-2 text-foreground">Cost basis</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-muted-foreground leading-relaxed">
                <div className="space-y-3">
                  <h3 className="font-medium text-foreground text-[15px]">How lots open</h3>
                  <p>
                    A buy opens a lot at the cash paid plus the fee, both read from the same transaction. A swap between two wrappers of the same stock closes the lot given up at market value and opens a new one at that value. A transfer in has no cash leg. When a reference price at the time of receipt is known the lot opens with an estimated basis at that price. Otherwise the basis is unknown. Historical prices are not fetched for live wallets yet, so transfers into a live wallet currently open with an unknown basis.
                  </p>
                  <p>
                    Lots and positions whose basis is not fully known are marked <span className="text-destructive uppercase tracking-[0.08em] text-[10px] px-1 border border-destructive/20 bg-destructive/5 rounded-[2px] mx-1">partial</span> or <span className="text-destructive uppercase tracking-[0.08em] text-[10px] px-1 border border-destructive/20 bg-destructive/5 rounded-[2px] mx-1">unknown</span> wherever they appear, with a note that says why. Unknown cost is excluded from cost basis and P/L totals and the exclusion is listed in the statement assumptions.
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="font-medium text-foreground text-[15px]">How lots are relieved</h3>
                  <p>
                    A sell relieves open lots of that mint in the order set by the cost method. Realized P/L is proceeds net of fees minus the cost of the relieved lots. A transfer out relieves lots in the same order but recognizes no gain or loss. The method applies to the whole ledger and can be changed at any time.
                  </p>
                  <ul className="space-y-2 list-outside ml-4 list-disc text-foreground/90">
                    <li><strong className="text-foreground font-medium">FIFO</strong>: oldest lots first. This is the default.</li>
                    <li><strong className="text-foreground font-medium">LIFO</strong>: newest lots first.</li>
                    <li><strong className="text-foreground font-medium">HIFO</strong>: highest cost per share first.</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-6">
              <h2 className="text-2xl font-serif border-b border-border pb-2 text-foreground">Marks and income</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 text-muted-foreground leading-relaxed">
                <div className="space-y-3">
                  <h3 className="font-medium text-foreground text-[15px]">Marks</h3>
                  <p>
                    Each position is marked with the first price available in this order: Pyth Pro, Jupiter, PreStocks, demo snapshot. The source and the age of the price are shown next to every mark. Where a reference price for the underlying stock exists, the difference between the token price and that reference and the session state of the underlying market are shown under the mark.
                  </p>
                  <p>
                    Statement values use the marks available when the statement is generated. Historical marks at period boundaries are not reconstructed.
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="font-medium text-foreground text-[15px]">Income estimate</h3>
                  <p>
                    The income estimate is the value of exposure gained through multiplier increases on lots still held, priced at the current mark. It is an estimate of reinvested dividends rather than a cash figure and it is labelled as an estimate everywhere it appears. Lots whose multiplier at acquisition could not be reconstructed contribute nothing to it.
                  </p>
                  <p>
                    Network fees paid in SOL are not converted to USD. Fees shown are those charged in the cash asset of the trade.
                  </p>
                </div>
              </div>
            </section>

            <section className="flex flex-col gap-6">
              <h2 className="text-2xl font-serif border-b border-border pb-2 text-foreground">Statements and proofs</h2>
              <div className="text-muted-foreground leading-relaxed space-y-4 max-w-3xl">
                <p>
                  A statement covers a chosen period and cost method and contains opening and closing values, holdings, activity, closed lots, corporate actions, assumptions and the data sources used. Its SHA-256 hash covers the statement body, including the generation time, without the statement id. Generating a new statement for the same period produces a new document with its own hash. CSV and PDF exports carry the same figures and the same hash.
                </p>
                <p>
                  Notarizing a statement writes its hash to Solana in a memo transaction signed by the connected wallet. Verification confirms that the transaction succeeded and contains the memo with the hash, then records the signature, the confirmed slot and the signing account. It does not check who that account is, so a proof shows that the hash existed at that slot, not who published it. When no wallet is connected the hash is stored and the proof is labelled simulated. A simulated proof is not evidence of anything on chain.
                </p>
              </div>
            </section>

            {/* Data Sources */}
            <section className="flex flex-col gap-6">
              <h2 className="text-2xl font-serif border-b border-border pb-2 text-foreground">Data sources</h2>
              
              {isConfigLoading ? (
                <div className="h-48 w-full bg-muted/50 animate-pulse rounded-none"></div>
              ) : config?.sources ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {config.sources.map(source => (
                    <div key={source.id} className="border border-border bg-background p-5 flex flex-col gap-2 shadow-sm">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium text-[15px] text-foreground">{source.label}</span>
                        <span className={`text-[10px] font-sans uppercase tracking-[0.08em] ${
                          source.mode === 'live' ? 'text-success' : 
                          source.mode === 'demo' ? 'text-primary' : 
                          'text-destructive'
                        }`}>
                          {source.mode}
                        </span>
                      </div>
                      <span className="text-[13px] text-muted-foreground leading-relaxed">{source.detail}</span>
                      {source.requiredEnv.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/50 text-[10px] font-mono text-muted-foreground">
                          Requires: {source.requiredEnv.join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            {/* Verified ecosystem */}
            <section className="flex flex-col gap-6">
              <h2 className="text-2xl font-serif border-b border-border pb-2 text-foreground">Issuers and assets</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="flex flex-col gap-5">
                  <h3 className="font-medium text-foreground text-[15px]">Supported issuers</h3>
                  {isIssuersLoading ? (
                    <div className="h-32 w-full bg-muted/50 animate-pulse rounded-none"></div>
                  ) : issuers ? (
                    <div className="flex flex-col gap-4">
                      {issuers.map(issuer => (
                        <div key={issuer.id} className="text-sm border-l-2 border-border pl-4 py-1">
                          <div className="font-medium text-foreground mb-1">{issuer.name} <span className="text-muted-foreground font-normal">({issuer.shortName})</span></div>
                          <div className="text-[13px] text-muted-foreground mb-2 leading-relaxed">{issuer.structure}</div>
                          <div className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-1.5 py-0.5 w-fit border border-border">
                            {issuer.tokenProgram}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-5">
                  <h3 className="font-medium text-foreground text-[15px]">Recognized assets</h3>
                  {isAssetsLoading ? (
                    <div className="h-64 w-full bg-muted/50 animate-pulse rounded-none"></div>
                  ) : assets ? (
                    <div className="border border-border bg-background shadow-sm overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-muted/30 border-b border-border">
                          <tr>
                            <th className="px-4 py-3 text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground font-normal">Symbol</th>
                            <th className="px-4 py-3 text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground font-normal">Issuer</th>
                            <th className="px-4 py-3 text-[11px] font-sans uppercase tracking-[0.08em] text-muted-foreground font-normal">Class</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {assets.map(asset => (
                            <tr key={asset.mint} className="hover:bg-muted/10 transition-colors">
                              <td className="px-4 py-3 font-serif text-[15px] text-foreground">{asset.symbol}</td>
                              <td className="px-4 py-3 text-[13px] text-muted-foreground">{asset.issuer}</td>
                              <td className="px-4 py-3 text-[13px] text-muted-foreground capitalize">{asset.assetClass.replace('_', ' ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

          </div>
        </div>
      </main>
    </div>
  );
}
