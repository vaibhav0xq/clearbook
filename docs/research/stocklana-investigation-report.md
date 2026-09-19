# Stocklana investigation report

Prepared: Saturday 19 September 2026 (IST). No code has been written. This report ends with a proposal that needs your approval before the build starts.

Supporting files (full detail, all sourced):

- `docs/research/sponsors-and-landscape.md` (sponsor APIs, SDKs, verified facts, unverified items)
- `docs/research/existing-projects.md` (55 public repos, 10 live incumbents, crowded and open areas)
- `docs/research/design-references.md` (five reference sites, eight benchmarks, three visual systems)
- `docs/research/screens/` (screenshots of reference and benchmark sites)

## 1. Executive summary

- The hackathon is real, live and organised by the Solana Foundation on hackathons.solana.com. Prize pool $126,000: a $100,000 main track plus five sponsor bounties (PreStocks $10k, Tessera $6k, Clawpump $5k, Meteora $5k, Pyth non cash).
- The deadline is one instant: Friday 25 September 2026, 4:00 pm ET. In your timezone that is Saturday 26 September 2026, 01:30 IST. The "Sep 25" vs "Sep 26" difference on the page is only the browser rendering that instant in local time. There is no separate registration deadline. Register first, then submit. Edits are allowed until close.
- The field is crowded in exactly the places most builders go first: trading terminals, after hours price gap boards, baskets and DCA, Meteora launch forms and PreStocks catalogs. Nine public repos already target after hours fair value alone.
- The clearest open wedge is the accounting layer that every brokerage gives its customers and no Solana wallet gives holders of tokenized stocks: cost basis and lots, realized and unrealized gains, corporate action income, issuer aware valuation and an exportable, verifiable statement.
- Recommendation: build **Clearbook** (working name), the brokerage statement for tokenized stocks on Solana. Paste or connect any wallet, get a complete issuer aware ledger across xStocks, Ondo and PreStocks, marked to market with Pyth, with month end statements you can export and notarize on chain. One write action closes the loop: sell or rebalance a lot through Jupiter and watch the ledger update.
- It targets the main track (Infrastructure and Investing wedge: "corporate actions, compliance, analytics" is named on the page), the Pyth bounty (every valuation number comes from Pyth) and the PreStocks bounty (PreStocks positions get first class treatment; Tessera is deliberately excluded because mixing pre IPO issuers makes a project ineligible for the PreStocks bounty).
- It is achievable solo in six days because it needs no custom on chain program: indexing, accounting logic, a data heavy React product and one Jupiter swap. Those match your strengths.
- Visual direction: "Ledger Field" for the application (dark, precise, bone on ink, plum used sparingly) with a "Registered Share" hero moment: a 3D paper certificate that turns into the actual statement. ThreeUI is the 3D library you asked me to find (421 Three.js components, free community tier on npm).

## 2. Verified deadline, registration and submission facts

| Fact | Verified value | Source |
|---|---|---|
| Name | Stocklana ("The stock market is open for building") | Official page |
| Organiser | Solana Foundation (awards the $100,000 main track); hosted on hackathons.solana.com | Official page, Judging section |
| Status | LIVE, 695 registered, 121 submissions, 5 bounty tracks at time of check | Official page stats |
| Submission deadline | Friday 25 September 2026, 4:00 pm ET (EDT, UTC-4) = 20:00 UTC = Saturday 26 September 01:30 IST | Official page, Timeline |
| Date display mismatch | Header field shows "SEP 25, 2026" when rendered in a US or UTC browser and "SEP 26, 2026" in an IST browser. Same instant. The countdown showed "6 days" for you and "7 days" for my fetch for the same reason (rounding at different times of day) | Official page fetched server side vs your screenshots |
| Separate registration deadline | None published. Registration and submission stay open until submissions close | Official page, Submitting section |
| Must register before submitting | Yes: "Register, then Submit Project before the deadline" | Official page |
| Registration open | Yes at time of check (Register and Submit Project links live on the page) | Official page |
| Edits after submitting | Allowed until submissions close | Official page |
| Required links | At least one of GitHub, live demo or video | Official page |
| Teammates | Invited from the submit form | Official page |
| Judging window | Through 2 October 2026. Winners announced on the site and contacted through the site about payout | Official page |
| Deadline history | Originally earlier; extended to 25 September 4 pm ET when the five sponsor tracks were added (announced by @solana, the second X link you sent) | Your screenshot of the X post; Solana Compass coverage. Direct X API access failed with a billing error in this workspace, so the post text was taken from your screenshot |

