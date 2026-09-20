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
    assert_eq!(details.slot, Some(448840170));
    assert_eq!(details.block_time, Some(1789936298));
}

#[test]
fn extracts_a_memo_from_logs() {
    let mut response: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/get_transaction.json")).unwrap();
    response["result"]["transaction"]["message"]["instructions"] = serde_json::json!([]);
    let details = extract_transaction(&response).unwrap();
    assert_eq!(
        details.memo.as_deref(),
        Some("clearbook:v1:bea5f36e5973e0a59a5fae595650ae1bd5030d32a9ff56f58e92e77eb4baa577")
    );
}
