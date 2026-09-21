# Clearbook wallet indexer

This command rebuilds the tokenized stock history of a wallet straight from a Solana RPC endpoint. It shares no code with the application. The result is a history document whose events use the same shape as the application ledger, so the Python replay in `audit/` can compare an independent reading of the chain with what the application reports.

## Build

Rust stable is required.

```sh
cargo build --manifest-path indexer/Cargo.toml --release
```

The binary is written to `indexer/target/release/clearbook-index`.

## Usage

```sh
indexer/target/release/clearbook-index <address> --out history.json
```

Options:

| Option | Meaning |
| --- | --- |
| `--rpc <url>` | JSON RPC endpoint. Defaults to the public mainnet endpoint. |
| `--out <path>` | Write the document to a file instead of standard output. |
| `--limit <n>` | Stop reading an address after this many signatures. The document is then marked incomplete. |
| `--owner-history` | Read the wallet's own signature history even when it is long. |
| `--registry <path>` | Asset registry JSON. Defaults to the copy embedded at build time. |

Progress is printed on standard error. The public endpoint counts calls of one method per ten second window and shares that window between everyone behind the same address, so a wallet with a few dozen transactions takes one to two minutes there. A dedicated endpoint reads larger batches without pauses.

## What it reads

1. Token accounts of the wallet under both token programs, kept when the mint is in the asset registry.
2. Signatures for every stock token account, paginated until the history ends or the limit is reached.
3. The wallet's own signatures when there are fewer than one hundred. A busy wallet has thousands of unrelated transactions, so its own history is skipped unless `--owner-history` is set. This is the same rule the application applies. The wallet's own history is what finds stock accounts that were closed since.
4. Every transaction, in batches. Rows the endpoint rate limits are retried with a growing pause. A transaction that still cannot be read is listed in the notes and marks the document incomplete.
5. The Token-2022 scaled UI amount multiplier of every mint involved. A mint that cannot be read gets no entry and a note.

`complete` is true when every signature in scope was listed and every listed transaction was read. `ownerHistoryRead` says whether the wallet's own history was in scope. A document can be complete for the current token accounts while stock held in a closed account is missing. The replay prints a notice in that case.

## Classification

The rules mirror the application indexer. Token deltas are taken per owner from the pre and post token balances of a transaction. Failed transactions are dropped. A stock delta paired with an opposite delta in a dollar stablecoin from the registry is a buy or a sell at one dollar per cash unit. A stock delta paired with SOL is a buy or a sell settled in SOL with no dollar value. A stock delta paired with another stock is a wrapper swap. A stock delta with no counter leg is a transfer. Anything else is unknown and noted. Transactions that involve a Jupiter program carry the venue.

Balances are reconciled after classification. When the indexed flows of a mint do not sum to the raw balance held today, an opening or closing event covers the gap, again as the application does. A gap in a complete history is also reported in the notes, because it points at a closed token account or a rule difference.

## The document

```json
{
  "version": 1,
  "wallet": "...",
  "generatedAt": "2026-09-21T06:10:00Z",
  "rpc": "https://api.mainnet-beta.solana.com",
  "complete": true,
  "ownerHistoryRead": false,
  "notes": [],
  "accounts": [{ "address": "...", "mint": "...", "symbol": "TSLAx", "rawBalance": "710062260", "decimals": 8, "signaturesRead": 14, "complete": true }],
  "multipliers": { "<mint>": { "multiplier": "1.0176", "pendingMultiplier": null, "pendingEffectiveAt": null, "decimals": 8 } },
  "events": [{ "id": "<wallet>:<signature>:<mint>", "kind": "buy", "rawDelta": "389235014", "grossUsd": 583.41, "counterAsset": "USDC", "counterAmount": 583.41 }]
}
```

Event ids follow the application convention, so an event produced here can be matched with the same event in the application.

## Comparing with the application

```sh
python3 audit/audit.py --events history.json --api http://localhost:8080/api --wallet <address>
```

The replay first lists events that only one side knows or that the two sides classify differently. It then replays the document events with the document multipliers and compares the resulting lots with the lots and tax lot exports the API returns for the same wallet. Exit code 0 means every event and every lot matched.

## Tests

```sh
cargo test --manifest-path indexer/Cargo.toml
```

The tests run recorded transaction fixtures through the classifier and cover each event kind, event ids, the SOL fee rule and pagination.
