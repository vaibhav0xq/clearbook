use clap::Parser;
use clearbook_verifier::{extract_transaction, hash_statement, make_rpc_request, MEMO_PREFIX};
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::process::ExitCode;

#[derive(Parser)]
#[command(
    name = "clearbook-verify",
    version,
    about = "Verify a Clearbook statement"
)]
struct Cli {
    #[arg(long, conflicts_with = "api", required_unless_present = "api")]
    file: Option<String>,
    #[arg(long, requires = "id", conflicts_with = "file")]
    api: Option<String>,
    #[arg(long, requires = "api")]
    id: Option<String>,
    #[arg(long)]
    offline: bool,
    #[arg(long)]
    signature: Option<String>,
    #[arg(long)]
    expect_hash: Option<String>,
    #[arg(long)]
    allow_any_signer: bool,
    #[arg(long, default_value = "https://api.mainnet-beta.solana.com")]
    rpc: String,
    #[arg(long)]
    json: bool,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct Output {
    computed_hash: Option<String>,
    statement_hash: Option<String>,
    expected_hash: Option<String>,
    hash_matches: Option<bool>,
    expected_memo: Option<String>,
    transaction_checked: bool,
    transaction_skipped: Option<String>,
    memo: Option<String>,
    memo_matches: Option<bool>,
    signer: Option<String>,
    signer_is_valid: Option<bool>,
    signer_matches_statement: Option<bool>,
    transaction_succeeded: Option<bool>,
    slot: Option<u64>,
    block_time: Option<String>,
    explorer_url: Option<String>,
    warnings: Vec<String>,
    failures: Vec<String>,
    error: Option<String>,
    valid: bool,
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let mut output = Output::default();
    let code = match run(&cli, &mut output) {
        Ok(valid) => {
            output.valid = valid;
            if valid {
                0
            } else {
                1
            }
        }
        Err(error) => {
            output.error = Some(error);
            2
        }
    };
    print_output(&cli, &output);
    ExitCode::from(code)
}

fn run(cli: &Cli, output: &mut Output) -> Result<bool, String> {
    let statement = load_statement(cli)?;
    let computed = hash_statement(&statement)?;
    let carried = statement
        .get("hash")
        .and_then(Value::as_str)
        .map(str::to_string);
    if let Some(expected) = &cli.expect_hash {
        validate_hash(expected)?;
    }
    let carried_matches = carried.as_ref().map(|hash| hash == &computed);
    let expected_matches = cli
        .expect_hash
        .as_ref()
        .map(|hash| hash.eq_ignore_ascii_case(&computed));
    let has_hash_evidence = carried.is_some() || cli.expect_hash.is_some();
    let hash_matches = carried_matches
        .into_iter()
        .chain(expected_matches)
        .all(|matches| matches);
    output.computed_hash = Some(computed.clone());
    output.statement_hash = carried;
    output.expected_hash = cli.expect_hash.clone();
    output.hash_matches = has_hash_evidence.then_some(hash_matches);
    let expected_memo = format!("{MEMO_PREFIX}{computed}");
    output.expected_memo = Some(expected_memo.clone());

    if cli.offline {
        output.transaction_skipped = Some("Offline mode was requested.".to_string());
        if !has_hash_evidence {
            output
                .failures
                .push("Nothing to compare against. Provide a statement hash, an expected hash or a transaction signature.".to_string());
        }
        return Ok(has_hash_evidence && hash_matches);
    }

    let proof = statement.get("proof");
    let proof_is_simulated = proof
        .and_then(|proof| proof.get("kind"))
        .and_then(Value::as_str)
        == Some("simulated")
        || proof
            .and_then(|proof| proof.get("status"))
            .and_then(Value::as_str)
            == Some("simulated");
    let signature = cli.signature.clone().or_else(|| {
        proof
            .and_then(|proof| proof.get("signature"))
            .and_then(Value::as_str)
            .map(str::to_string)
    });
    if cli.signature.is_none() && proof_is_simulated {
        output.transaction_skipped =
            Some("The proof is simulated and has no on chain transaction.".to_string());
        return finish_without_transaction(output, has_hash_evidence, hash_matches);
    }
    let Some(signature) = signature else {
        output.transaction_skipped =
            Some("No transaction signature is available for this statement.".to_string());
        return finish_without_transaction(output, has_hash_evidence, hash_matches);
    };

    let rpc = call_rpc(&cli.rpc, &signature)?;
    if let Some(error) = rpc.get("error") {
        return Err(format!("Solana RPC returned an error: {error}"));
    }
    let details = extract_transaction(&rpc)?;
    output.transaction_checked = true;
    output.memo = details.memo.clone();
    output.memo_matches = Some(details.memo.as_deref() == Some(&expected_memo));
    output.signer = details.signer.clone();
    output.signer_is_valid = Some(details.signer_is_valid);
    output.transaction_succeeded = Some(details.transaction_succeeded);
    output.slot = details.slot;
    output.block_time = details.block_time.map(format_utc);
    output.explorer_url = Some(format!(
        "https://explorer.solana.com/tx/{signature}?cluster=mainnet-beta"
    ));

    let address = statement.get("address").and_then(Value::as_str);
    output.signer_matches_statement =
        Some(address.is_some_and(|address| details.signer.as_deref() == Some(address)));
    if output.signer_matches_statement == Some(false) {
        let message = "The transaction signer differs from the statement address. The proof does not establish account ownership.".to_string();
        if cli.allow_any_signer {
            output.warnings.push(message);
        } else {
            output.failures.push(message);
        }
    }
    if !details.signer_is_valid {
        output
            .failures
            .push("The first account key is not marked as a signer.".to_string());
    }
    if !details.transaction_succeeded {
        output
            .failures
            .push("The transaction failed on chain.".to_string());
    }

    Ok(hash_matches
        && output.memo_matches == Some(true)
        && details.signer_is_valid
        && details.transaction_succeeded
        && (cli.allow_any_signer || output.signer_matches_statement == Some(true)))
}

fn finish_without_transaction(
    output: &mut Output,
    has_hash_evidence: bool,
    hash_matches: bool,
) -> Result<bool, String> {
    if !has_hash_evidence {
        output
            .failures
            .push("Nothing to compare against. Provide a statement hash, an expected hash or a transaction signature.".to_string());
    }
    Ok(has_hash_evidence && hash_matches)
}

fn validate_hash(hash: &str) -> Result<(), String> {
    if hash.len() == 64 && hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("The expected hash must contain 64 hexadecimal characters.".to_string())
    }
}