Internal deadline I propose: submit by Friday 25 September 21:30 IST (12:00 pm ET), four hours before close, then use the edit window only for link fixes.

## 3. Rules and eligibility checklist

| Rule | Answer | Notes |
|---|---|---|
| Who can enter | Individuals and teams | No team size limit published |
| Submissions per team | One | Official page |
| Original work | Required | Wording is "original work". The page does not define a build window explicitly. Treat the project as built during the event and keep the git history clean and dated |
| Open source components | Allowed "if you say so" | Disclose every library and template (including ThreeUI, shadcn, Jupiter SDK) in the README and submission |
| Mainnet vs devnet | Not required by the official rules | Meteora's bounty says "working code on mainnet beats slides". xStocks, Ondo and PreStocks tokens exist only on mainnet, so a mainnet demo is the credible path for our idea anyway |
| Demo format | GitHub, live demo or video (one minimum) | Plan all three |
| Judging question | "Could this be a real app that people will actually use?" | Judges look for a real user and problem, a working end to end demo, a reason it belongs on Solana and quality of execution |
| Prize split inside the $100k | Not published | Assume several winners, unknown split |
| KYC or payout | "Winners are contacted through the site about payout" | Keep the registered account email reachable |

## 4. Prize, track and bounty breakdown

| Track | Sponsor | Prize | Structure |
|---|---|---|---|
| Main track | Solana Foundation | $100,000 | Split not published |
| Best Use of PreStocks | PreStocks | $10,000 | 1st $5,000, 2nd $3,000, 3rd $2,000. Winners may be added to the PreStocks ecosystem page |
| Tessera T Tokens | Tessera | $6,000 | Product or use case with OpenAI or Kalshi T Tokens |
| Stocknized Agent on Clawpump | Clawpump | $5,000 | 1st $3,000, 2nd $1,500, 3rd $500. Launch a token with a stock paired pool via Clawpump and Meteora |
| Best Use of Meteora DBC | Meteora | $5,000 | Originality of DBC configuration, technical soundness, life after the hackathon |
| Best use of Pyth market data | Pyth Network | 3 months of Pyth Pro (non cash) | Centrality of Pyth data, integration quality, life after the hackathon |

Total $126,000 cash equivalent as displayed. The five suggested wedges on the page: Trading, Investing, Credit and yield, Infrastructure, Consumer. "Pick one wedge and make it excellent."

## 5. Sponsor requirements and resources

