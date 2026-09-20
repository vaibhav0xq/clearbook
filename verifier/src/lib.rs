use serde_json::{Number, Value};
use sha2::{Digest, Sha256};

pub const MEMO_PREFIX: &str = "clearbook:v1:";
pub const MEMO_PROGRAM: &str = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
pub const LEGACY_MEMO_PROGRAM: &str = "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo";
pub const VIEW_KEYS: [&str; 6] = ["id", "hash", "proof", "ownedByViewer", "csvUrl", "pdfUrl"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransactionDetails {
    pub memo: Option<String>,
    pub signer: Option<String>,
    pub signer_is_valid: bool,
    pub transaction_succeeded: bool,
    pub slot: Option<u64>,
    pub block_time: Option<i64>,
}

pub fn stripped_statement(statement: &Value) -> Result<Value, String> {
    let object = statement
        .as_object()
        .ok_or_else(|| "The statement must be a JSON object.".to_string())?;
    let mut body = object.clone();
    for key in VIEW_KEYS {
        body.remove(key);
    }
    Ok(Value::Object(body))
}

pub fn hash_statement(statement: &Value) -> Result<String, String> {
    let body = stripped_statement(statement)?;
    let canonical = canonical_json(&body);
    Ok(format!("{:x}", Sha256::digest(canonical.as_bytes())))
}

pub fn canonical_json(value: &Value) -> String {
    let mut output = String::new();
    write_canonical(value, &mut output);
    output
}

fn write_canonical(value: &Value, output: &mut String) {
    match value {
        Value::Null => output.push_str("null"),
        Value::Bool(value) => output.push_str(if *value { "true" } else { "false" }),
        Value::Number(value) => output.push_str(&javascript_number(value)),
        Value::String(value) => {
            output.push_str(&serde_json::to_string(value).expect("A JSON string always serializes"))
        }
        Value::Array(values) => {
            output.push('[');
            for (index, value) in values.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                write_canonical(value, output);
            }
            output.push(']');
        }
        Value::Object(values) => {
            output.push('{');
            let mut keys: Vec<&String> = values.keys().collect();
            keys.sort();
            for (index, key) in keys.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                output.push_str(
                    &serde_json::to_string(key).expect("A JSON object key always serializes"),
                );
                output.push(':');
                write_canonical(&values[*key], output);
            }
            output.push('}');
        }
    }
}

fn javascript_number(number: &Number) -> String {
    let value = number
        .to_string()
        .parse::<f64>()
        .expect("A JSON number is finite");
    if value == 0.0 {
        return "0".to_string();
    }

    let mut buffer = ryu_js::Buffer::new();
    buffer.format(value).to_string()
}

pub fn extract_transaction(value: &Value) -> Result<TransactionDetails, String> {
    let result = value
        .get("result")
        .filter(|result| !result.is_null())
        .ok_or_else(|| "The transaction was not found.".to_string())?;
    let message = result
        .pointer("/transaction/message")
        .ok_or_else(|| "The RPC response has no transaction message.".to_string())?;

    let keys = message
        .get("accountKeys")
        .and_then(Value::as_array)
        .ok_or_else(|| "The RPC response has no account keys.".to_string())?;
    let first = keys.first();
    let signer = first.and_then(account_pubkey);
    let signer_is_valid = first
        .and_then(|key| key.get("signer"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let transaction_succeeded = result.pointer("/meta/err").is_some_and(Value::is_null);

    let mut memo = message
        .get("instructions")
        .and_then(Value::as_array)
        .and_then(|instructions| memo_from_instructions(instructions));
    if memo.is_none() {
        if let Some(groups) = result
            .pointer("/meta/innerInstructions")
            .and_then(Value::as_array)
        {
            for group in groups {
                if let Some(found) = group
                    .get("instructions")
                    .and_then(Value::as_array)
                    .and_then(|instructions| memo_from_instructions(instructions))
                {
                    memo = Some(found);
                    break;
                }
            }
        }
    }
    Ok(TransactionDetails {
        memo,
        signer,
        signer_is_valid,
        transaction_succeeded,
        slot: result.get("slot").and_then(Value::as_u64),
        block_time: result.get("blockTime").and_then(Value::as_i64),
    })
}

fn account_pubkey(value: &Value) -> Option<String> {
    value
        .get("pubkey")
        .and_then(Value::as_str)
        .or_else(|| value.as_str())
        .map(str::to_string)
}

fn memo_from_instructions(instructions: &[Value]) -> Option<String> {
    instructions.iter().find_map(|instruction| {
        let program_id = instruction.get("programId").and_then(Value::as_str);
        if program_id == Some(MEMO_PROGRAM) || program_id == Some(LEGACY_MEMO_PROGRAM) {
            instruction
                .get("parsed")
                .and_then(Value::as_str)
                .map(str::to_string)
        } else {
            None
        }
    })
}

pub fn make_rpc_request(signature: &str) -> Value {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "getTransaction",
        "params": [
            signature,
            {
                "encoding": "jsonParsed",
                "maxSupportedTransactionVersion": 0
            }
        ]
    })
}
