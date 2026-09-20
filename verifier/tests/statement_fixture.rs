use clearbook_verifier::hash_statement;

#[test]
fn hashes_a_statement_created_by_the_api() {
    let statement: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/statement.json")).unwrap();
    let expected = statement
        .get("hash")
        .and_then(|value| value.as_str())
        .unwrap();
    assert_eq!(hash_statement(&statement).unwrap(), expected);
}