| Sponsor | What they want | Hard constraints | Key resources (verified live) | Our use |
|---|---|---|---|---|
| PreStocks | Unique, well executed products that drive value to PreStocks and pre IPO tokens: discovery, research, analysis, trading, DeFi, tools, agents, lending, structured products, automations | Projects that integrate non PreStocks pre IPO tokens may be ineligible. Tokens are SPV exposure, not shares. US persons excluded | Public JSON `https://prestocks.com/api/prestocks` (8 tokens: ANDURIL, ANTHROPIC, FIGUREAI, KALSHI, NEURALINK, OPENAI, POLYMARKET, SPACEX; fields: symbol, contract_address, markPrice, tokenPrice, markValuation, impliedValuation, supply). No SDK, no devnet | First class PreStocks positions in the ledger with premium or discount to mark price (today SPACEX trades 19.4% below mark, NEURALINK 7% above) |
| Tessera | Product with OpenAI or Kalshi T Tokens, bonding curves, memes, anything that drives value | T Tokens are loan participation rights. US, China and other regions excluded | docs.tessera.pe, `https://rest-api.tessera.pe/v1/public/token-details` | Excluded on purpose to protect PreStocks eligibility |
| Clawpump | Launch a token with a stock paired liquidity pool using Clawpump and Meteora | Requires an actual token launch; allowlist of stock quote tokens unverified | clawpump.tech | Not pursued (conflicts with a serious product wedge) |
| Meteora | Equity like launch mechanics, price discovery for thin pairs, novel curves, issuer tooling on DBC | Mainnet code preferred. Token 2022 quote mints need token badge compatibility | docs.meteora.ag/developer-guides/dbc, MCP docs.meteora.ag/mcp, TS SDK `@meteora-ag/dynamic-bonding-curve-sdk` (v1.5.12 observed), program `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` on mainnet and devnet | Not pursued for the MVP (five direct competitors already) |
| Pyth | Live financial data doing real work; use the equity feed, the xStock feed, the Ondo feed or all three | After the August 2026 Core upgrade, Hermes price endpoints and the MCP `get_latest_price` tool require an API key or access token (verified: both return unauthorized without one). Metadata endpoint is open. A free Pyth Terminal account at pythdata.app issues an API key | Feed IDs verified: `Equity.US.AAPL/USD` 49f6b65c...5688, `Crypto.AAPLX/USD` 978e6cc6...8675, `Crypto.AAPLON/USD` e6734de8...56f2, plus `Equity.Index.AAPL/USD` (24/7 index) and `Crypto.AAPLX/AAPL.RR` (xStock redemption rate). Market hours metadata with next open and close. MCP endpoint mcp.pyth.network/mcp | Every valuation, premium and market session state in the product comes from Pyth. Historical prices for month end statements via Pyth Pro history |

Solana tokenized stock facts that shape the build (all verified):

- xStocks (Backed): Token 2022 with the Scaled UI Amount extension. Raw balances never change; dividends and splits change a per mint multiplier. Dividends are reinvested net of withholding, so a dividend shows up as a multiplier increase, not a cash payment. Canonical mint list and multipliers: `GET https://api.backed.fi/api/v2/public/assets` (also exposes trading hours mode, halts, next change). Example AAPLx mint `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp`, 32,583 holders, about $590k DEX liquidity, about $870k 24h volume, Jupiter routes 100 USDC to AAPLx through Byreal with 0.02% impact.
- Ondo Global Markets: AAPLon mint `123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo`, Token 2022, only about $900 of DEX liquidity. Ondo liquidity lives in Ondo's own mint and redeem venue, so on chain holders exist but DEX pricing is thin. A ledger can value them with Pyth even when DEX quotes are unusable.
- Jupiter search for "AAPL" returns several fake "AAPL Official Token" mints next to the real ones. Issuer aware mint verification is a real safety feature, not decoration.
- Jupiter Swap and Token APIs work without a key on `lite-api.jup.ag` for quoting and building swap transactions.

## 6. Existing projects and submissions

Official submissions are hidden until the period ends ("No public projects yet. Projects become visible after the submission period ends"), the leaderboard is empty and the JSON routes I tried return 404. So the competitive picture comes from GitHub (all 34 `stocklana` repo hits paged, plus adjacent queries) and web coverage. X could not be queried from this workspace. The full 55 row table with links, dates, strengths and weaknesses is in `docs/research/existing-projects.md`. The rows that matter most for our decision:

