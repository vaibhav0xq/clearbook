use clearbook_indexer::{
    classify, collect_address_signatures, sol_delta_lamports, Asset, BatchRow, SignatureInfo,
    Transport,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::cell::RefCell;
use std::collections::HashMap;

const OWNER: &str = "owner";

#[derive(Deserialize)]
struct Case {
    name: String,
    stocks: Vec<(String, String)>,
    cash: Option<(String, String)>,
    lamports: Option<i64>,
    failed: Option<bool>,
    kind: Vec<String>,
}

fn asset(mint: &str, symbol: &str, underlying: &str) -> Asset {
    Asset {
        mint: mint.to_string(),
        symbol: symbol.to_string(),
        issuer: "xstocks".to_string(),
        underlying_symbol: underlying.to_string(),
        decimals: 2,
        token_program: "token".to_string(),
    }
}

fn transaction(case: &Case) -> Value {
    let mut pre = Vec::new();
    let mut post = Vec::new();
    for (index, (mint, delta)) in case.stocks.iter().enumerate() {
        let raw = delta.parse::<i128>().unwrap();
        let (before, after) = if raw > 0 { (0, raw) } else { (-raw, 0) };
        pre.push(balance(index, mint, before.to_string(), 2));
        post.push(balance(index, mint, after.to_string(), 2));
    }
    if let Some((mint, delta)) = &case.cash {
        let index = pre.len();
        let raw = delta.parse::<i128>().unwrap();
        let (before, after) = if raw > 0 { (0, raw) } else { (-raw, 0) };
        pre.push(balance(index, mint, before.to_string(), 6));
        post.push(balance(index, mint, after.to_string(), 6));
    }
    let pre_lamports = 2_000_000_000_i64;
    json!({
        "slot": 9,
        "blockTime": 100,
        "meta": {
            "err": if case.failed.unwrap_or(false) { json!({"failed":true}) } else { Value::Null },
            "fee": 5000,
            "preBalances": [pre_lamports],
            "postBalances": [pre_lamports + case.lamports.unwrap_or(0) - 5000],
            "preTokenBalances": pre,
            "postTokenBalances": post
        },
        "transaction": {"message":{"accountKeys":[{"pubkey":OWNER}],"instructions":[]}}
    })
}

fn balance(index: usize, mint: &str, amount: String, decimals: u8) -> Value {
    json!({
        "accountIndex": index,
        "mint": mint,
        "owner": OWNER,
        "uiTokenAmount": {"amount":amount,"decimals":decimals}
    })
}

#[test]
fn classification_fixtures_match_application_rules() {
    let cases: Vec<Case> =
        serde_json::from_str(include_str!("fixtures/cases.json")).expect("valid fixture");
    let assets = HashMap::from([
        ("stock-a".to_string(), asset("stock-a", "AAA", "AAA")),
        ("stock-b".to_string(), asset("stock-b", "BBB", "AAA")),
    ]);
    let signature = SignatureInfo {
        signature: "sig".to_string(),
        slot: 9,
        block_time: Some(100),
        err: None,
    };
    for case in cases {
        let (events, unknown) = classify(&signature, &transaction(&case), OWNER, &assets);
        let kinds: Vec<_> = events.iter().map(|event| event.kind.clone()).collect();
        assert_eq!(kinds, case.kind, "{}", case.name);
        assert_eq!(unknown, case.kind.iter().any(|kind| kind == "unknown"));
    }
}

#[test]
fn event_id_uses_owner_signature_and_mint() {
    let case = Case {
        name: "id".to_string(),
        stocks: vec![("stock-a".to_string(), "1".to_string())],
        cash: None,
        lamports: None,
        failed: None,
        kind: vec!["transfer_in".to_string()],
    };
    let assets = HashMap::from([("stock-a".to_string(), asset("stock-a", "AAA", "AAA"))]);
    let signature = SignatureInfo {
        signature: "signature".to_string(),
        slot: 1,
        block_time: Some(1),
        err: None,
    };
    let (events, _) = classify(&signature, &transaction(&case), OWNER, &assets);
    assert_eq!(events[0].id, "owner:signature:stock-a");
}

#[test]
fn sol_delta_adds_fee_for_first_account_only() {
    let first = json!({
        "meta":{"fee":5000,"preBalances":[100000],"postBalances":[90000]},
        "transaction":{"message":{"accountKeys":[{"pubkey":OWNER}]}}
    });
    assert_eq!(sol_delta_lamports(&first, OWNER), -5000);
    let second = json!({
        "meta":{"fee":5000,"preBalances":[1,100000],"postBalances":[1,90000]},
        "transaction":{"message":{"accountKeys":[{"pubkey":"payer"},{"pubkey":OWNER}]}}
    });
    assert_eq!(sol_delta_lamports(&second, OWNER), -10000);
}

struct FakeRpc {
    calls: RefCell<usize>,
}

impl Transport for FakeRpc {
    fn call(&self, method: &str, _params: Value) -> Result<Value, String> {
        assert_eq!(method, "getSignaturesForAddress");
        let call = self.calls.replace_with(|calls| *calls + 1);
        if call == 0 {
            Ok(Value::Array(
                (0..100)
                    .map(|i| {
                        json!({"signature":format!("sig-{i}"),"slot":i,"blockTime":i,"err":null})
                    })
                    .collect(),
            ))
        } else {
            Ok(json!([]))
        }
    }

    fn batch(&self, _method: &str, _params: Vec<Value>) -> Result<Vec<BatchRow>, String> {
        unreachable!()
    }

    fn is_public(&self) -> bool {
        false
    }
}

#[test]
fn pagination_marks_a_limit_as_incomplete() {
    let rpc = FakeRpc {
        calls: RefCell::new(0),
    };
    let limited = collect_address_signatures(&rpc, OWNER, Some(100)).unwrap();
    assert_eq!(limited.signatures.len(), 100);
    assert!(!limited.complete);

    let rpc = FakeRpc {
        calls: RefCell::new(0),
    };
    let full = collect_address_signatures(&rpc, OWNER, None).unwrap();
    assert_eq!(full.signatures.len(), 100);
    assert!(full.complete);
    assert_eq!(*rpc.calls.borrow(), 2);
}
