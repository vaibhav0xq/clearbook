use clearbook_verifier::extract_transaction;

#[test]
fn extracts_a_parsed_memo_and_transaction_details() {
    let response: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/get_transaction.json")).unwrap();
    let details = extract_transaction(&response).unwrap();
    assert_eq!(
        details.memo.as_deref(),
        Some("clearbook:v1:bea5f36e5973e0a59a5fae595650ae1bd5030d32a9ff56f58e92e77eb4baa577")
    );
    assert_eq!(
        details.signer.as_deref(),
        Some("GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3")
    );
    assert!(details.signer_is_valid);
    assert!(details.transaction_succeeded);
    assert_eq!(details.slot, Some(448840170));
    assert_eq!(details.block_time, Some(1789936298));
}

#[test]
fn extracts_a_memo_from_inner_instructions() {
    let mut response: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/get_transaction.json")).unwrap();
    let memo = response["result"]["transaction"]["message"]["instructions"][1].clone();
    response["result"]["transaction"]["message"]["instructions"] = serde_json::json!([]);
    response["result"]["meta"]["innerInstructions"] = serde_json::json!([{
        "index": 0,
        "instructions": [memo]
    }]);
    let details = extract_transaction(&response).unwrap();
    assert_eq!(
        details.memo.as_deref(),
        Some("clearbook:v1:bea5f36e5973e0a59a5fae595650ae1bd5030d32a9ff56f58e92e77eb4baa577")
    );
}

#[test]
fn rejects_logs_and_unrecognized_programs() {
    let mut response: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/get_transaction.json")).unwrap();
    response["result"]["transaction"]["message"]["instructions"][1]["programId"] =
        serde_json::json!("NotTheMemoProgram111111111111111111111111");
    let details = extract_transaction(&response).unwrap();
    assert_eq!(details.memo, None);
}

#[test]
fn reports_a_failed_transaction() {
    let mut response: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/get_transaction.json")).unwrap();
    response["result"]["meta"]["err"] = serde_json::json!({"InstructionError": [1, "Custom"]});
    let details = extract_transaction(&response).unwrap();
    assert!(!details.transaction_succeeded);
}
