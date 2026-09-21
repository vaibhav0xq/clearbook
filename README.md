# Clearbook

Brokerage statements for tokenized stocks on Solana.

Paste a wallet or connect one. Clearbook reads its xStocks, Ondo Global Markets and PreStocks balances, rebuilds the tax lots from on-chain history, marks every position against a reference price, reads dividends and splits from the Token-2022 multiplier and produces a statement that exports to CSV and PDF and can be notarized on chain.

Built for the Stocklana hackathon. Main track, Pyth bounty and PreStocks bounty.

## What it does

- Positions per issuer with quantity, raw token units, multiplier, mark, market value and weight
- Tax lots with FIFO by default and LIFO or HIFO on a toggle, long or short term flag per lot
- Realized and unrealized P/L, year to date realized P/L and fees paid in the cash asset
- Mark to market with a source label per position, premium or discount to the reference price and the session state of the underlying market
- Corporate actions read from the token itself: multiplier increases on Ondo and xStocks mints are recorded as income or split events and labeled best effort
- Statements for any period with a SHA-256 hash, opening and closing value, holdings, activity, closed lots, corporate actions and written assumptions
- CSV and PDF export
- Tax lot export per tax year in the Form 1099-B column layout, with estimated and unknown basis labeled and a wash sale check on losses
- Notarization: a memo transaction that writes the statement hash to Solana signed by the visitor's wallet or a clearly labeled simulated proof when no wallet is connected
- One sell action through Jupiter that relieves lots and updates the ledger, with a simulated path that does the same bookkeeping without a transaction
- Three demo ledgers so the product can be reviewed without holding any tokenized stock

Unknown or estimated figures are always shown as such. Transfers with no known cost are excluded from the totals and listed in the statement assumptions.

## Repository layout

```
artifacts/clearbook      React and Vite frontend
artifacts/api-server     Express API: indexer, pricing, ledger, statements, trades
lib/ledger               Accounting engine: lots, relief methods, multipliers, statement maths, demo scenarios, asset registry
lib/api-spec             OpenAPI contract (source of truth for the API)
lib/api-client-react     Generated React Query hooks
lib/api-zod              Generated Zod schemas used by the server for validation
lib/db                   Drizzle schema for PostgreSQL and the SQL migrations generated from it
indexer/                 Rust command that builds wallet history from Solana
verifier/                Rust command that recomputes a statement hash and checks the memo transaction
audit/                   Python replay of the ledger that cross checks lots against the API
docs/                    Demo script, status notes and research
```

The API contract lives in `lib/api-spec/openapi.yaml`. After a change run `pnpm --filter @workspace/api-spec run codegen`.

## Running it

Requirements: Node 22.12 or later, pnpm 10, PostgreSQL.

```
pnpm install
cp .env.example .env            # fill in DATABASE_URL, add keys if you have them
pnpm --filter @workspace/db run migrate   # applies lib/db/migrations to a fresh database

# terminal 1: API
PORT=8080 pnpm --filter @workspace/api-server run dev

# terminal 2: web
PORT=5173 BASE_PATH=/ API_PROXY_TARGET=http://localhost:8080 pnpm --filter @workspace/clearbook run dev
```

Open http://localhost:5173. When both services run behind one origin that routes `/api` to the API server, `API_PROXY_TARGET` is not needed.

During development `pnpm --filter @workspace/db run push` syncs the schema directly. After a schema change run `pnpm --filter @workspace/db run generate <name>` to add a migration under `lib/db/migrations`.

Checks:

```
pnpm run typecheck                          # every package
pnpm --filter @workspace/ledger run test    # accounting engine tests
python3 -m unittest discover -s audit       # replay engine tests
cargo test --manifest-path indexer/Cargo.toml
cargo test --manifest-path verifier/Cargo.toml
```

## Deploying

The web app is a static build and the API is a long running Node process, so they deploy separately.

1. Database. Create a PostgreSQL database (Neon works on the free tier) and apply the schema once: `DATABASE_URL=postgres://... pnpm --filter @workspace/db run migrate`.
2. API. The `Dockerfile` at the repository root builds the API server. Point Railway, Render or Fly at the repository and set `DATABASE_URL`, `APP_URL` (the public web address) and any RPC or price keys from the table below. The container listens on `PORT`. Indexing runs keep their state in process memory, so run one instance.
3. Web. Import the repository into Vercel. `vercel.json` carries the install command, the build command and the output directory and Vercel reads the pnpm version from the `packageManager` field, so the project needs no settings. Replace `https://api.clearbook.example` in `vercel.json` with the API address. Vercel then forwards `/api/*` to the API and the browser never talks to a second origin.

