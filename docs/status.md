# Status: live, simulated and still needed

Last updated 19 September 2026.

## Live today

| Area | What runs | Notes |
| --- | --- | --- |
| Wallet indexing | Token account discovery, signature scan per stock token account, parsed transaction classification into buys, sells, transfers and wrapper swaps | Public RPC by default. 90 second budget and 400 signature cap per run, then the ledger is marked partial with explicit warnings. Verified against mainnet wallets holding xStocks and Ondo tokens |
| Asset registry | 934 tokenized stock mints: 828 xStocks, 98 Ondo Global Markets, 8 PreStocks, with issuer, underlying and decimals | Generated from issuer lists into `lib/ledger/src/registry/assets.json` |
| Multipliers | Token-2022 scaled UI amount extension read from each mint, current and pending multiplier, observations stored so later increases become income events | Live for Ondo and xStocks mints that use the extension |
| Pricing | Jupiter price API and PreStocks API, session state of the underlying market, premium or discount against the reference | Pyth Pro is the first choice when `PYTH_API_KEY` is set and drops out with a labelled status when it is not |
| Accounting | Lots, FIFO, LIFO, HIFO, realized and unrealized P/L, income estimate from multiplier growth, holding period | 14 unit tests in `lib/ledger/test` |
| Statements | Period statements with SHA-256 hash, CSV and PDF export, assumptions and data sources printed in the document | |
| Notarization | Memo transaction built server side for the connected wallet to sign, signature verified against the chain after submission | Only the simulated path has been exercised in this environment because no browser wallet is installed here |
| Trade | Jupiter quote for a sale, ledger preview of relieved lots and realized P/L, swap transaction built for the connected wallet, confirmation checked on chain | Same caveat as notarization. The simulated sale updates the ledger without a transaction |
| Demo mode | Three scripted ledgers priced through the live pipeline | |

## Simulated or best effort

- Simulated proofs and simulated sales are stored with a `simulated` label everywhere they appear, including exports.
- Historical multiplier at the time of a live event is not reconstructed. Income from multiplier increases is computed from observed multiplier changes since the wallet was first indexed, so a wallet indexed today shows no historical income until the next increase.
- Prices at the time of a historical buy or sell come from the counter asset in the transaction when it was a swap. Transfers in with no counter asset have unknown basis and are excluded from totals.
- Dividend cash paid outside the multiplier mechanism is not detected.
- The Pyth Pro response parser follows the published Lazer REST shape but has not been run against a real key.
- Statement opening and closing values use the mark available at generation time, not the historical close. The statement says so in its assumptions. Period activity, closed lots and realized gains are historical.
- Money is computed in double precision floats and rounded at presentation. Fine for a statement, not for a general ledger.

## Still needed

1. A paid RPC for the demo. The public endpoint rate limits token account and signature reads and turns a 20 second index into 90 seconds with gaps.
2. A Pyth Pro key to make the Pyth path the primary mark and to show confidence intervals.
3. A live wallet test of notarization and the Jupiter sale in a browser with Phantom or Solflare.
4. Historical multiplier reconstruction from mint account history so income is complete for wallets indexed after an increase.
5. Owner level history beyond the current token accounts, so stocks held in closed accounts appear in realized P/L.
6. Tax lot export in a broker style 1099-B layout.
7. A background indexing queue. Indexing currently runs inside the request that triggers it.
8. Viewer scoped simulations. Simulated sales and proofs are stored per wallet address and are visible to anyone who opens that address. They are always labelled and can be reset, but a public deployment should key them to a signed session.
9. Historical marks for statement boundaries, so opening and closing values reflect the close of the period rather than the mark at generation time.

## Environment specific findings

- Mainnet transactions are version 0 and legacy, so `maxSupportedTransactionVersion` must be set when fetching parsed transactions or the RPC rejects the call.
- `getTokenLargestAccounts` is rate limited separately on the public endpoint and is not used.
- Recent activity on popular xStocks and Ondo mints is dominated by arbitrage bots with hundreds of net zero transactions. Their ledgers index correctly but produce few events.
