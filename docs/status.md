# Status: live, simulated and still needed

Last updated 20 September 2026.

## Live today

| Area | What runs | Notes |
| --- | --- | --- |
| Wallet indexing | Token account discovery, signature scan per stock token account, parsed transaction classification into buys, sells, transfers and wrapper swaps. Runs in the background: opening a wallet starts the run and returns at once, the status endpoint reports signatures read and events found while it runs and the pages fill in when it finishes | Public RPC by default. 150 second budget there, 120 seconds on a dedicated endpoint, and a 400 signature cap per run, then the ledger is marked partial with explicit warnings. A dedicated endpoint is paced per row at a configurable rate, 5 per second by default, which is what the Helius free plan sustains. Rate limited rows inside a batch are retried and counted when they still fail. One run per wallet at a time, locked in the database, so any server instance can answer the status polls and a run that lost its process is started again after 90 seconds without progress. Verified against mainnet wallets holding xStocks and Ondo tokens |
| Asset registry | 934 tokenized stock mints: 828 xStocks, 98 Ondo Global Markets, 8 PreStocks, with issuer, underlying and decimals | Generated from issuer lists into `lib/ledger/src/registry/assets.json` |
| Multipliers | Token-2022 scaled UI amount extension read from each mint, current and pending multiplier, observations stored so later increases become income events | Live for Ondo and xStocks mints that use the extension |
| Pricing | Jupiter price API and PreStocks API, session state of the underlying market, premium or discount against the reference | Pyth Pro is the first choice when `PYTH_API_KEY` is set and drops out with a labeled status when it is not |
| Accounting | Lots, FIFO, LIFO, HIFO, realized and unrealized P/L, income estimate from multiplier growth, holding period. Long term means sold after the calendar anniversary of the acquisition, so a leap year does not turn a one year hold into a long term one | 26 unit tests in `lib/ledger/test` |
| Statements | Period statements with SHA-256 hash, CSV and PDF export, assumptions and data sources printed in the document | |
| Tax lot export | Realized gains by UTC tax year on the Tax lots page and a CSV per year in the Form 1099-B column layout: one row per lot relieved with description, dates, proceeds, basis, gain and term. Rows with an estimated or unknown basis and rows from simulated sales are labeled. Losses with a buy of the same stock within 30 days on either side, in any wrapper, carry a wash sale flag | The flag is a check for the holder to review. No basis is adjusted and nothing is filed. Refused with 409 while a wallet is indexing, like statements |
| Notarization | Memo transaction built server side for the connected wallet to sign, signature verified against the chain after submission | Only the simulated path has been exercised in this environment because no browser wallet is installed here |
| Trade | Jupiter quote for a sale, ledger preview of relieved lots and realized P/L, swap transaction built for the connected wallet, confirmation checked on chain | Same caveat as notarization. The simulated sale updates the ledger without a transaction |
| Demo mode | Three scripted ledgers priced through the live pipeline | |
| Independent checks | A Rust indexer that rebuilds wallet history from RPC without application code, a Python replay that compares its events and lots with the API and a Rust verifier for statement hashes and memo transactions | Run against a mainnet wallet with 42 transactions: every event id, kind and lot matched under FIFO, LIFO and HIFO |

## Simulated or best effort

- Simulated proofs and simulated sales are stored with a `simulated` label everywhere they appear, including exports.
- Simulated sales and generated statements are private to the browser that made them. The browser keeps a random id in local storage and sends it with every request; the server stores it with the event or statement and filters reads by it. Two people opening the same wallet address see the same chain data and their own simulations. The id names a browser, not a person, so clearing site data starts a fresh view. A public deployment could replace it with a signed wallet session without changing the data model.
- Historical multiplier at the time of a live event is not reconstructed. Income from multiplier increases is computed from observed multiplier changes since the wallet was first indexed, so a wallet indexed today shows no historical income until the next increase.
- Prices at the time of a historical buy or sell come from the counter asset in the transaction when it was a swap. Transfers in with no counter asset have unknown basis and are excluded from totals.
- Dividend cash paid outside the multiplier mechanism is not detected.
- The Pyth Pro response parser follows the published Lazer REST shape but has not been run against a real key.
- Statement opening and closing values use the mark available at generation time, not the historical close. The statement says so in its assumptions. Period activity, closed lots and realized gains are historical.
- Money is computed in double precision floats and rounded at presentation. Fine for a statement, not for a general ledger.

## Still needed

1. A paid RPC for the demo. The public endpoint rate limits every read and turns a 20 second index into two minutes or more, with gaps on busy wallets.
2. A Pyth Pro key to make the Pyth path the primary mark and to show confidence intervals.
3. A live wallet test of notarization and the Jupiter sale in a browser with Phantom or Solflare.
4. Historical multiplier reconstruction from mint account history so income is complete for wallets indexed after an increase.
5. Owner level history beyond the current token accounts, so stocks held in closed accounts appear in realized P/L.
6. Historical marks for statement boundaries, so opening and closing values reflect the close of the period rather than the mark at generation time.

## Environment specific findings

- Mainnet transactions are version 0 and legacy, so `maxSupportedTransactionVersion` must be set when fetching parsed transactions or the RPC rejects the call.
- `getTokenLargestAccounts` is rate limited separately on the public endpoint and is not used.
- Recent activity on popular xStocks and Ondo mints is dominated by arbitrage bots with hundreds of net zero transactions. Their ledgers index correctly but produce few events.