| Project | What they build | Target | Duplicate risk |
|---|---|---|---|
| Basis Terminal, Closing Bell, PegLens, FairFill, Noctis, Afterbell, After Hours, AfterHours, GapGuard | Wrapper vs real equity price gap, after hours fair value, gap risk, guarded fills | Main, Pyth | High. This is the most crowded cluster |
| STOCKNINE, STOCK.sh, TAPE, xStocks Terminal, Henar | Trading terminals and screeners | Main | High |
| bozBasket, Corpus, Slyz, FolioX, Stocklana Baskets, custom baskets, Stocklane | Baskets, indexes, DCA, portfolio | Main | High |
| StockCurve (two repos), EquityCurve Studio, OmniCurve, Wallie DBC | Meteora DBC launchers for stock quoted pairs | Meteora, Clawpump | High |
| PreStocks ActionKit, PreStocks Pulse, VeriQ, PreLendd | PreStocks SDK, data layer with premium radar and index, research workspace, lending | PreStocks | High for catalogs and data layers |
| Multiplier | Corporate actions oracle for xStocks | Main, Pyth | Medium. Sees the problem, provenance unproven, no ledger |
| DividendX | Splits exposure from dividend rights | Main | Medium |
| ShareLens | Read only xStock unit inspector with exact decimals | Infrastructure | Medium. Narrow, no P&L or statements |
| Confide | Private holdings with selective proofs | Main | Medium |
| Stocklana Fantasy, Canopy, StockSplit | Games and social pools | Main | Medium |

Live incumbents to respect: Kraken xStocks, Jupiter Stocks, Phantom tokenized equities, Ondo Global Markets, PreStocks, Tessera, Kamino xStocks lending, Drift, Remora, Superstate. None of them provides a self custody statement with cost basis, lots, income and exports.

## 7. Opportunity gap analysis

Crowded (avoid): terminals and screeners, after hours price gap and fair value boards, baskets and DCA, plain DBC launchers, PreStocks catalogs and data layers, pre trade risk warnings.

Underserved (from the scan, cross checked against incumbents):

1. Post trade accounting: issuer aware cost basis, lots, realized and unrealized gains, income events, exportable records. No discovered project does this.
2. Corporate actions with a verified path: xStocks multipliers encode dividends and splits, yet no product turns them into readable events in a holder's history.
3. Cash flow accounting across issuers: dividends, withholding, reinvestment, fees and total return across xStocks, Ondo, PreStocks.
4. Programmable spending from stock collateral (guarded credit lines, auto repay).
5. Treasury controls for organisations holding tokenized stocks.
6. Issuer quality and legal rights comparison at trade time.

Gaps 1, 2 and 3 are one product. It has a universal forcing function (tax and record keeping), it is read mostly (low on chain risk for a solo builder) and it is the part of "owning stocks" that brokerages do well and wallets do not do at all. That is the recommendation.

## 8. Recommended idea: Clearbook

One line: **the brokerage statement for tokenized stocks on Solana.**

User and problem: anyone who has bought xStocks, Ondo or PreStocks tokens in a self custody wallet. They hold real economic exposure to Apple or SpaceX, but they have no cost basis, no realized gain figure, no record of the dividends that arrived as multiplier changes, no month end statement and no way to prove any of it to an accountant, a co founder or a tax authority. Portfolio trackers show a price; none of them do the accounting.

What it does:

1. Paste any Solana address or connect a wallet. Clearbook indexes every transaction that touched a verified tokenized stock mint (xStocks via the Backed public API, Ondo, PreStocks via their API) and rejects look alike scam mints.
2. Builds a ledger: buys, sells, transfers in and out, swaps between wrappers, with fees and fills reconstructed from token balance changes.
3. Builds lots and computes realized gains with selectable methods (FIFO, LIFO, HIFO) and unrealized gains per lot, per issuer, per stock.
4. Reads xStocks multipliers and turns increases into corporate action events: "Apple dividend reinvested, multiplier 1.000 to 1.008, +0.0025 AAPLx". Shows the current multiplier for every holding so balances are never misread.
5. Marks everything to market with Pyth: the real equity feed for fair value, the xStock or Ondo feed for the wrapper price, premium or discount between them and market session state (regular, pre, post, overnight, closed) so the user knows which price is live right now. PreStocks positions are marked against PreStocks mark price with the same premium or discount view.
6. Produces statements: monthly or custom range, holdings, activity, income, realized gains, valuation at period end using Pyth history. Export PDF and CSV. One click notarizes the statement hash on Solana (memo transaction) so anyone can verify the document later.
7. One trading action so the loop closes: pick a lot, sell or swap it through Jupiter, sign and watch the ledger, the lot and the realized gain update from the confirmed transaction.

