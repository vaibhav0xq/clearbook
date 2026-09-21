use clap::Parser;
use clearbook_indexer::{
    classify, collect_address_signatures, load_registry, now_iso, Account, Asset, Event, History,
    Multiplier, Rpc, SignatureInfo, Transport, TOKEN_2022_PROGRAM, TOKEN_PROGRAM,
};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::process::ExitCode;
use std::thread;
use std::time::Duration;

const EMBEDDED_REGISTRY: &str = include_str!("../../lib/ledger/src/registry/assets.json");

#[derive(Parser)]
#[command(
    name = "clearbook-index",
    version,
    about = "Index a Clearbook wallet from Solana"
)]
struct Cli {
    /// Wallet address to index
    wallet: String,
    /// Solana JSON RPC endpoint
    #[arg(long, default_value = "https://api.mainnet-beta.solana.com")]
    rpc: String,
    /// Write the history document to this file instead of standard output
    #[arg(long)]
    out: Option<String>,
    /// Stop reading an address after this many signatures
    #[arg(long)]
    limit: Option<usize>,
    /// Read the wallet's own signature history even when it is long
    #[arg(long)]
    owner_history: bool,
    /// Asset registry JSON, defaults to the embedded copy
    #[arg(long)]
    registry: Option<String>,
}

/// The wallet's own history covers transactions it signed, which finds stock accounts that were
/// closed since. The application only reads it when it is short, because a busy wallet has
/// thousands of unrelated transactions. The same rule applies here unless --owner-history is set.
const OWNER_HISTORY_PAGE: usize = 100;

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), String> {
    let cli = Cli::parse();
    let registry_text = match &cli.registry {
        Some(path) => {
            fs::read_to_string(path).map_err(|e| format!("Registry could not be read: {e}"))?
        }
        None => EMBEDDED_REGISTRY.to_string(),
    };
    let registry = load_registry(&registry_text)?;
    let assets: HashMap<String, Asset> = registry
        .assets
        .into_iter()
        .map(|a| (a.mint.clone(), a))
        .collect();
    let rpc = Rpc::new(cli.rpc.clone());
    let mut accounts = discover_accounts(&rpc, &cli.wallet, &assets)?;
    let mut all_signatures: HashMap<String, SignatureInfo> = HashMap::new();
    let mut complete = true;
    let mut notes = Vec::new();
    eprintln!(
        "{} tokenized stock account{} found",
        accounts.len(),
        if accounts.len() == 1 { "" } else { "s" }
    );
    let owner_page = if cli.owner_history {
        collect_address_signatures(&rpc, &cli.wallet, cli.limit)?
    } else {
        collect_address_signatures(&rpc, &cli.wallet, Some(OWNER_HISTORY_PAGE))?
    };
    let owner_history_read = owner_page.complete || cli.owner_history;
    if owner_history_read {
        if !owner_page.complete {
            complete = false;
            notes.push("The wallet's own signature history was cut by the limit.".to_string());
        }
        eprintln!(
            "{} signatures in the wallet's own history",
            owner_page.signatures.len()
        );
        for signature in owner_page
            .signatures
            .into_iter()
            .filter(|s| s.err.is_none())
        {
            all_signatures.insert(signature.signature.clone(), signature);
        }
    } else {
        notes.push("Only transactions touching the current tokenized stock accounts were read. Stocks held in closed token accounts are not included. Pass --owner-history to read the wallet's own history as well.".to_string());
    }
    for account in accounts.iter_mut() {
        let page = collect_address_signatures(&rpc, &account.address, cli.limit)?;
        if !page.complete {
            complete = false;
            notes.push(format!(
                "Signature history for {} was cut by the limit.",
                account.address
            ));
        }
        account.signatures_read = page.signatures.len();
        account.complete = page.complete;
        eprintln!(
            "{} signatures for the {} account",
            page.signatures.len(),
            account.symbol
        );
        for signature in page.signatures.into_iter().filter(|s| s.err.is_none()) {
            all_signatures.insert(signature.signature.clone(), signature);
        }
    }
    let mut signatures: Vec<_> = all_signatures.into_values().collect();
    signatures.sort_by_key(|s| (s.block_time.unwrap_or(0), s.slot));
    eprintln!("{} transactions to read", signatures.len());
    let mut events = Vec::new();
    let batch_size = if rpc.is_public() { 10 } else { 25 };
    let pause = Duration::from_millis(if rpc.is_public() { 3_200 } else { 200 });
    let mut read = 0usize;
    for chunk in signatures.chunks(batch_size) {
        let rows = read_transactions(&rpc, chunk, &mut notes);
        read += chunk.len();
        if read % 50 == 0 || read == signatures.len() {
            eprintln!("{read} of {} transactions read", signatures.len());
        }
        for (signature, tx) in chunk.iter().zip(rows) {
            let Some(tx) = tx else {
                complete = false;
                continue;
            };
            if tx.get("meta").is_none_or(Value::is_null) {
                complete = false;
                notes.push(format!(
                    "Transaction {} has no metadata, so its balances cannot be read.",
                    signature.signature
                ));
                continue;
            }
            let (mut found, unknown) = classify(signature, &tx, &cli.wallet, &assets);
            if unknown {
                notes.push(format!(
                    "Transaction {} has an unknown stock flow.",
                    signature.signature
                ));
            }
            events.append(&mut found);
        }
        if read < signatures.len() {
            thread::sleep(pause);
        }
    }
    events.sort_by(|a, b| (&a.block_time, a.slot).cmp(&(&b.block_time, b.slot)));
    reconcile(
        &cli.wallet,
        &accounts,
        &assets,
        &mut events,
        complete,
        &mut notes,
    );
    let mints: HashSet<String> = accounts
        .iter()
        .map(|a| a.mint.clone())
        .chain(events.iter().map(|e| e.mint.clone()))
        .collect();
    let multipliers = read_multipliers(&rpc, &mints, &assets, &mut notes);
    let document = History {
        version: 1,
        wallet: cli.wallet,
        generated_at: now_iso(),
        rpc: cli.rpc,
        complete,
        owner_history_read,
        notes,
        accounts,
        multipliers,
        events,
    };
    let output = serde_json::to_string_pretty(&document)
        .map_err(|e| format!("History could not be encoded: {e}"))?;
    if let Some(path) = cli.out {
        fs::write(path, format!("{output}\n"))
            .map_err(|e| format!("History could not be written: {e}"))?;
    } else {
        println!("{output}");
    }
    Ok(())
}

