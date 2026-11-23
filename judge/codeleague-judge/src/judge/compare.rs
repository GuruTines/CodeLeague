//! Comparison of the value returned by the function with the expected one.

use serde_json::{Number, Value};

/// Relative/absolute tolerance used when floating-point numbers are involved.
const EPSILON: f64 = 1e-6;

/// Structural equality of two JSON values. Integers must match exactly; as soon
/// as one side is a floating-point number both are compared with [`EPSILON`].
pub fn values_equal(expected: &Value, actual: &Value) -> bool {
    match (expected, actual) {
        (Value::Number(a), Value::Number(b)) => numbers_equal(a, b),
        (Value::Array(a), Value::Array(b)) => a.len() == b.len() && a.iter().zip(b).all(|(x, y)| values_equal(x, y)),
        _ => expected == actual,
    }
}

fn numbers_equal(a: &Number, b: &Number) -> bool {
    if let (Some(x), Some(y)) = (a.as_i64(), b.as_i64()) {
        return x == y;
    }
    match (a.as_f64(), b.as_f64()) {
        (Some(x), Some(y)) => (x - y).abs() <= EPSILON * x.abs().max(y.abs()).max(1.0),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn integers_are_exact() {
        assert!(values_equal(&json!(5), &json!(5)));
        assert!(!values_equal(&json!(5), &json!(6)));
        assert!(!values_equal(&json!(9007199254740993_i64), &json!(9007199254740992_i64)));
    }

    #[test]
    fn floats_use_a_tolerance() {
        assert!(values_equal(&json!(0.3), &json!(0.1 + 0.2)));
        assert!(values_equal(&json!(5), &json!(5.0)));
        assert!(values_equal(&json!(1e12), &json!(1e12 + 1.0)));
        assert!(!values_equal(&json!(0.3), &json!(0.31)));
    }

    #[test]
    fn arrays_strings_and_bools() {
        assert!(values_equal(&json!([[1, 2], []]), &json!([[1, 2], []])));
        assert!(!values_equal(&json!([1, 2]), &json!([2, 1])));
        assert!(!values_equal(&json!([1, 2]), &json!([1, 2, 3])));
        assert!(values_equal(&json!("a b"), &json!("a b")));
        assert!(!values_equal(&json!("a b"), &json!("a  b")));
        assert!(!values_equal(&json!(true), &json!(1)));
        assert!(!values_equal(&json!(["1"]), &json!([1])));
    }
}