Why it belongs on Solana: the shares and every trade are already public on Solana, so the statement can be computed and verified by anyone without trusting a broker. The verification memo is native. The issuers (Backed, Ondo, PreStocks) and the liquidity (Jupiter) are on Solana.

Why this can win, mapped to the judging criteria:

| Criterion | How Clearbook meets it |
|---|---|
| Real user and problem | Every self custody holder of tokenized stocks needs cost basis and records. 32k holders of AAPLx alone. The problem is legally forced (tax), not invented |
| Working end to end demo | Paste a real active wallet, see a full ledger in seconds, export a statement, notarize it, execute a real Jupiter sale and watch the ledger update on mainnet |
| Reason it belongs on Solana | Public ledger makes a trustless statement possible; issuers, tokens and liquidity all live on Solana; Token 2022 multipliers are a Solana specific mechanic that we make legible |
| Quality of execution | Accounting correctness (raw amounts, decimals, multipliers, lot methods), truthful states (pending, stale, unavailable), premium typography and a restrained cinematic hero. This is where a solo builder with strong frontend skills can beat teams |
| Pyth bounty | Every valuation number, the premium view, market session state and period end prices come from Pyth. Three feed types per stock (equity, xStock, Ondo) plus the redemption rate feed |
| PreStocks bounty | PreStocks positions get lots, gains, mark price premium and lifecycle notes. No Tessera integration, so eligibility is protected |

Why it is not duplicated: none of the 55 public repos builds lots, realized gains, income events or statements. Multiplier (corporate actions oracle) and ShareLens (unit inspector) touch adjacent pieces without accounting or exports. PreStocks Pulse does a premium radar and index, not holder accounting. Incumbent wallets and terminals show prices and balances only.

What to build first (in this order): the ledger engine on real wallet history for xStocks, with correct raw amount and multiplier handling, proven against a known wallet. Everything visible is built on that.

Working name is Clearbook. Alternatives if you prefer: Costbook, Sharebook. Naming can change without affecting the plan.

## 9. Alternative ideas, ranked

| Rank | Idea | Wedge | Why it could win | Why it ranks lower |
|---|---|---|---|---|
| 1 | Pay from your portfolio: guarded USDC credit line against xStocks collateral (Kamino or Jupiter Lend) with Solana Pay checkout and auto repay rules | Consumer, Credit | Named on the page ("spending from a portfolio"), underserved, strong demo | Needs lending SDK integration and real mainnet funds, liquidation and off hours pricing risk, guard logic needs a program or a keeper. Too much on chain risk for six solo days |
| 2 | Know what you hold: issuer quality and legal rights comparison at trade time (redemption rights, dividends handling, geography, fees, custody) with verified mints and Jupiter execution | Trading, Infrastructure | Real safety problem (scam mints, wrapper confusion) | Overlaps with FairFill, Henar and the terminal cluster |
| 3 | Equity DBC issuer console: Pyth anchored curve presets and monitoring for thinly traded stock pairs on Meteora DBC | Infrastructure, Meteora | Exact Meteora bounty fit, devnet available | Five direct competitors, small audience, weak main track story |
| 4 | Treasury controls for organisations holding tokenized stocks: policies, exposure limits, audit trail | Infrastructure | Underserved | Needs multisig integration and a customer we cannot show in a week |
| 5 | First time investor mobile flow with income goals and local context | Consumer, Investing | Mainstream appeal | DCA and portfolio field is crowded; hard to differentiate on features alone |