/// Reads one batch of transactions. Rows the endpoint rate limited are retried with a growing
/// pause. Rows that still fail are reported by signature and leave the history incomplete.
fn read_transactions<T: Transport>(
    rpc: &T,
    chunk: &[SignatureInfo],
    notes: &mut Vec<String>,
) -> Vec<Option<Value>> {
    let params = |list: &[&SignatureInfo]| -> Vec<Value> {
        list.iter()
            .map(|s| {
                json!([s.signature, {
                    "encoding": "jsonParsed",
                    "maxSupportedTransactionVersion": 1,
                    "commitment": "confirmed"
                }])
            })
            .collect()
    };
    let mut rows: Vec<Option<Value>> = vec![None; chunk.len()];
    let mut errors: Vec<Option<String>> = vec![None; chunk.len()];
    let mut pending: Vec<usize> = (0..chunk.len()).collect();
    for attempt in 1..=5 {
        if pending.is_empty() {
            break;
        }
        if attempt > 1 {
            // A rate limited row clears when the ten second window of the public endpoint has passed.
            thread::sleep(if rpc.is_public() {
                Duration::from_secs(10)
            } else {
                Duration::from_millis(2_000 * attempt as u64)
            });
        }
        let wanted: Vec<&SignatureInfo> = pending.iter().map(|index| &chunk[*index]).collect();
        let answers = match rpc.batch("getTransaction", params(&wanted)) {
            Ok(answers) => answers,
            Err(error) => {
                for index in &pending {
                    errors[*index] = Some(error.clone());
                }
                continue;
            }
        };
        let mut still = Vec::new();
        for (index, answer) in pending.iter().zip(answers) {
            if answer.rate_limited {
                errors[*index] = answer.error;
                still.push(*index);
            } else {
                rows[*index] = answer.result;
                errors[*index] = answer.error;
            }
        }
        pending = still;
    }
    for (index, row) in rows.iter().enumerate() {
        if row.is_none() {
            notes.push(format!(
                "Transaction {} could not be read: {}",
                chunk[index].signature,
                errors[index]
                    .as_deref()
                    .unwrap_or("the endpoint returned no transaction")
            ));
        }
    }
    rows
}

