# Clearbook statement verifier

This command verifies that a Clearbook API response still matches its SHA-256 statement hash. It can also read a Solana memo transaction and confirm its memo, signer, slot and block time. A matching memo proves that the signer recorded the statement hash on chain. It only establishes account ownership when the statement address signed the transaction.

## Build

Rust stable is required.

```sh
cargo build --manifest-path verifier/Cargo.toml --release
```

The binary is written to `verifier/target/release/clearbook-verify`.

## Usage

Save an API response and verify it offline:

```sh
curl http://localhost:8080/api/statements/STATEMENT_ID > statement.json
verifier/target/release/clearbook-verify --file statement.json --offline
```

Fetch a statement from the API and verify its proof:

```sh
verifier/target/release/clearbook-verify \
  --api http://localhost:8080/api \
  --id STATEMENT_ID
```

Use `--signature SIGNATURE` to check a specific transaction. Use `--rpc URL` to select another Solana JSON RPC endpoint. Use `--json` for structured output.

The verifier removes `id`, `hash`, `proof`, `ownedByViewer`, `csvUrl` and `pdfUrl` before hashing. It sorts object keys recursively and keeps array order. It uses compact JavaScript JSON number and string formatting.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Every available check passed |
| 1 | The statement hash or transaction memo did not match |
| 2 | Input, API or network processing failed |