## 10. Technical architecture (recommended idea)

Stack: pnpm monorepo already in this project. React + Vite frontend (TypeScript), Node API server (existing `api-server` artifact) for indexing, accounting and exports, Postgres for cached ledgers and statements. No custom Solana program.

Data sources:

- Solana RPC (Helius free tier recommended for rate limits): signatures and transactions for the wallet's token accounts, pre and post token balances, Token 2022 mint extension state (Scaled UI Amount multiplier and pending multiplier).
- Backed public assets API: xStocks mints, tickers, underlying, multipliers, trading hours, halts.
- PreStocks API: mints, mark price, token price, supply.
- Ondo mint list: seeded from Jupiter verified tokens with the `ondo` tag and pinned in an issuer registry.
- Pyth: Hermes metadata (open), price updates and history through a Pyth Pro API key (free Pyth Terminal account), feeds `Equity.US.<SYM>/USD`, `Crypto.<SYM>X/USD`, `Crypto.<SYM>ON/USD`, redemption rate feeds where published.
- Jupiter: token search and verification, quote and swap transaction build for the sell or rebalance action.

Backend modules:

1. Issuer registry: verified mints by issuer with decimals, token program, underlying symbol, Pyth feed IDs, multiplier source. Refreshed hourly, versioned.
2. Indexer: pulls transactions per wallet, classifies each as buy, sell, wrapper swap, transfer in, transfer out or unknown, with counter asset amount, fee and fill price. Works on raw integer amounts. Idempotent, resumable, cached per signature.
3. Ledger engine: lots, cost basis, FIFO or LIFO or HIFO, realized gains, transfers in valued at Pyth price at block time, corporate action events from multiplier changes.
4. Valuation: Pyth latest and historical, session state, premium or discount, staleness flags; PreStocks mark price for pre IPO tokens.
5. Statements: period aggregation, PDF and CSV rendering, SHA 256 hash, notarize by building a memo transaction the user signs.
6. Trade action: Jupiter quote and swap transaction, client signs, server confirms and re indexes that signature.

Frontend surfaces: landing (hero certificate to statement, product proof, how it works, trust and limits), app shell (address or wallet), Holdings, Lots, Activity, Income and corporate actions, Statements, Trade sheet. Every number states its source and time. States: loading, partial index, stale price, market closed, unknown transaction, empty wallet, failed export.

Security and truth boundaries: read only by default, no custody, signing only in the user's wallet, clear labels for estimates, no tax advice claims, issuer eligibility notes shown plainly.

## 11. MVP scope and stretch scope

MVP (must ship):

- Address paste and wallet connect (Phantom, Solflare via wallet adapter)
- Issuer registry for xStocks, Ondo and PreStocks with scam mint rejection
- Indexer and ledger for buys, sells, transfers, wrapper swaps
- Lots with FIFO default and HIFO or LIFO toggle, realized and unrealized gains
- xStocks multiplier reading and corporate action events from multiplier history collected from launch of our indexer onward, plus current multiplier display
- Pyth valuation, session state, premium or discount for public stocks; PreStocks mark price premium
- Statement for any period with PDF and CSV export and on chain notarization
- One Jupiter sell or rebalance action with ledger update
- Landing page with the certificate hero and real product screens
- Deployed live demo, public GitHub repo, three minute video

Stretch (only after MVP is verified):

- Historical multiplier reconstruction from mint instruction history for full dividend history
- Multi wallet consolidation into one statement
- Pyth Pro history for period end valuations across all holdings (MVP can use latest prices plus cached daily closes we record ourselves)
- Shareable read only statement links with the on chain hash
- Alerts for corporate actions and halts
- Mobile layout refinements beyond responsive baseline

Out of scope: custody, lending, baskets, price prediction, Tessera, Clawpump, Meteora launches.