fn discover_accounts<T: Transport>(
    rpc: &T,
    owner: &str,
    assets: &HashMap<String, Asset>,
) -> Result<Vec<Account>, String> {
    let mut out = Vec::new();
    for program in [TOKEN_2022_PROGRAM, TOKEN_PROGRAM] {
        let result = rpc.call(
            "getTokenAccountsByOwner",
            json!([
                owner, {"programId":program}, {"encoding":"jsonParsed","commitment":"confirmed"}
            ]),
        )?;
        for row in result
            .get("value")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let Some(mint) = row
                .pointer("/account/data/parsed/info/mint")
                .and_then(Value::as_str)
            else {
                continue;
            };
            let Some(asset) = assets.get(mint) else {
                continue;
            };
            out.push(Account {
                address: row
                    .get("pubkey")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                mint: mint.to_string(),
                symbol: asset.symbol.clone(),
                token_program: program.to_string(),
                raw_balance: row
                    .pointer("/account/data/parsed/info/tokenAmount/amount")
                    .and_then(Value::as_str)
                    .unwrap_or("0")
                    .to_string(),
                decimals: row
                    .pointer("/account/data/parsed/info/tokenAmount/decimals")
                    .and_then(Value::as_u64)
                    .unwrap_or(asset.decimals as u64) as u8,
                signatures_read: 0,
                complete: true,
            });
        }
    }
    Ok(out)
}

fn reconcile(
    wallet: &str,
    accounts: &[Account],
    assets: &HashMap<String, Asset>,
    events: &mut Vec<Event>,
    complete: bool,
    notes: &mut Vec<String>,
) {
    let mut held: HashMap<String, i128> = HashMap::new();
    for account in accounts {
        *held.entry(account.mint.clone()).or_default() +=
            account.raw_balance.parse::<i128>().unwrap_or(0);
    }
    let mut indexed: HashMap<String, i128> = HashMap::new();
    for event in events.iter().filter(|e| e.kind != "unknown") {
        *indexed.entry(event.mint.clone()).or_default() +=
            event.raw_delta.parse::<i128>().unwrap_or(0);
    }
    let mints: HashSet<_> = held.keys().chain(indexed.keys()).cloned().collect();
    let earliest = events
        .first()
        .map(|e| e.block_time.clone())
        .unwrap_or_else(now_iso);
    let latest = events
        .last()
        .map(|e| e.block_time.clone())
        .unwrap_or_else(now_iso);
    for mint in mints {
        let diff = held.get(&mint).copied().unwrap_or(0) - indexed.get(&mint).copied().unwrap_or(0);
        if diff == 0 {
            continue;
        }
        let asset = &assets[&mint];
        if complete {
            notes.push(format!(
                "{} history is complete but sums to a balance different from the current raw balance. A closed token account or a rule difference explains the gap, which is recorded as a reconciliation event.",
                asset.symbol
            ));
        }
        let incoming = diff > 0;
        events.push(Event {
            id: format!(
                "{wallet}:{mint}:{}",
                if incoming { "opening" } else { "closing" }
            ),
            signature: None,
            slot: None,
            block_time: if incoming {
                shift_iso(&earliest, -1)
            } else {
                shift_iso(&latest, 1)
            },
            kind: if incoming {
                "transfer_in"
            } else {
                "transfer_out"
            }
            .to_string(),
            mint: mint.clone(),
            symbol: asset.symbol.clone(),
            issuer: asset.issuer.clone(),
            raw_delta: diff.to_string(),
            decimals: asset.decimals,
            gross_usd: None,
            fee_usd: None,
            counter_asset: None,
            counter_amount: None,
            multiplier_at_event: None,
            reference_price_usd: None,
            source: "live".to_string(),
            venue: None,
            note: Some(
                if incoming {
                    "Held before the indexed history begins. Cost basis unknown."
                } else {
                    "Left the wallet in a transaction outside the indexed history."
                }
                .to_string(),
            ),
        });
    }
    events.sort_by(|a, b| (&a.block_time, a.slot).cmp(&(&b.block_time, b.slot)));
}

