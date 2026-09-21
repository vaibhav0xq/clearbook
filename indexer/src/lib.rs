use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::thread;
use std::time::Duration;

pub const TOKEN_PROGRAM: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
pub const TOKEN_2022_PROGRAM: &str = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
pub const WSOL_MINT: &str = "So11111111111111111111111111111111111111112";
const JUPITER_V6: &str = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const JUPITER_V4: &str = "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB";

// Copied from lib/ledger/src/registry/registry.ts.
pub const CASH_MINTS: [(&str, &str, u8); 5] = [
    ("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "USDC", 6),
    ("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCdF9y4ffN", "USDT", 6),
    ("2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH", "USDG", 6),
    ("2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo", "PYUSD", 6),
    ("USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB", "USD1", 6),
];

#[derive(Clone, Debug, Deserialize)]
pub struct Registry {
    pub assets: Vec<Asset>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub mint: String,
    pub symbol: String,
    pub issuer: String,
    pub underlying_symbol: String,
    pub decimals: u8,
    pub token_program: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub address: String,
    pub mint: String,
    pub symbol: String,
    pub token_program: String,
    pub raw_balance: String,
    pub decimals: u8,
    pub signatures_read: usize,
    pub complete: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Multiplier {
    pub multiplier: String,
    pub pending_multiplier: Option<String>,
    pub pending_effective_at: Option<String>,
    pub decimals: u8,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub signature: Option<String>,
    pub slot: Option<u64>,
    pub block_time: String,
    pub kind: String,
    pub mint: String,
    pub symbol: String,
    pub issuer: String,
    pub raw_delta: String,
    pub decimals: u8,
    pub gross_usd: Option<f64>,
    pub fee_usd: Option<f64>,
    pub counter_asset: Option<String>,
    pub counter_amount: Option<f64>,
    pub multiplier_at_event: Option<f64>,
    pub reference_price_usd: Option<f64>,
    pub source: String,
    pub venue: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    pub version: u8,
    pub wallet: String,
    pub generated_at: String,
    pub rpc: String,
    /// Every signature in scope was listed and every listed transaction was read.
    pub complete: bool,
    /// Whether the wallet's own signature history was in scope. Without it, stock accounts that
    /// were closed since are not found.
    pub owner_history_read: bool,
    pub notes: Vec<String>,
    pub accounts: Vec<Account>,
    pub multipliers: BTreeMap<String, Multiplier>,
    pub events: Vec<Event>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureInfo {
    pub signature: String,
    pub slot: u64,
    pub block_time: Option<i64>,
    pub err: Option<Value>,
}

#[derive(Debug)]
pub struct PageResult {
    pub signatures: Vec<SignatureInfo>,
    pub complete: bool,
}

/// One answer inside a JSON RPC batch. The public endpoint rate limits single rows of a batch
/// with a 429 error while the rest of the batch succeeds, so callers need the row level outcome.
#[derive(Debug, Clone, Default)]
pub struct BatchRow {
    pub result: Option<Value>,
    pub error: Option<String>,
    pub rate_limited: bool,
}

pub trait Transport {
    fn call(&self, method: &str, params: Value) -> Result<Value, String>;
    fn batch(&self, method: &str, params: Vec<Value>) -> Result<Vec<BatchRow>, String>;
    fn is_public(&self) -> bool;
}

pub struct Rpc {
    url: String,
}

impl Rpc {
    pub fn new(url: String) -> Self {
        Self { url }
    }

    fn send(&self, body: &Value) -> Result<Value, String> {
        let attempts = if self.is_public() { 5 } else { 3 };
        for attempt in 1..=attempts {
            let response = ureq::post(&self.url)
                .set("content-type", "application/json")
                .timeout(Duration::from_secs(20))
                .send_json(body.clone());
            match response {
                Ok(res) => {
                    return res
                        .into_json()
                        .map_err(|e| format!("RPC response failed: {e}"))
                }
                Err(ureq::Error::Status(401 | 403, _)) => {
                    return Err("RPC rejected the request.".to_string())
                }
                Err(ureq::Error::Status(429, response)) if attempt < attempts => {
                    // The endpoint names the wait it expects. Fall back to a growing pause.
                    let asked = response
                        .header("retry-after")
                        .and_then(|v| v.trim().parse::<u64>().ok())
                        .filter(|v| *v > 0)
                        .map(|v| Duration::from_secs(v.min(15)));
                    thread::sleep(asked.unwrap_or(Duration::from_millis(1500 * attempt as u64)))
                }
                Err(error) if attempt < attempts => {
                    let _ = error;
                    thread::sleep(Duration::from_millis(500 * attempt as u64))
                }
                Err(error) => return Err(format!("RPC request failed: {error}")),
            }
        }
        unreachable!()
    }
}

impl Transport for Rpc {
    fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        let value = self.send(&json!({"jsonrpc":"2.0","id":1,"method":method,"params":params}))?;
        if let Some(error) = value.get("error") {
            return Err(format!("RPC {method} failed: {error}"));
        }
        Ok(value.get("result").cloned().unwrap_or(Value::Null))
    }

    fn batch(&self, method: &str, params: Vec<Value>) -> Result<Vec<BatchRow>, String> {
        let body = Value::Array(
            params
                .iter()
                .enumerate()
                .map(|(i, p)| json!({"jsonrpc":"2.0","id":i + 1,"method":method,"params":p}))
                .collect(),
        );
        let response = self.send(&body)?;
        let rows = response
            .as_array()
            .ok_or_else(|| "RPC batch response was not an array.".to_string())?;
        let by_id: HashMap<u64, &Value> = rows
            .iter()
            .filter_map(|row| Some((row.get("id")?.as_u64()?, row)))
            .collect();
        Ok((1..=params.len())
            .map(|id| match by_id.get(&(id as u64)) {
                Some(row) => match row.get("error") {
                    Some(error) => BatchRow {
                        result: None,
                        error: Some(error.to_string()),
                        rate_limited: error.get("code").and_then(Value::as_i64) == Some(429),
                    },
                    None => BatchRow {
                        result: row.get("result").filter(|v| !v.is_null()).cloned(),
                        error: None,
                        rate_limited: false,
                    },
                },
                None => BatchRow {
                    result: None,
                    error: Some("The batch response has no row for this request.".to_string()),
                    rate_limited: false,
                },
            })
            .collect())
    }

    fn is_public(&self) -> bool {
        self.url == "https://api.mainnet-beta.solana.com"
    }
}

pub fn load_registry(text: &str) -> Result<Registry, String> {
    serde_json::from_str(text).map_err(|e| format!("Registry could not be read: {e}"))
}

pub fn collect_address_signatures<T: Transport>(
    rpc: &T,
    address: &str,
    limit: Option<usize>,
) -> Result<PageResult, String> {
    let mut signatures = Vec::new();
    let mut before: Option<String> = None;
    loop {
        let remaining = limit.map(|n| n.saturating_sub(signatures.len()));
        if remaining == Some(0) {
            return Ok(PageResult {
                signatures,
                complete: false,
            });
        }
        let count = remaining.unwrap_or(100).min(100);
        let mut options = json!({"limit":count,"commitment":"confirmed"});
        if let Some(value) = &before {
            options["before"] = Value::String(value.clone());
        }
        let page: Vec<SignatureInfo> =
            serde_json::from_value(rpc.call("getSignaturesForAddress", json!([address, options]))?)
                .map_err(|e| format!("Signature response could not be read: {e}"))?;
        let page_len = page.len();
        before = page.last().map(|s| s.signature.clone());
        signatures.extend(page);
        if page_len < count {
            return Ok(PageResult {
                signatures,
                complete: true,
            });
        }
    }
}

fn iso(timestamp: i64) -> String {
    DateTime::from_timestamp(timestamp, 0)
        .unwrap_or(DateTime::<Utc>::UNIX_EPOCH)
        .to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn account_key(value: &Value) -> Option<&str> {
    value
        .get("pubkey")
        .and_then(Value::as_str)
        .or_else(|| value.as_str())
}

pub fn sol_delta_lamports(tx: &Value, owner: &str) -> i64 {
    let Some(keys) = tx
        .pointer("/transaction/message/accountKeys")
        .and_then(Value::as_array)
    else {
        return 0;
    };
    let Some(index) = keys.iter().position(|key| account_key(key) == Some(owner)) else {
        return 0;
    };
    let pre = tx
        .pointer("/meta/preBalances")
        .and_then(Value::as_array)
        .and_then(|v| v.get(index))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let post = tx
        .pointer("/meta/postBalances")
        .and_then(Value::as_array)
        .and_then(|v| v.get(index))
        .and_then(Value::as_i64)
        .unwrap_or(0);
    post - pre
        + if index == 0 {
            tx.pointer("/meta/fee").and_then(Value::as_i64).unwrap_or(0)
        } else {
            0
        }
}

#[derive(Clone)]
struct Delta {
    mint: String,
    raw: i128,
    decimals: u8,
}

fn token_deltas(tx: &Value, owner: &str) -> Vec<Delta> {
    let mut pre: HashMap<u64, Delta> = HashMap::new();
    let mut post: HashMap<u64, Delta> = HashMap::new();
    for (target, path) in [
        (&mut pre, "/meta/preTokenBalances"),
        (&mut post, "/meta/postTokenBalances"),
    ] {
        for row in tx
            .pointer(path)
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            if row.get("owner").and_then(Value::as_str) != Some(owner) {
                continue;
            }
            let Some(index) = row.get("accountIndex").and_then(Value::as_u64) else {
                continue;
            };
            let amount = row
                .pointer("/uiTokenAmount/amount")
                .and_then(Value::as_str)
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
            target.insert(
                index,
                Delta {
                    mint: row
                        .get("mint")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    raw: amount,
                    decimals: row
                        .pointer("/uiTokenAmount/decimals")
                        .and_then(Value::as_u64)
                        .unwrap_or(0) as u8,
                },
            );
        }
    }
    let mut indexes: Vec<_> = pre
        .keys()
        .chain(post.keys())
        .copied()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    indexes.sort_unstable();
    let mut by_mint: Vec<Delta> = Vec::new();
    for index in indexes {
        let a = pre.get(&index);
        let b = post.get(&index);
        let sample = b.or(a).expect("balance key exists");
        let raw = b.map_or(0, |d| d.raw) - a.map_or(0, |d| d.raw);
        if raw == 0 {
            continue;
        }
        if let Some(existing) = by_mint.iter_mut().find(|d| d.mint == sample.mint) {
            existing.raw += raw;
        } else {
            by_mint.push(Delta {
                mint: sample.mint.clone(),
                raw,
                decimals: sample.decimals,
            });
        }
    }
    by_mint
}

pub fn classify(
    signature: &SignatureInfo,
    tx: &Value,
    owner: &str,
    assets: &HashMap<String, Asset>,
) -> (Vec<Event>, bool) {
    if tx.pointer("/meta/err").is_some_and(|v| !v.is_null()) {
        return (Vec::new(), false);
    }
    let deltas = token_deltas(tx, owner);
    let stocks: Vec<_> = deltas
        .iter()
        .filter(|d| assets.contains_key(&d.mint))
        .cloned()
        .collect();
    if stocks.is_empty() {
        return (Vec::new(), false);
    }
    let mut cash_usd = 0.0;
    let mut cash_amount = 0.0;
    let mut cash_symbol: Option<String> = None;
    for delta in &deltas {
        if let Some((_, symbol, decimals)) = CASH_MINTS.iter().find(|v| v.0 == delta.mint) {
            let amount = delta.raw as f64 / 10_f64.powi(*decimals as i32);
            cash_usd += amount;
            cash_amount += amount;
            cash_symbol = Some(match cash_symbol {
                Some(ref old) if old != symbol => "stables".to_string(),
                Some(old) => old,
                None => (*symbol).to_string(),
            });
        }
    }
    let wrapped = deltas
        .iter()
        .find(|d| d.mint == WSOL_MINT)
        .map_or(0.0, |d| d.raw as f64 / 1e9);
    let mut sol = wrapped + sol_delta_lamports(tx, owner) as f64 / 1e9;
    if sol.abs() < 0.0005 {
        sol = 0.0;
    }
    let venue = tx
        .pointer("/transaction/message/instructions")
        .and_then(Value::as_array)
        .is_some_and(|rows| {
            rows.iter().any(|row| {
                matches!(
                    row.get("programId").and_then(Value::as_str),
                    Some(JUPITER_V6 | JUPITER_V4)
                )
            })
        })
        .then(|| "jupiter".to_string());
    let timestamp = tx
        .get("blockTime")
        .and_then(Value::as_i64)
        .or(signature.block_time)
        .unwrap_or(0);
    let slot = tx
        .get("slot")
        .and_then(Value::as_u64)
        .unwrap_or(signature.slot);
    let make = |d: &Delta, kind: &str| {
        let asset = &assets[&d.mint];
        Event {
            id: format!("{owner}:{}:{}", signature.signature, d.mint),
            signature: Some(signature.signature.clone()),
            slot: Some(slot),
            block_time: iso(timestamp),
            kind: kind.to_string(),
            mint: d.mint.clone(),
            symbol: asset.symbol.clone(),
            issuer: asset.issuer.clone(),
            raw_delta: d.raw.to_string(),
            decimals: d.decimals,
            gross_usd: None,
            fee_usd: None,
            counter_asset: None,
            counter_amount: None,
            multiplier_at_event: None,
            reference_price_usd: None,
            source: "live".to_string(),
            venue: venue.clone(),
            note: None,
        }
    };
    if stocks.len() == 1 {
        let d = &stocks[0];
        if cash_usd != 0.0 && cash_usd.signum() != (d.raw as f64).signum() {
            let mut event = make(d, if d.raw > 0 { "buy" } else { "sell" });
            event.gross_usd = Some(cash_usd.abs());
            event.fee_usd = Some(0.0);
            event.counter_asset = cash_symbol;
            event.counter_amount = Some(cash_amount.abs());
            return (vec![event], false);
        }
        if sol != 0.0 && sol.signum() != (d.raw as f64).signum() {
            let mut event = make(d, if d.raw > 0 { "buy" } else { "sell" });
            event.counter_asset = Some("SOL".to_string());
            event.counter_amount = Some(sol.abs());
            event.note = Some("Settled in SOL. The USD value at trade time was not available, so the cash leg is unknown.".to_string());
            return (vec![event], false);
        }
        let mut event = make(
            d,
            if d.raw > 0 {
                "transfer_in"
            } else {
                "transfer_out"
            },
        );
        event.note = Some(
            if d.raw > 0 {
                "Received without a cash leg in this wallet."
            } else {
                "Sent out without a cash leg in this wallet."
            }
            .to_string(),
        );
        return (vec![event], false);
    }
    if stocks.len() == 2 && stocks[0].raw.signum() != stocks[1].raw.signum() {
        let out = stocks.iter().find(|d| d.raw < 0).expect("outflow exists");
        let inn = stocks.iter().find(|d| d.raw > 0).expect("inflow exists");
        let mut e_out = make(out, "wrapper_swap_out");
        let mut e_in = make(inn, "wrapper_swap_in");
        let out_asset = &assets[&out.mint];
        let in_asset = &assets[&inn.mint];
        e_out.gross_usd = (cash_usd != 0.0).then(|| cash_usd.abs());
        e_in.gross_usd = e_out.gross_usd;
        e_out.counter_asset = Some(in_asset.symbol.clone());
        e_out.counter_amount = Some(inn.raw as f64 / 10_f64.powi(inn.decimals as i32));
        e_out.note = Some(
            if out_asset.underlying_symbol == in_asset.underlying_symbol {
                format!(
                    "Swapped into {}, another wrapper of {}.",
                    in_asset.symbol, out_asset.underlying_symbol
                )
            } else {
                format!(
                    "Swapped into {}. Treated as a disposal and a new acquisition.",
                    in_asset.symbol
                )
            },
        );
        e_in.counter_asset = Some(out_asset.symbol.clone());
        e_in.counter_amount = Some((-out.raw) as f64 / 10_f64.powi(out.decimals as i32));
        e_in.note = Some(format!("Swapped from {}.", out_asset.symbol));
        return (vec![e_out, e_in], false);
    }
    let events = stocks.iter().map(|d| {
        let mut event = make(d, "unknown");
        event.note = Some("Several tokenized stocks moved in one transaction. Not classified. Balance change recorded without basis.".to_string());
        event
    }).collect();
    (events, true)
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}