## 12. Build timeline (IST)

| Day | Date | Goal | Exit check |
|---|---|---|---|
| 0 | Sat 19 Sep | Approval, repo and secrets, design tokens, data spike: index one real wallet's xStocks history correctly | Ledger for one wallet matches manual math |
| 1 | Sun 20 Sep | Issuer registry, indexer hardening, lot engine, Pyth valuation module | Unit tests pass for lots and multipliers |
| 2 | Mon 21 Sep | App UI: Holdings, Lots, Activity, Income; wallet connect; states | Real wallet renders end to end |
| 3 | Tue 22 Sep | Statements, PDF and CSV, notarize memo, Jupiter trade action | Real mainnet sell updates ledger |
| 4 | Wed 23 Sep | Landing page and hero, polish, performance, mobile, accessibility | Lighthouse and reduced motion pass |
| 5 | Thu 24 Sep | Deploy, README, disclosures, demo script, video, screenshots | Submission draft complete |
| 6 | Fri 25 Sep | Fixes only. Submit by 21:30 IST. Hard stop 01:30 IST Sat 26 Sep | Submitted and confirmed |

Rule for the week: verification gate (typecheck, tests, build) before every commit, commit only verified states, commits authored by your GitHub identity.

## 13. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Pyth price endpoints need a key | Valuation blocked | Create the free Pyth Terminal account today and store the key as a secret. Fallback for display only: Backed underlying prices and Jupiter prices, labelled as such |
| RPC rate limits and large wallet histories | Slow or partial indexing | Helius free key, per signature cache, incremental indexing with a visible "partial" state |
| Token 2022 Scaled UI Amount confusion | Wrong balances or gains | Account in raw integers, apply multiplier explicitly, test against the xStocks docs examples, show multiplier in the UI |
| Historical multiplier data unavailable | Incomplete dividend history | Record multipliers from day one, show events from that date, label earlier periods as "not reconstructed" instead of guessing |
| Transaction classification errors (complex Jupiter routes, transfers between own wallets) | Wrong lots | Balance delta method first, "unknown" bucket surfaced to the user with manual tagging in stretch |
| Mainnet demo needs real tokens | Demo risk | Fund one demo wallet with a small amount (about $50 of USDC) for one AAPLx buy and sell; also demo with public active wallets read only |
| Scope creep toward a terminal | Duplication | Feature freeze after Day 3; every addition must serve the statement |
| Design time overrun | Weak first impression | Hero built from ThreeUI community components, one canvas, one idea; the application stays flat and fast |
| Legal wording | Credibility | No tax advice, no ownership claims for PreStocks (SPV exposure), issuer eligibility notes shown |

## 14. UI and UX creative direction

Concept name: **Registered Ledger**. A tokenized share is a certificate that became programmable. Clearbook is the book where those certificates are recorded. The landing hero is a physical share certificate rendered in 3D that folds into the actual statement the product produces. After that single cinematic move the site becomes quiet, precise and mostly typography and numbers.

Visual system (from the design research, direction "Ledger Field" for the app with the "Registered Share" hero):

- Palette: Ink #080A0D, Graphite #11151A, Bone #F3F1EA, Cool gray #98A1AD, Solana plum #7456A8 for under 10% of any screen, Confirmed mint #8ECFA8, Warning amber #D5A64A. Optional warm paper #F1EEE6 only inside the certificate device.
- Type: Instrument Sans for display and UI, IBM Plex Mono for values, addresses and time. Serif (Newsreader) only in the certificate device.
- Hero: ThreeUI 3D Paper Certificate with pointer relighting and the wallet's first holding embossed, resolving into the statement table. One WebGL canvas, lazy loaded after the headline, paused off screen, still image under reduced motion.
- Application: near flat surfaces, dense but aligned tables, stable vertical zones for keys and values, source and timestamp beside every price, distinct icons plus text for states (never colour alone).
- Motion: under 180 ms responses, hover travel under 8 px, staged reveals, no scroll hijacking, no confetti, no animation on quoted numbers.
- Copy: short, specific, no hype. Numbers carry the message.

