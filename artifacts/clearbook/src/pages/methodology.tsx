import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListIssuers, useListAssets, useGetAppConfig } from "@workspace/api-client-react";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Reveal } from "@/components/motion/reveal";
import { Panel, Pill, Skeleton } from "@/components/surface";

const DEMO = "demo-holder";

const FILTER_INPUT =
  "h-9 w-full rounded-lg border hairline bg-white/[0.03] px-3 text-[13px] text-foreground placeholder:text-muted-foreground/60 transition-colors focus:border-primary/50 focus:bg-white/[0.05] focus:outline-none";

export default function Methodology() {
  // The status cards ask the API to exercise any source it has not heard from yet, so a fresh
  // instance reports observed state instead of "no request yet".
  const { data: config, isLoading: isConfigLoading } = useGetAppConfig({ probe: true });
  const { data: issuers, isLoading: isIssuersLoading } = useListIssuers();
  const { data: assets, isLoading: isAssetsLoading } = useListAssets();
  const [assetFilter, setAssetFilter] = useState("");

  // The registry holds several hundred mints. The list lives in a box of fixed height with its
  // own scroll and a symbol filter, so the page keeps the length of its prose.
  const visibleAssets = useMemo(() => {
    if (!assets) return [];
    const needle = assetFilter.trim().toLowerCase();
    if (!needle) return assets;
    return assets.filter(asset => asset.symbol.toLowerCase().includes(needle) || asset.issuer.toLowerCase().includes(needle));
  }, [assets, assetFilter]);

  return (
    <div className="relative min-h-screen flex flex-col">
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px] grid-lines opacity-40" />

      <header className="sticky top-0 z-50 pt-5">
        <div className="shell">
          <div className="glass-strong flex h-14 items-center justify-between rounded-2xl px-4">
            <Brand />
            <nav className="flex items-center gap-5">
              <Link href={`/w/${DEMO}`} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
                Demo ledger
              </Link>
              <Link href="/" className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
                Lookup
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="shell py-16 md:py-24">
        <Reveal>
          <h1 className="display text-[56px] md:text-[80px] text-foreground mb-6">Methodology</h1>
          <p className="text-[17px] text-muted-foreground max-w-2xl leading-relaxed">
            Clearbook rebuilds a brokerage statement from public Solana history. This page describes how each figure is built, what is measured and what is estimated. Nothing here is tax advice.
          </p>
        </Reveal>
        
        {/* Capped on wide monitors so two column prose keeps a readable measure. Left aligned, not centred. */}
        <div className="mt-20 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-start desk:max-w-[1760px]">
          <aside className="hidden lg:block lg:col-span-3 lg:sticky lg:top-32">
            <ul className="flex flex-col gap-4 text-[13px]">
              <li><a href="#quantities" className="text-muted-foreground hover:text-foreground transition-colors">Quantities and multipliers</a></li>
              <li><a href="#basis" className="text-muted-foreground hover:text-foreground transition-colors">Cost basis</a></li>
              <li><a href="#marks" className="text-muted-foreground hover:text-foreground transition-colors">Marks and income</a></li>
              <li><a href="#statements" className="text-muted-foreground hover:text-foreground transition-colors">Statements and proofs</a></li>
              <li><a href="#sources" className="text-muted-foreground hover:text-foreground transition-colors">Data sources</a></li>
              <li><a href="#assets" className="text-muted-foreground hover:text-foreground transition-colors">Issuers and assets</a></li>
            </ul>
          </aside>
          
          <div className="lg:col-span-9 flex flex-col gap-24">
            <section id="quantities" className="scroll-mt-32">
              <Reveal className="flex flex-col gap-6">
                <h2 className="display text-[32px] text-foreground">Quantities and multipliers</h2>
                <div className="text-[15px] leading-[1.8] text-muted-foreground max-w-3xl flex flex-col gap-6">
                  <p>Balances are kept in raw token units. Shares of exposure are raw units divided by the token decimals and multiplied by the current Token-2022 multiplier of the mint. A multiplier increase grows the shares in a lot without changing what was paid for it.</p>
                  <p>Multiplier changes are read from the mint and classified by their ratio. An increase of less than five percent is recorded as a reinvested dividend. A change of one and a half times or more is recorded as a split and a change to two thirds or less as a reverse split. Anything else is listed as a multiplier change with its cause marked as not classified. Every classification is best effort and says so.</p>
                </div>
              </Reveal>
            </section>
            
            <section id="basis" className="scroll-mt-32">
              <Reveal className="flex flex-col gap-6">
                <h2 className="display text-[32px] text-foreground">Cost basis</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 text-[15px] leading-[1.8] text-muted-foreground">
                  <div className="flex flex-col gap-4">
                    <h3 className="text-foreground font-medium">How lots open</h3>
                    <p>A buy opens a lot at the cash paid plus the fee, both read from the same transaction. A buy paid in SOL takes its cash value from the stablecoin leg the stock pool settled in that transaction, since routers fill the stock against a stablecoin pool on the last hop. If no such leg covers the whole order the basis stays unknown. A swap between two wrappers of the same stock closes the lot given up at market value and opens a new one at that value. A transfer in has no cash leg. When a reference price at the time of receipt is known the lot opens with an estimated basis at that price. Otherwise the basis is unknown. Historical prices are not fetched for live wallets yet, so transfers into live wallets open lots with unknown basis.</p>
                    <p className="flex flex-wrap items-center gap-x-1 gap-y-2">
                      Lots and positions whose basis is not fully known are marked 
                      <Pill tone="loss">partial</Pill> or <Pill tone="loss">unknown</Pill> 
                      wherever they appear, with a note that says why. Unknown cost is excluded from cost basis and P/L totals and the exclusion is listed in the statement assumptions.
                    </p>
                  </div>
                  <div className="flex flex-col gap-4">
                    <h3 className="text-foreground font-medium">How lots are relieved</h3>
                    <p>A sell relieves open lots of that mint in the order set by the cost method. Realized P/L is proceeds net of fees minus the cost of the relieved lots. A transfer out relieves lots in the same order but recognizes no gain or loss. The method applies to the whole ledger and can be changed at any time.</p>
                    <ul className="flex flex-col gap-3 list-none mt-2">
                      <li><strong className="text-foreground font-medium">FIFO:</strong> oldest lots first. This is the default.</li>
                      <li><strong className="text-foreground font-medium">LIFO:</strong> newest lots first.</li>
                      <li><strong className="text-foreground font-medium">HIFO:</strong> highest cost per share first.</li>
                    </ul>
                  </div>
                </div>
              </Reveal>
            </section>

            <section id="marks" className="scroll-mt-32">
              <Reveal className="flex flex-col gap-6">
                <h2 className="display text-[32px] text-foreground">Marks and income</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 text-[15px] leading-[1.8] text-muted-foreground">
                  <div className="flex flex-col gap-4">
                    <h3 className="text-foreground font-medium">Marks</h3>
                    <p>Each position is marked with the first price available in this order: Pyth Pro, Jupiter, PreStocks, demo snapshot. The source and the age of the price are shown next to every mark. Where a reference price for the underlying stock exists, the difference between the token price and that reference and the session state of the underlying market are shown under the mark.</p>
                    <p>Statement values use the marks available when the statement is generated. Historical marks at period boundaries are not reconstructed.</p>
                  </div>
                  <div className="flex flex-col gap-4">
                    <h3 className="text-foreground font-medium">Income estimate</h3>
                    <p>The income estimate is the value of exposure gained through multiplier increases on lots still held, priced at the current mark. It is an estimate of reinvested dividends rather than a cash figure and it is labeled as an estimate everywhere it appears. Lots whose multiplier at acquisition could not be reconstructed contribute nothing to it.</p>
                    <p>Network fees paid in SOL are not converted to USD. Fees shown are those charged in the cash asset of the trade.</p>
                  </div>
                </div>
              </Reveal>
            </section>

            <section id="statements" className="scroll-mt-32">
              <Reveal className="flex flex-col gap-6">
                <h2 className="display text-[32px] text-foreground">Statements and proofs</h2>
                <div className="text-[15px] leading-[1.8] text-muted-foreground max-w-3xl flex flex-col gap-6">
                  <p>A statement covers a chosen period and cost method and contains opening and closing values, holdings, activity, closed lots, corporate actions, assumptions and the data sources used. Its SHA-256 hash covers the statement body, including the generation time, without the statement id. Generating a new statement for the same period produces a new document with its own hash. CSV and PDF exports carry the same figures and the same hash.</p>
                  <p>Notarizing a statement writes its hash to Solana in a memo transaction signed by the connected wallet. Verification checks memo inclusion, not signer identity. It confirms that the transaction succeeded and contains the memo with the hash, then records the signature, the confirmed slot and the signing account. It does not check who that account is, so a proof shows that the hash existed at that slot, not who published it. When no wallet is connected the hash is stored and the proof is labeled simulated. A simulated proof is not evidence of anything on chain.</p>
                  <p>The tax lot export lists every lot relieved by a sale or a wrapper swap in one UTC calendar year, in the column order of Form 1099-B so the figures carry to Form 8949. Transfers out are not disposals. Rows with an estimated or unknown basis show their proceeds and leave the gain blank. A loss with a buy of the same stock within 30 days before or after the sale, in any wrapper, carries a wash sale flag. The flag is a check for you to review. Clearbook adjusts no basis and files nothing.</p>
                  <p>Simulated sales and the statements you generate are private to your browser. Clearbook keeps a random id in local storage and sends it with each request, so two people opening the same wallet address see the same chain data and their own simulations. The id names a browser, not a person. Clearing site data starts a fresh view and leaves the chain data unchanged.</p>
                </div>
              </Reveal>
            </section>

            <section id="sources" className="scroll-mt-32">
              <Reveal className="flex flex-col gap-6">
                <h2 className="display text-[32px] text-foreground">Data sources</h2>
                {isConfigLoading ? (
                  <Skeleton className="h-48 rounded-2xl" />
                ) : config?.sources ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {config.sources.map(source => (
                      <Panel key={source.id} className="p-6 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[15px] font-medium text-foreground">{source.label}</span>
                          <Pill tone={source.mode === "live" ? "gain" : source.mode === "unavailable" ? "loss" : "amber"}>{source.mode}</Pill>
                        </div>
                        <p className="text-[14px] text-muted-foreground leading-relaxed">{source.detail}</p>
                        {source.requiredEnv.length > 0 && (
                          <div className="mt-auto pt-4 border-t hairline num text-[11px] text-muted-foreground/60">
                            Requires: {source.requiredEnv.join(", ")}
                          </div>
                        )}
                      </Panel>
                    ))}
                  </div>
                ) : null}
              </Reveal>
            </section>

            <section id="assets" className="scroll-mt-32">
              <Reveal className="flex flex-col gap-6">
                <h2 className="display text-[32px] text-foreground">Issuers and assets</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="flex flex-col gap-6">
                    <h3 className="text-foreground font-medium text-[15px]">Supported issuers</h3>
                    {isIssuersLoading ? (
                      <Skeleton className="h-32 rounded-2xl" />
                    ) : issuers ? (
                      <div className="flex flex-col gap-6">
                        {issuers.map(issuer => (
                          <div key={issuer.id} className="flex flex-col gap-2">
                            <div className="flex items-baseline gap-2">
                              <span className="text-[15px] font-medium text-foreground">{issuer.name}</span>
                              <span className="text-[13px] text-muted-foreground">({issuer.shortName})</span>
                            </div>
                            <p className="text-[14px] text-muted-foreground leading-relaxed">{issuer.structure}</p>
                            <span className="num text-[11px] text-muted-foreground/70 bg-white/[0.03] border hairline rounded-[4px] px-2 py-0.5 w-fit">
                              {issuer.tokenProgram}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-6">
                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="text-foreground font-medium text-[15px]">Recognized assets</h3>
                      {assets ? (
                        <span className="num text-[12px] text-muted-foreground">
                          {assetFilter.trim() ? `${visibleAssets.length} of ${assets.length}` : `${assets.length} mints`}
                        </span>
                      ) : null}
                    </div>
                    {isAssetsLoading ? (
                      <Skeleton className="h-64 rounded-2xl" />
                    ) : assets ? (
                      <Panel className="overflow-hidden flex flex-col">
                        <div className="p-3 border-b hairline">
                          <input
                            type="search"
                            value={assetFilter}
                            onChange={(e) => setAssetFilter(e.target.value)}
                            placeholder="Filter by symbol or issuer"
                            aria-label="Filter recognized assets"
                            className={FILTER_INPUT}
                          />
                        </div>
                        <div className="max-h-[480px] overflow-y-auto">
                          <table className="w-full text-left">
                            <thead className="sticky top-0 z-10 bg-[hsl(220_6%_7%)]">
                              <tr className="border-b hairline">
                                <th className="label py-3.5 px-5 font-normal">Symbol</th>
                                <th className="label py-3.5 px-5 font-normal">Issuer</th>
                                <th className="label py-3.5 px-5 font-normal">Class</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.05]">
                              {visibleAssets.map(asset => (
                                <tr key={asset.mint} className="row-hover">
                                  <td className="py-3 px-5 text-[14px]"><span className="num text-foreground tracking-[0.08em]">{asset.symbol}</span></td>
                                  <td className="py-3 px-5 text-[14px] text-muted-foreground">{asset.issuer}</td>
                                  <td className="py-3 px-5 text-[14px] text-muted-foreground capitalize">{asset.assetClass.replace('_', ' ')}</td>
                                </tr>
                              ))}
                              {visibleAssets.length === 0 ? (
                                <tr>
                                  <td colSpan={3} className="py-8 px-5 text-center text-[14px] text-muted-foreground">No asset matches that filter.</td>
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>
                      </Panel>
                    ) : null}
                  </div>
                </div>
              </Reveal>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