fn load_statement(cli: &Cli) -> Result<Value, String> {
    if let Some(path) = &cli.file {
        let content =
            fs::read_to_string(path).map_err(|error| format!("Could not read {path}: {error}"))?;
        return serde_json::from_str(&content)
            .map_err(|error| format!("Could not parse statement JSON: {error}"));
    }
    let base = cli.api.as_ref().expect("Clap requires an API URL");
    let id = cli.id.as_ref().expect("Clap requires a statement id");
    let url = format!("{}/statements/{id}", base.trim_end_matches('/'));
    let response = ureq::get(&url)
        .call()
        .map_err(|error| format!("Could not fetch the statement: {error}"))?;
    response
        .into_json()
        .map_err(|error| format!("Could not parse the API response: {error}"))
}

fn call_rpc(url: &str, signature: &str) -> Result<Value, String> {
    let response = ureq::post(url)
        .send_json(make_rpc_request(signature))
        .map_err(|error| format!("Could not read the Solana transaction: {error}"))?;
    response
        .into_json()
        .map_err(|error| format!("Could not parse the Solana RPC response: {error}"))
}

fn print_output(cli: &Cli, output: &Output) {
    if cli.json {
        println!(
            "{}",
            serde_json::to_string_pretty(output).expect("The result always serializes")
        );
        return;
    }
    if let Some(error) = &output.error {
        eprintln!("Error: {error}");
        return;
    }
    println!(
        "Computed hash: {}",
        output.computed_hash.as_deref().unwrap_or("")
    );
    if let Some(hash) = &output.statement_hash {
        println!("Statement hash: {hash}");
        println!(
            "Hash match: {}",
            if output.hash_matches == Some(true) {
                "yes"
            } else {
                "no"
            }
        );
    } else {
        println!("Statement hash: not provided");
    }
    if let Some(hash) = &output.expected_hash {
        println!("Expected hash: {hash}");
    }
    if let Some(reason) = &output.transaction_skipped {
        println!("Transaction check: skipped. {reason}");
    }
    if output.transaction_checked {
        println!("Memo: {}", output.memo.as_deref().unwrap_or("not found"));
        println!(
            "Memo match: {}",
            if output.memo_matches == Some(true) {
                "yes"
            } else {
                "no"
            }
        );
        println!(
            "Signer: {}",
            output.signer.as_deref().unwrap_or("not found")
        );
        println!(
            "Signer flag: {}",
            if output.signer_is_valid == Some(true) {
                "valid"
            } else {
                "invalid"
            }
        );
        println!(
            "Transaction status: {}",
            if output.transaction_succeeded == Some(true) {
                "successful"
            } else {
                "failed"
            }
        );
        if let Some(slot) = output.slot {
            println!("Slot: {slot}");
        }
        if let Some(time) = &output.block_time {
            println!("Block time: {time}");
        }
        if let Some(link) = &output.explorer_url {
            println!("Explorer: {link}");
        }
    }
    for warning in &output.warnings {
        println!("Warning: {warning}");
    }
    for failure in &output.failures {
        println!("Failure: {failure}");
    }
    println!("Result: {}", if output.valid { "valid" } else { "invalid" });
}

fn format_utc(timestamp: i64) -> String {
    let days = timestamp.div_euclid(86_400);
    let seconds = timestamp.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds / 3_600;
    let minute = seconds % 3_600 / 60;
    let second = seconds % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

fn civil_from_days(days_since_epoch: i64) -> (i64, i64, i64) {
    let days = days_since_epoch + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += if month <= 2 { 1 } else { 0 };
    (year, month, day)
}