UX rules adopted from the attached guides (only the ones that improve this product): design every state (loading, partial, stale, empty, error, pending confirmation) before decoration; never imply a completed transaction before confirmation; keep filters and context across navigation; distinguish missing data from zero; provide a recovery path with every error; show truth boundaries (estimate, cached, as of time). Guidance I am ignoring: fixed item count rules, generic whitespace recipes and pattern lore that does not apply to dense financial tables.

Anti patterns rejected on purpose: neon gradients on every surface, floating coins and planets, fake charts or invented TVL, wallet connect as the only action, marquee tickers, glass over low contrast text, three animation systems on one page.

## 15. Design reference analysis

| Site | What it actually is | Usable for us | Verdict |
|---|---|---|---|
| threeui.com/browse | The large 3D library: 421 Three.js components, WebGL shaders, full landing templates, UI effects. Community tier on npm (`@designcodeio/threeui`, MIT) and Pro source via CLI (launch price $99 per year or $199 lifetime), plus a Pro MCP endpoint | 3D Paper Certificate (hero), Predictive Arc Data Pixel Arc and Signal Particles (live data accents), Structure Flow Data Field and Topology Field (infrastructure visuals), Animated Top Dock command bar | This is the library the brief asked me to find. Use it for one hero device only |
| pryzm.design/studio | Background studio: gradient, grain, halftone, fluted glass, pixelate, aberration, export high resolution | Gradient and Grain backgrounds behind the certificate, subtle paper texture | Useful for still assets, not for interaction |
| feralui.dev/gradients | Gradient Builder (Flow, Sky, Aurora, Mesh, Forms, Glow, Bars, Prism) plus tactile physics driven React components elsewhere on the site | Hologram effect for a small verification seal, one soft gradient for the notarization card | Use sparingly. Full page gradients are the generic look we are avoiding |
| jiro.build | Prompt and template shop for vibe coding (1184+ items, paid) | Section structure ideas only (process steps, calculator header) | Lowest value. Nothing to copy visually |
| skiper-ui.com/components | shadcn oriented copy paste components with video previews (auto scale input, smooth caret input, card stack scroll, command palette) | Auto scale amount input for the trade sheet, command palette for address and ticker search, card stack scroll for the how it works section | Good for micro interactions inside the app |

Benchmarks: MetaMask and Solana show real product immediately after the hero and keep trust signals specific. Stripe, Linear and Mercury prove that neutral fields, one dominant device and strong typography read as premium. Jupiter and Ondo show the two poles of the tokenized stock world: dense trader UI versus institutional calm. Akedo was checked and is not a useful finance benchmark. Full notes, type detections and colour systems are in `docs/research/design-references.md`.

## 16. Next step build plan

If you approve Clearbook:

1. You: register on hackathons.solana.com if not already done, create a free Pyth Terminal account at pythdata.app and a free Helius account, then add `PYTH_API_KEY`, `HELIUS_API_KEY` and the repo scoped `GITHUB_TOKEN` as secrets here. Tell me the GitHub repo name to push to. Decide whether you can fund a demo wallet with about $50 USDC for the mainnet trade demo.
2. Me, Day 0: scaffold the web artifact, design tokens and the issuer registry, then prove the indexer on a real wallet before any UI.
3. Me, Days 1 to 3: ledger engine, app surfaces, statements, notarization, Jupiter action, each behind the verification gate and committed under your identity.
4. Me, Days 4 to 5: landing page, polish, deploy, README with disclosures, video script and submission draft for your review.
5. Both, Day 6: final pass and submission by 21:30 IST on Friday 25 September.

Decision needed from you: approve Clearbook, pick an alternative from section 9 or ask for changes to the scope.
