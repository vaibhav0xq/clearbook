use clearbook_verifier::canonical_json;
use serde_json::json;

#[test]
fn sorts_keys_at_every_depth_and_preserves_arrays() {
    let value = json!({
        "z": null,
        "a": {
            "z": true,
            "a": "héllo\n\"\\\t"
        },
        "array": [3, {"z": 2, "a": 1}, false]
    });
    assert_eq!(
        canonical_json(&value),
        "{\"a\":{\"a\":\"héllo\\n\\\"\\\\\\t\",\"z\":true},\"array\":[3,{\"a\":1,\"z\":2},false],\"z\":null}"
    );
}

#[test]
fn formats_numbers_like_json_stringify() {
    let value: serde_json::Value = serde_json::from_str(
        r#"{"integer":1.0,"negativeZero":-0.0,"small":1e-7,"tiny":1e-6,"wide":1e20,"huge":1e21,"tricky":333333333.33333329,"roundTrip":0.000000123456789012345}"#,
    )
    .unwrap();
    assert_eq!(
        canonical_json(&value),
        "{\"huge\":1e+21,\"integer\":1,\"negativeZero\":0,\"roundTrip\":1.23456789012345e-7,\"small\":1e-7,\"tiny\":0.000001,\"tricky\":333333333.3333333,\"wide\":100000000000000000000}"
    );
}

#[test]
fn keeps_unicode_and_json_escapes() {
    let value = json!("\u{0008}\u{000c}\n\r\t\"\\ café 東京");
    assert_eq!(
        canonical_json(&value),
        "\"\\b\\f\\n\\r\\t\\\"\\\\ café 東京\""
    );
}