fn shift_iso(value: &str, seconds: i64) -> String {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|time| {
            (time + chrono::Duration::seconds(seconds))
                .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
        })
        .unwrap_or_else(|_| value.to_string())
}

fn number_string(value: f64) -> String {
    if value.fract() == 0.0 {
        format!("{value:.0}")
    } else {
        value.to_string()
    }
}

fn read_multipliers<T: Transport>(
    rpc: &T,
    mints: &HashSet<String>,
    assets: &HashMap<String, Asset>,
    notes: &mut Vec<String>,
) -> BTreeMap<String, Multiplier> {
    let mut out = BTreeMap::new();
    let list: Vec<_> = mints.iter().cloned().collect();
    for chunk in list.chunks(100) {
        let result = match rpc.call(
            "getMultipleAccounts",
            json!([chunk, {"encoding":"jsonParsed","commitment":"confirmed"}]),
        ) {
            Ok(value) => value,
            Err(error) => {
                notes.push(format!("Mint multipliers could not be read: {error}"));
                Value::Null
            }
        };
        let values = result.get("value").and_then(Value::as_array);
        for (index, mint) in chunk.iter().enumerate() {
            let info = values
                .and_then(|v| v.get(index))
                .and_then(|v| v.pointer("/data/parsed/info"));
            // A mint that could not be read gets no entry rather than an invented multiplier.
            let Some(info) = info else {
                let symbol = assets
                    .get(mint)
                    .map_or(mint.as_str(), |a| a.symbol.as_str());
                notes.push(format!(
                    "The {symbol} mint could not be read, so no multiplier is reported for it."
                ));
                continue;
            };
            let info = Some(info);
            let decimals = info
                .and_then(|v| v.get("decimals"))
                .and_then(Value::as_u64)
                .unwrap_or_else(|| assets.get(mint).map_or(0, |a| a.decimals as u64))
                as u8;
            let extension = info
                .and_then(|v| v.get("extensions"))
                .and_then(Value::as_array)
                .and_then(|rows| {
                    rows.iter().find(|row| {
                        row.get("extension").and_then(Value::as_str) == Some("scaledUiAmountConfig")
                    })
                });
            let state = extension.and_then(|v| v.get("state"));
            let parse = |key: &str| {
                state
                    .and_then(|v| v.get(key))
                    .and_then(|v| v.as_f64().or_else(|| v.as_str()?.parse().ok()))
            };
            let base = parse("multiplier").unwrap_or(1.0);
            let pending = parse("newMultiplier");
            let pending_at = parse("newMultiplierEffectiveTimestamp")
                .map(|v| v as i64)
                .filter(|v| *v > 0);
            let passed =
                pending_at.is_some_and(|timestamp| timestamp <= chrono::Utc::now().timestamp());
            let current = if passed {
                pending.unwrap_or(base)
            } else {
                base
            };
            out.insert(
                mint.clone(),
                Multiplier {
                    multiplier: number_string(current),
                    pending_multiplier: if passed || pending == Some(base) {
                        None
                    } else {
                        pending.map(number_string)
                    },
                    pending_effective_at: if passed || pending == Some(base) {
                        None
                    } else {
                        pending_at
                            .and_then(|t| chrono::DateTime::from_timestamp(t, 0))
                            .map(|v| v.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
                    },
                    decimals,
                },
            );
        }
    }
    out
}
