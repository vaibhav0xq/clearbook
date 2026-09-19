# Stocklana sponsors and Solana tokenized-stock landscape

Research date: 2026-09-19. Values returned by live APIs are a point-in-time snapshot and can change. Addresses below are reproduced only where an official API, official documentation, or official repository published them.

## 1. PreStocks

### Verified facts

- PreStocks describes its products as tokens that track pre-IPO companies, are fully backed, trade 24/7, and have no minimum. Its footer says the tokens provide economic exposure only, with no ownership, voting, dividend, information, or other legal rights. The operating legal entity and named management team are **unverified**. Source: [PreStocks products](https://prestocks.com/products), [PreStocks home](https://prestocks.com/).
- The live public endpoint returns a top-level JSON array. Every object has `name`, `symbol`, `description`, `image`, `external_url`, `contract_address`, `markPrice`, `markValuation`, `tokenPrice`, `impliedValuation`, and `supply`. `markPrice` and `tokenPrice` are numbers, not formatted strings. Source: [public API](https://prestocks.com/api/prestocks).
- API snapshot:

| Symbol | Solana mint | Mark price | Token price | Implied valuation | Supply |
|---|---|---:|---:|---:|---:|
| ANDURIL | `PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB` | 150.55267989 | 152.9812291111421 | 135342349177 | 11805.959597636 |
| ANTHROPIC | `Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw` | 1007.78459952 | 1008.869105284619 | 1652872933566 | 7381.938865546 |
| FIGUREAI | `PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd` | 178.39197146 | 170.4177992076553 | 37155678789 | 3012.928870748 |
| KALSHI | `PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua` | 867.3924898 | 856.4361419786392 | 31150340779 | 904.903505253 |
| NEURALINK | `PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S` | 318.97876896 | 341.2106495319897 | 64998939574 | 2595.362081872 |
| OPENAI | `PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF` | 965.4612453366441 | 1029.635356619351 | 1275646439051 | 2826.5386792809263 |
| POLYMARKET | `Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP` | 144.68945003 | 146.4621024404681 | 14444936672 | 4817.288285883 |
| SPACEX | `PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh` | 153.8265633190491 | 123.95517472851961 | 1625190068663 | 43712.579169835 |

- Product descriptions say each token is backed 1:1 by SPV exposure. The site says products are not available in the United States, to US persons, or to other ineligible persons. Source: [public API](https://prestocks.com/api/prestocks), [FAQ](https://prestocks.com/faq).
- The product and ecosystem pages link to Jupiter and list Jupiter as trading and wallet infrastructure. The ecosystem also lists many integrations. Direct Raydium and Meteora pool addresses are **unverified**. Source: [products](https://prestocks.com/products), [ecosystem](https://prestocks.com/ecosystem).
- The mint program, plain SPL Token versus Token-2022, transfer restrictions, exact fee schedule, and whether secondary holders must KYC are **unverified** in the fetched official pages. The site does require users to attest that they are not US or otherwise restricted persons. Source: [FAQ](https://prestocks.com/faq).
- No devnet mints, SDK, formal developer documentation, or authenticated API were found. The ecosystem page invites projects to “Get in Touch.” The observed products are Solana mainnet assets. Source: [ecosystem](https://prestocks.com/ecosystem).

### Resources table

| Name | URL | What it is |
|---|---|---|
| Product API | https://prestocks.com/api/prestocks | Unauthenticated live token metadata and prices |
| Products | https://prestocks.com/products | Official catalog and links |
| FAQ | https://prestocks.com/faq | Mechanics and legal eligibility |
| Ecosystem | https://prestocks.com/ecosystem | Integrations and developer contact |

### Build implications

A six-day build can safely consume the public JSON and route swaps through Jupiter using the published mints. Cache and timestamp price responses because no stability or rate-limit contract is published. Do not imply share ownership, dividends, redemption rights, or US availability. A mainnet demo is the credible path because devnet assets and an SDK are unverified.

## 2. Tessera

### Verified facts

- Tessera says T-Tokens provide economic exposure through a loan-participation structure. Each token is a contractual loan-participation right against a dedicated issuer, a wholly owned subsidiary of Tessera Works Foundation. It is not equity and gives no ownership, voting, dividend, or cap-table rights. Source: [How T-Tokens Work](https://docs.tessera.pe/overview/how-do-tessera-token-work.md).
- The issuer lends into a protected structure tied to the underlying exposure. Repayment is tied to a qualifying liquidity event such as an IPO or acquisition. Tessera says it has a non-security legal opinion under Singapore law. Source: [How T-Tokens Work](https://docs.tessera.pe/overview/how-do-tessera-token-work.md).
- The official API is an unauthenticated top-level JSON array. Fields are `id`, `name`, `symbol`, `code`, `sector`, `mint`, `markPrice`, `holders`, and `markValuation`. Snapshot: T-OpenAI, mint `oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ`, mark price 812.79; T-Kalshi, mint `TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ`, mark price 413.8; T-SpaceX, mint `TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v`, mark price 423. Source: [token details API](https://rest-api.tessera.pe/v1/public/token-details).
- T-Tokens are SPL tokens on Solana. The docs exclude people and entities in the United States, China, and other restricted territories. “No KYC” does not remove these eligibility terms. Source: [How T-Tokens Work](https://docs.tessera.pe/overview/how-do-tessera-token-work.md).
- Official docs contain separate pages for transfer fees, buy/sell fees, auctions, redemption, proof of reserve, supported chains, and on-chain programs. Fees are charged on transfer from the sender, not on receipt. Exact current percentages should be read from the fee pages before shipping. Source: [documentation index](https://docs.tessera.pe/llms.txt), [transfer fees](https://docs.tessera.pe/features/token-system-and-fees/transfer.md).
- “Stonkfun” is referenced by the hackathon as a bonding-curve venue for Tessera assets, but its protocol, contracts, and relationship to Tessera were **unverified** in fetched Tessera docs.
- The API needs no observed API key. A public SDK, devnet mints, devnet program, and official DEX pool address list are **unverified**. The published mints are mainnet addresses.

### Resources table

| Name | URL | What it is |
|---|---|---|
| Docs | https://docs.tessera.pe | Product and legal documentation |
| Docs index | https://docs.tessera.pe/llms.txt | Complete page index |
| Token API | https://rest-api.tessera.pe/v1/public/token-details | Public token metadata and marks |
| App | https://app.tessera.pe | User product |
| On-chain programs | https://docs.tessera.pe/technicals/on-chain-programs.md | Official program documentation |

### Build implications

A read-only discovery, comparison, or portfolio tool is straightforward. A trade or transfer flow must account for sender-side token fees and geography. Mainnet is the only verified environment. Direct issuance, redemption, or a Stonkfun integration is risky without confirmed interfaces.

## 3. Clawpump

### Verified facts

- Clawpump calls itself “The financial operating system for AI agents” and offers agent deployment, wallets, market access, token launches, and 132 tools. Source: [Clawpump](https://clawpump.tech/).
- Stocklana’s official requirement, as reproduced in the supplied brief, is to launch a token with a stock-paired liquidity pool using Clawpump and Meteora. The public site confirms Meteora-based pools and describes one fee path as: after Meteora’s 20% protocol cut, 1% remains for LPs, and Clawpump distributes its share 75% to the agent and 25% to Clawpump. This wording is token-page specific and should not be generalized to every launch. Source: [Clawpump](https://clawpump.tech/), [example token page](https://clawpump.tech/tokens/6RdFDmUanGtrkvT8RCPGcG7EBVwFptEFMNMYuiwntqvj).
- The exact launch transaction sequence, supported stock quote-token allowlist, whether xStocks or PreStocks are accepted, generic fee schedule, API, SDK, documentation, and devnet support are **unverified**.
- The available public product appears mainnet-oriented. No devnet launch flow was found.

### Resources table

| Name | URL | What it is |
|---|---|---|
| Clawpump | https://clawpump.tech/ | Agent deployment and market product |
| Token market | https://clawpump.tech/tokens | Existing launches |
| X account | https://x.com/clawpumptech | Official social account, not fetchable with the web skill |

### Build implications

The lowest-risk entry is to use Clawpump’s own launch UI and show the resulting live Meteora pool in a narrow agent product. Do not design around a particular stock quote token until the UI or team confirms its allowlist. Building against an undocumented private API is too risky for six days.

## 4. Meteora Dynamic Bonding Curve

### Verified facts

- DBC creates a virtual-reserve pool, trades through a configurable bonding curve, and migrates completed pools to DAMM v2. Source: [DBC developer guide](https://docs.meteora.ag/developer-guides/dbc/index.md).
- The DBC program ID is `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` on both mainnet beta and devnet. Pool authority is `FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM`. Source: [DBC developer guide](https://docs.meteora.ag/developer-guides/dbc/index.md), [program repository](https://github.com/MeteoraAg/dynamic-bonding-curve).
- The npm package is `@meteora-ag/dynamic-bonding-curve-sdk`; repository package version observed on 2026-09-19 is `1.5.12`. Source: [SDK README](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk), [package.json](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk/blob/main/packages/dynamic-bonding-curve/package.json).
- Main client areas cover config creation, creator pool creation, swaps, partner and creator fee claims, migration, and state reads. Named methods documented include `createConfig`, `createPool`, `createPoolWithTransferHook`, swap methods, partner and creator fee claim methods, and `migrateToDammV2`. Source: [SDK reference](https://docs.meteora.ag/developer-guides/dbc/typescript-sdk/reference.md), [program instructions](https://docs.meteora.ag/developer-guides/dbc/program/instructions.md).
- Configurable surface includes up to 16 curve points; migration quote threshold; supply percentage at migration; base fee; fee scheduler; optional dynamic fee; optional rate limiter; quote mint; migration option and fee option; token type; activation type; token decimals; leftover handling; locked vesting; creator and partner trading-fee split; migration fee shares; and token authority options. Source: [launch configurations](https://docs.meteora.ag/core-products/dbc/launch-configurations.md), [SDK reference](https://docs.meteora.ag/developer-guides/dbc/typescript-sdk/reference.md).
- Documented bounds include 25 to 9,900 bps base fees, rate-limiter duration up to 43,200 seconds or 108,000 slots, minimum locked liquidity 1,000 bps, and protocol and host fee percentages represented by constants of 20. Source: [SDK reference](https://docs.meteora.ag/developer-guides/dbc/typescript-sdk/reference.md).
- Fee scheduler parameters reduce base fees over time or slots. Dynamic fees respond to volatility. Rate limiter constrains early price movement and is a separate mode with compatibility limits. Source: [fee scheduler](https://docs.meteora.ag/core-products/dbc/fees/fee-scheduler.md), [dynamic fees](https://docs.meteora.ag/core-products/dbc/fees/dynamic-fees.md), [rate limiter](https://docs.meteora.ag/core-products/dbc/fees/rate-limiter.md).
- DBC supports Token-2022 base mints and dedicated transfer-hook pool initialization. Quote mints use a token-badge mechanism. Therefore “any SPL token can be a quote token” is **not verified**. A quote token may need a recognized badge and compatible token program or extension behavior. Source: [Token-2022 support](https://docs.meteora.ag/core-products/dbc/token-2022-support.md), [transfer-hook pools](https://docs.meteora.ag/core-products/dbc/transfer-hook-pools.md), [SDK reference](https://docs.meteora.ag/developer-guides/dbc/typescript-sdk/reference.md).
- DBC runs on devnet and mainnet. The same program ID is documented for both. Source: [DBC developer guide](https://docs.meteora.ag/developer-guides/dbc/index.md).
- Meteora MCP is a documentation MCP server, not a trading server. It provides public-doc search and retrieval plus documentation-feedback tooling. Source: [Meteora MCP](https://docs.meteora.ag/mcp).
- For equity-like assets, the useful controls are a curve anchored to expected valuation ranges, a low-volatility dynamic-fee configuration, a rate limiter for the first minutes, a stock-token quote mint if accepted, and graduation at a liquidity threshold. DBC itself does not enforce equity market hours, corporate actions, NAV, or securities eligibility.

### Resources table

| Name | URL | What it is |
|---|---|---|
| DBC overview | https://docs.meteora.ag/developer-guides/dbc | Developer entry point |
| Curve model | https://docs.meteora.ag/core-products/dbc/universal-curve.md | Curve points and virtual reserves |
| Fees | https://docs.meteora.ag/core-products/dbc/fees/overview.md | Base, dynamic, scheduler, rate limiter |
| Migration | https://docs.meteora.ag/core-products/dbc/migration-and-liquidity.md | Graduation to DAMM |
| SDK | https://github.com/MeteoraAg/dynamic-bonding-curve-sdk | TypeScript monorepo |
| SDK reference | https://docs.meteora.ag/developer-guides/dbc/typescript-sdk/reference.md | Methods, types, constants |
| Program source | https://github.com/MeteoraAg/dynamic-bonding-curve | On-chain source and audit links |
| MCP | https://docs.meteora.ag/mcp | Documentation assistant |

### Build implications

DBC is the strongest sponsor primitive for a six-day build because devnet, source, SDK, and program addresses are public. Use generated config helpers rather than hand-encoding curve math. Test migration and fee claims early. A stock quote token is risky until token-badge and transfer-hook compatibility are proven on the target cluster.

## 5. Pyth Network

### Verified facts

- Pyth Pro is authenticated, configurable first-party market data with real-time and historical delivery. Access starts by creating an account and acquiring an API key. Source: [Pyth Pro](https://docs.pyth.network/price-feeds/pro), [getting started](https://docs.pyth.network/price-feeds/pro/getting-started).
- Published plans are Free at $0 per month with terminal-only, 10-second view access and no API; Starter at $500 per month with API key, crypto coverage, and up to one-second updates; and Pro starting at $2,500 per month with all symbols and up to 1 ms updates. Pyth Indices pricing is custom. Source: [pricing](https://www.pyth.network/pricing).
- Hermes exposes HTTP endpoints including `https://hermes.pyth.network/v2/price_feeds?query=AAPL` for metadata and `/v2/updates/price/latest?ids[]=<feed-id>` for latest binary price updates. Following the August 26, 2026 Pyth Core upgrade, Hermes requires an API key. Source: [Hermes docs](https://docs.pyth.network/price-feeds/core/api-instances-and-providers/hermes), [Hermes live endpoint](https://hermes.pyth.network/v2/price_feeds?query=AAPL).
- Exact Hermes/Core feed IDs from the live endpoint:
  - `Equity.US.AAPL/USD`: `49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688`
  - `Crypto.AAPLX/USD`: `978e6cc68a119ce066aa830017318563a9ed04ec3a0a6439010fc11296a58675`
  - `Crypto.AAPLON/USD`: `e6734de88a83d9d2fb33072adab319004700aefd069653aba30ba9e3cac056f2`
  Source: [Hermes query](https://hermes.pyth.network/v2/price_feeds?query=AAPL).
- The equity feed reports a New York 09:30 to 16:00 weekday schedule and `market_hours.is_open`; AAPLX and AAPLON report always-open schedules. Applications must check publish time and market-hours metadata. The plain equity feed does not become a true live weekend price when Nasdaq is closed. Source: [Hermes query](https://hermes.pyth.network/v2/price_feeds?query=AAPL).
- Pyth uses a pull oracle: fetch an off-chain signed update, include it in a transaction, let the receiver verify it, then read the fresh on-chain price. Source: [pull oracle](https://docs.pyth.network/price-feeds/core/pull-updates), [Solana integration](https://docs.pyth.network/price-feeds/core/use-real-time-data/pull-integration/solana).
- The upgraded Solana receiver program is `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ` on mainnet and devnet. The price-feed program is `pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT` on both. Source: [Solana contract addresses](https://docs.pyth.network/price-feeds/core/contract-addresses/solana).
- Pyth MCP endpoint is `https://mcp.pyth.network/mcp`. Tools include `get_symbols`, `get_latest_price`, `get_historical_price`, `get_candlestick_data`, and `convert_date_to_timestamp`. Symbol discovery and timestamp conversion work without a key; price and candle tools require a Pyth Pro `access_token`. Source: [Pyth MCP](https://docs.pyth.network/price-feeds/pro/mcp).
- Pyth Lazer has been folded into the Pyth Pro documentation and provides low-latency streaming. New builds should follow the current Pyth Pro guide rather than old Lazer examples. Source: [Pyth Lazer redirect](https://docs.pyth.network/lazer), [Pyth Pro](https://docs.pyth.network/price-feeds/pro).
- The complete current xStocks and Ondo feed set is discoverable by querying symbols through Hermes or Pyth Pro. Only AAPLX and AAPLON were individually verified here. A complete static list is **unverified** and would age quickly.

### Resources table

| Name | URL | What it is |
|---|---|---|
| Pyth Pro | https://docs.pyth.network/price-feeds/pro | Current paid data product |
| Pricing | https://www.pyth.network/pricing | Public tiers |
| Hermes | https://hermes.pyth.network | Core price metadata and updates |
| Feed IDs | https://docs.pyth.network/price-feeds/core/price-feeds/price-feed-ids | Core feed directory |
| Solana receiver | https://docs.pyth.network/price-feeds/core/use-real-time-data/pull-integration/solana | Pull-oracle integration |
| MCP | https://mcp.pyth.network/mcp | AI market-data endpoint |

### Build implications

For six days, use Hermes metadata plus one or two verified feeds and display staleness and market-open status. Use devnet receiver integration if a contract consumes a price. Do not assume the hackathon’s Pro trial removes API-key setup. A chart-only integration is weak; use the feed to gate collateral, compare token NAV, or change a launch parameter.

## 6. Solana tokenized-stock landscape

### Verified facts

- xStocks are issued by Backed Assets (JE) Limited and backed 1:1 by underlying securities. On Solana they use Token-2022 with the Scaled UI Amount extension and are freely transferable onchain. Source: [legal overview](https://docs.xstocks.fi/docs/product-legal-overview), [developer docs](https://docs.xstocks.fi/developers), [FAQ](https://docs.xstocks.fi/docs/frequently-asked-questions).
- The canonical dynamic ticker and address source is `GET https://api.backed.fi/api/v2/public/assets`. It returns asset identity, underlying, trading status and hours, plus deployments by network. At the snapshot it included Solana mints such as XRXx `XsensupeZBdHxZtdnLptf1UfWpVyancWcit7qWFYZrJ`. Use the endpoint rather than a copied static address list. Source: [public assets endpoint](https://api.backed.fi/api/v2/public/assets), [API quickstart](https://docs.xstocks.fi/developers/quickstart).
- The xStocks API says public data includes underlying prices, token contract addresses, and multipliers. Client issuance, redemption, registered-wallet, and transaction functions use an API key. Source: [API reference](https://docs.xstocks.fi/apis/openapi).
- xStocks are not offered to US persons. They trade through partners including Kraken, Bybit, Jupiter, and Solana DeFi. Public documentation names Kraken, Bybit, Gate, Bitget, and LBank; Jupiter routes onchain liquidity, while Raydium and Meteora can host pools. Exact current pool locations vary by ticker. Source: [xStocks](https://xstocks.fi/), [xStocks docs](https://docs.xstocks.com/), [FAQ](https://docs.xstocks.fi/docs/frequently-asked-questions).
- Corporate actions are handled through token multipliers and the Token-2022 Scaled UI Amount extension. Cash dividends increase the economic value represented by tokens through the documented mechanism; splits adjust displayed balances or multipliers rather than requiring every integration to invent a split. Source: [dividends and splits](https://docs.xstocks.fi/docs/dividends-and-stock-splits), [multipliers](https://docs.xstocks.fi/developers/multipliers).
- The public assets API exposes `tradingHoursMode`, `currentPeriod`, `openNow`, `nextChangeAt`, halt status, and per-period order limits. Its observed issuance mode was 24/5, while DEX tokens remain technically transferable around the clock. Market close therefore creates price and liquidity risk rather than freezing all onchain transfers. Source: [public assets endpoint](https://api.backed.fi/api/v2/public/assets).
- Ondo Global Markets launched tokenized US stocks and ETFs on Solana. Ondo tokens such as AAPLon are issued through Ondo’s legal and custody structure and have eligibility restrictions. US persons and other restricted jurisdictions are excluded. Source: [Ondo launch](https://ondo.finance/blog/global-markets-live-on-solana), [eligibility](https://docs.ondo.finance/ondo-global-markets/eligibility), [AAPLon](https://app.ondo.finance/assets/aaplon).
- Solana’s institutional landscape also includes Superstate’s Opening Bell for direct registered-share issuance, Remora Markets, and Securitize tokenization. These differ from wrappers that merely track exposure. Source: [Solana tokenized equities report](https://solana.com/reports/tokenized-equities), [Superstate](https://superstate.com/).
- Kamino supports xStocks as collateral and documents a leveraged-long loop: supply xStock, borrow USDC, buy more xStock, and optionally resupply. This introduces liquidation risk. Source: [Kamino guide](https://kamino.com/docs/learn/borrow/long-xstocks), [Kamino market](https://kamino.com/borrow?collateralPreset=xStocks).
- Jupiter Lend documents xStocks borrowing and collateral markets. Source: [Jupiter Lend xStocks](https://docs.jup.ag/user-docs/earn/lend/borrow/xstocks), [Jupiter Lend](https://jup.ag/lend/borrow).
- Phantom surfaces stock trading through integrated providers, but custody, eligibility, and execution can depend on the provider. Current detailed Phantom product terms are **unverified** in this research.
- Drift or another Solana venue’s current stock perpetual contracts, exact market IDs, and oracle configurations are **unverified**.
- Solana Foundation published an “Issuing Tokenized Equities on Solana” report dated March 19, 2026. Source: [Solana report](https://solana.com/reports/tokenized-equities).

### Resources table

| Name | URL | What it is |
|---|---|---|
| xStocks public assets | https://api.backed.fi/api/v2/public/assets | Canonical tickers, mints, trading state |
| xStocks docs | https://docs.xstocks.fi | Legal, issuance, corporate actions, developer docs |
| xStocks API | https://docs.xstocks.fi/apis/openapi | Public and authenticated endpoints |
| Ondo eligibility | https://docs.ondo.finance/ondo-global-markets/eligibility | Holder restrictions |
| Ondo Solana launch | https://ondo.finance/blog/global-markets-live-on-solana | Official launch statement |
| Kamino xStocks | https://kamino.com/docs/learn/borrow/long-xstocks | Collateral and leverage flow |
| Jupiter Lend | https://docs.jup.ag/user-docs/earn/lend/borrow/xstocks | xStocks lending |
| Solana report | https://solana.com/reports/tokenized-equities | Foundation ecosystem report |

### Build implications

Use issuer APIs as the source of truth for mints, multipliers, market hours, and halts. A six-day portfolio or risk product can combine those fields with Pyth and Jupiter. Lending or derivatives are higher risk because stale off-hours prices, liquidations, corporate actions, transfer extensions, and restricted-user access all need explicit handling.

## 7. Fast build enablers

### Verified facts

- Jupiter’s current Swap API is `https://api.jup.ag/swap/v2`. It offers meta-aggregator `/order` plus `/execute`, and router `/build` for custom transactions. Ultra V1 is deprecated and superseded by Swap V2. Source: [Swap API](https://developers.jup.ag/docs/swap), [order and execute](https://developers.jup.ag/docs/swap/order-and-execute).
- Solana Actions are specification-compliant HTTP endpoints that return transactions or messages, and Blinks render Actions as shareable interfaces. They are useful for a one-click basket, deposit, or stock swap, but wallet and domain trust checks still apply. Source: [Solana Actions docs](https://solana.com/docs/advanced/actions).
- Helius provides standard and enhanced RPC, parsed transaction history, webhooks, LaserStream gRPC, DAS, and transaction landing. Triton is another production Solana RPC and Yellowstone gRPC provider. Provider keys and quotas are required for production. Source: [Helius docs](https://www.helius.dev/docs/), [Helius RPC](https://www.helius.dev/docs/rpc/overview), [Triton](https://docs.triton.one/).
- Kamino publishes TypeScript SDKs and protocol documentation. For six days, using existing lending markets is safer than deploying a custom lending program. Source: [Kamino docs](https://kamino.com/docs/), [Kamino SDK GitHub](https://github.com/Kamino-Finance/klend-sdk).
- Squads provides Solana multisig and smart-account infrastructure suitable for treasury and issuer controls. Source: [Squads docs](https://docs.squads.so/).
- Privy offers embedded Solana wallets. The Solana wallet-adapter packages remain the standard self-custody connector path for browser wallets. Source: [Privy Solana docs](https://docs.privy.io/guide/react/wallets/solana), [wallet adapter](https://github.com/anza-xyz/wallet-adapter).
- Token-2022 transfer hooks call a configured external program during every transfer with extra accounts resolved from a well-defined PDA. Integrators must append those accounts and cannot treat every stock token exactly like a legacy SPL mint. Source: [Token-2022 extensions](https://www.solana-program.com/docs/token-2022/extensions#transfer-hook).
- xStocks use Token-2022 Scaled UI Amount. That extension affects displayed balances and corporate-action multipliers even when no transfer hook is present. A product must use extension-aware libraries and raw integer amounts for accounting. Source: [xStocks developer docs](https://docs.xstocks.fi/developers), [Token-2022 extensions](https://www.solana-program.com/docs/token-2022/extensions).

### Resources table

| Name | URL | What it is |
|---|---|---|
| Jupiter Swap V2 | https://developers.jup.ag/docs/swap | Current swap integration |
| Solana Actions | https://solana.com/docs/advanced/actions | Shareable transaction API |
| Helius | https://www.helius.dev/docs/ | RPC, webhooks, streams, landing |
| Triton | https://docs.triton.one/ | RPC and Yellowstone |
| Kamino SDK | https://github.com/Kamino-Finance/klend-sdk | Lending client |
| Squads | https://docs.squads.so/ | Multisig and smart accounts |
| Privy | https://docs.privy.io/guide/react/wallets/solana | Embedded wallets |
| Wallet Adapter | https://github.com/anza-xyz/wallet-adapter | Browser wallet connectors |
| Token-2022 | https://www.solana-program.com/docs/token-2022/extensions | Extension behavior |

### Build implications

The fastest credible stack is wallet adapter or Privy, Jupiter Swap V2, one managed RPC, issuer metadata APIs, and Pyth. Add an Action only after the in-app flow works. Avoid custom custody and custom lending. Decode Token-2022 extensions before showing balances or constructing transfers.

## Could not verify

- PreStocks’ operating legal entity, named management, token program type, transfer restrictions, fee percentages, direct DEX pool addresses, SDK, API SLA, rate limits, and devnet.
- Whether every PreStocks FAQ accordion answer is server-rendered. Some fetched headings lacked expanded answer text.
- Tessera’s exact current fee percentages, devnet, SDK, API SLA, DEX pool list, and Stonkfun contracts or docs.
- Clawpump’s stock quote-token allowlist, general fee schedule, launch API, SDK, program IDs, and devnet.
- Whether an arbitrary SPL or Token-2022 mint can become a DBC quote token without a badge or partner action.
- A complete static list of all xStocks and Ondo Pyth feeds. Use symbol discovery because the set changes.
- A compact complete xStocks mint table. The official assets response exceeded the web fetch paging cap, so the canonical endpoint is cited instead of copying an incomplete list.
- Current Phantom provider terms and current Drift or other stock-perpetual market IDs.
- Exact Raydium and Meteora pool addresses for every xStock, PreStock, Tessera token, and Ondo token.
- Any claim that tokenized stocks are legally available to US persons. Official issuer materials generally exclude them.