After the first deploy open `/api/config` on the API address. It lists which data sources are live and which are running as labelled fallbacks.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `SOLANA_RPC_URL` | no | Server side RPC for indexing. Falls back to the public mainnet endpoint |
| `HELIUS_API_KEY` | no | Builds a Helius RPC URL when `SOLANA_RPC_URL` is not set |
| `VITE_SOLANA_RPC_URL` | no | RPC the browser uses to broadcast a signed transaction when the wallet cannot send it |
| `PYTH_API_KEY` | no | Pyth Pro access token for equity reference prices |
| `PYTH_LAZER_URL` | no | Alternative Pyth Pro base URL |
| `APP_URL` | no | Public URL printed in statements |
| `SOLANA_CLUSTER` | no | Cluster label, default `mainnet-beta` |
| `INDEXER_MAX_SIGNATURES` | no | Signatures read per wallet, default 400 |
| `API_PROXY_TARGET` | no | Local development only, forwards `/api` from Vite to the API |
| `LOG_LEVEL` | no | API log level |

All three processes read `.env` from the repository root. Values already present in the environment take precedence. No key is ever sent to the browser. `GET /api/config` reports which sources are live so the UI can label fallbacks.

## Demo ledgers

| Id | What it shows |
| --- | --- |
| `demo-holder` | Long term holder of xStocks and Ondo positions with multiplier income and one transfer with unknown basis |
| `demo-trader` | Twelve months of buys and sells across xStocks, Ondo and PreStocks with realized gains and losses, a wrapper swap and pre IPO exposure |
| `demo-empty` | Wallet with no tokenized stock history |

Demo ledgers are scripted but priced with the same live pricing pipeline as real wallets. Simulated sales and generated statements are private to the browser that made them: the client sends a random id in the `x-clearbook-viewer` header and the server filters by it. `POST /api/wallets/{id}/reset` clears that browser's simulated sales.

## How the numbers are built

- Quantities are kept as raw token units. Shares of exposure are raw units divided by decimals and multiplied by the current Token-2022 multiplier, so a multiplier increase grows the shares in a lot without changing its cost.
- Buys, sells, transfers in and out, wrapper swaps and opening balances are ledger events. Each event carries the counter asset, the fee and the reference price when one is known.
- Lots are opened by buys and transfers and relieved by sells in the chosen order. Realized P/L is proceeds net of fees minus the cost of the relieved lots.
- Marks come from the first available source in this order: Pyth Pro, Jupiter, PreStocks, demo snapshot. Every position shows its source and the age of the price.
- Statement hashes cover the statement body without its id. A notarized statement stores the memo transaction signature and the confirmed slot.

The methodology page in the app describes the same rules for end users.

## Independent verification

Two commands outside the application rebuild its results from public data. The Python replay ties them together.

- `indexer/` reads the tokenized stock history of a wallet straight from a Solana RPC endpoint and writes a history document in the ledger event shape. It shares no code with the application.
- `verifier/` recomputes a statement hash from an API response and checks the memo transaction that notarized it.
- `audit/` replays either the application's own activity or an indexer document through an independent lot engine and compares the lots with the API.

```
cargo build --manifest-path indexer/Cargo.toml --release
indexer/target/release/clearbook-index <address> --out history.json
python3 audit/audit.py --events history.json --api http://localhost:8080/api --wallet <address>
cargo run --manifest-path verifier/Cargo.toml -- --api http://localhost:8080/api --id <statement-id>
```

Each directory has a README with the details.

## Status

See `docs/status.md` for what is live, what is simulated and what still needs work before this is more than a hackathon build. The short version: indexing, pricing through Jupiter and PreStocks, multiplier reads, statements, exports and simulated flows are live today. Pyth Pro and Helius are wired and switch on when their keys are present. Wallet signed notarization and Jupiter execution are implemented but have only been exercised with the simulated path in this environment.

## Demo

`docs/demo-script.md` walks through a three minute demo.

## License

MIT. See `LICENSE`.
