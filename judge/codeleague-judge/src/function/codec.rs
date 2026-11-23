//! JSON values ⇄ the token stream understood by the generated harnesses.

use serde_json::{Number, Value};

use super::types::{Base, Signature, Type};

const HEX: &[u8; 16] = b"0123456789abcdef";

/// Encodes a test's `input` (a JSON array with one element per parameter) into
/// the stdin of the harness.
pub fn encode_args(sig: &Signature, input_json: &str) -> Result<String, String> {
    let value: Value = serde_json::from_str(input_json).map_err(|e| format!("input is not valid JSON: {e}"))?;
    let args = value
        .as_array()
        .ok_or_else(|| "input must be a JSON array with one element per parameter".to_string())?;
    if args.len() != sig.params.len() {
        return Err(format!(
            "input has {} argument(s) but the signature declares {}",
            args.len(),
            sig.params.len()
        ));
    }
    let mut out = String::new();
    for (i, (arg, param)) in args.iter().zip(&sig.params).enumerate() {
        encode_value(param.ty, arg, &mut out).map_err(|e| format!("argument {} (`{}`): {e}", i + 1, param.name))?;
    }
    out.push('\n');
    Ok(out)
}

/// Parses a test's `expected_output` and checks that it fits the return type.
pub fn parse_expected(ty: Type, json: &str) -> Result<Value, String> {
    let value: Value = serde_json::from_str(json).map_err(|e| format!("not valid JSON: {e}"))?;
    encode_value(ty, &value, &mut String::new())?;
    Ok(value)
}

/// Appends the tokens of `v` (which must conform to `ty`) to `out`.
pub fn encode_value(ty: Type, v: &Value, out: &mut String) -> Result<(), String> {
    if ty.dims > 0 {
        let items = v
            .as_array()
            .ok_or_else(|| format!("expected an array ({ty}), got {}", show(v)))?;
        push_token(out, &items.len().to_string());
        for (i, item) in items.iter().enumerate() {
            encode_value(ty.element(), item, out).map_err(|e| format!("[{i}]: {e}"))?;
        }
        return Ok(());
    }
    match ty.base {
        Base::Int => {
            let n = v
                .as_i64()
                .filter(|n| i32::try_from(*n).is_ok())
                .ok_or_else(|| format!("expected an int (32-bit), got {}", show(v)))?;
            push_token(out, &n.to_string());
        }
        Base::Long => {
            let n = v.as_i64().ok_or_else(|| format!("expected a long (64-bit), got {}", show(v)))?;
            push_token(out, &n.to_string());
        }
        Base::Double => {
            let f = v.as_f64().ok_or_else(|| format!("expected a double, got {}", show(v)))?;
            push_token(out, &format!("{f:?}"));
        }
        Base::Bool => {
            let b = v.as_bool().ok_or_else(|| format!("expected a bool, got {}", show(v)))?;
            push_token(out, if b { "1" } else { "0" });
        }
        Base::Str => {
            let s = v.as_str().ok_or_else(|| format!("expected a string, got {}", show(v)))?;
            push_token(out, &hex(s));
        }
    }
    Ok(())
}

/// Decodes the harness output (the text after the marker) into a JSON value.
pub fn decode_result(ty: Type, text: &str) -> Result<Value, String> {
    let mut tokens = text.split_ascii_whitespace();
    let value = decode_value(ty, &mut tokens)?;
    if tokens.next().is_some() {
        return Err("unexpected data after the result".into());
    }
    Ok(value)
}

type Tokens<'a> = std::str::SplitAsciiWhitespace<'a>;

fn decode_value(ty: Type, tokens: &mut Tokens<'_>) -> Result<Value, String> {
    if ty.dims > 0 {
        let n: usize = next_token(tokens)?.parse().map_err(|_| "bad array length".to_string())?;
        // Never trust the length for pre-allocation: the loop fails once tokens run out.
        let mut items = Vec::with_capacity(n.min(1 << 16));
        for _ in 0..n {
            items.push(decode_value(ty.element(), tokens)?);
        }
        return Ok(Value::Array(items));
    }
    let tok = next_token(tokens)?;
    Ok(match ty.base {
        Base::Int => {
            let n: i64 = tok.parse().map_err(|_| format!("bad int `{tok}`"))?;
            if i32::try_from(n).is_err() {
                return Err(format!("int out of range: {n}"));
            }
            Value::from(n)
        }
        Base::Long => Value::from(tok.parse::<i64>().map_err(|_| format!("bad long `{tok}`"))?),
        Base::Double => {
            let f: f64 = tok.parse().map_err(|_| format!("bad double `{tok}`"))?;
            Value::Number(Number::from_f64(f).ok_or_else(|| format!("non-finite double `{tok}`"))?)
        }
        Base::Bool => match tok {
            "0" => Value::Bool(false),
            "1" => Value::Bool(true),
            _ => return Err(format!("bad bool `{tok}`")),
        },
        Base::Str => Value::String(unhex(tok)?),
    })
}

fn next_token<'a>(tokens: &mut Tokens<'a>) -> Result<&'a str, String> {
    tokens.next().ok_or_else(|| "the result ended unexpectedly".to_string())
}

fn push_token(out: &mut String, token: &str) {
    if !out.is_empty() {
        out.push(' ');
    }
    out.push_str(token);
}

fn hex(s: &str) -> String {
    if s.is_empty() {
        return "-".to_string();
    }
    let mut out = String::with_capacity(s.len() * 2);
    for b in s.bytes() {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 15) as usize] as char);
    }
    out
}

fn unhex(tok: &str) -> Result<String, String> {
    if tok == "-" {
        return Ok(String::new());
    }
    let b = tok.as_bytes();
    if b.len() % 2 != 0 {
        return Err("bad string encoding".into());
    }
    let mut bytes = Vec::with_capacity(b.len() / 2);
    for pair in b.chunks_exact(2) {
        bytes.push((nibble(pair[0])? << 4) | nibble(pair[1])?);
    }
    String::from_utf8(bytes).map_err(|_| "the string result is not valid UTF-8".to_string())
}

fn nibble(c: u8) -> Result<u8, String> {
    match c {
        b'0'..=b'9' => Ok(c - b'0'),
        b'a'..=b'f' => Ok(c - b'a' + 10),
        b'A'..=b'F' => Ok(c - b'A' + 10),
        _ => Err("bad string encoding".to_string()),
    }
}

/// Short rendering of a JSON value for error messages.
fn show(v: &Value) -> String {
    let s = v.to_string();
    if s.chars().count() > 40 {
        let head: String = s.chars().take(40).collect();
        format!("{head}…")
    } else {
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::function::types::Param;

    fn sig(params: &[(&str, &str)], ret: &str) -> Signature {
        Signature {
            name: "solve".into(),
            params: params
                .iter()
                .map(|(n, t)| Param { name: (*n).into(), ty: t.parse().unwrap() })
                .collect(),
            return_type: ret.parse().unwrap(),
        }
    }

    #[test]
    fn encodes_scalars_arrays_and_strings() {
        let s = sig(&[("a", "int"), ("xs", "long[]"), ("m", "int[][]"), ("t", "string"), ("e", "string"), ("f", "bool"), ("d", "double")], "int");
        let got = encode_args(&s, r#"[-7, [1, 2], [[1], [], [2, 3]], "hé", "", true, 2.5]"#).unwrap();
        assert_eq!(got, "-7 2 1 2 3 1 1 0 2 2 3 68c3a9 - 1 2.5\n");
    }

    #[test]
    fn rejects_mismatches_with_a_useful_message() {
        let s = sig(&[("a", "int"), ("b", "int")], "int");
        assert!(encode_args(&s, "[1]").unwrap_err().contains("1 argument"));
        assert!(encode_args(&s, "{}").is_err());
        assert!(encode_args(&s, "not json").unwrap_err().contains("valid JSON"));
        assert!(encode_args(&s, "[1, 2.5]").unwrap_err().contains("argument 2"));
        assert!(encode_args(&s, "[1, 3000000000]").is_err(), "does not fit into int");
        assert!(encode_args(&sig(&[("xs", "int[]")], "int"), r#"[[1, "x"]]"#).unwrap_err().contains("[1]"));
        assert_eq!(encode_args(&sig(&[], "int"), "[]").unwrap(), "\n");
    }

    #[test]
    fn expected_values_are_checked_against_the_return_type() {
        let ty: Type = "int[]".parse().unwrap();
        assert!(parse_expected(ty, "[0, 1]").is_ok());
        assert!(parse_expected(ty, "5").is_err());
        assert!(parse_expected(ty, "[0, true]").is_err());
    }

    #[test]
    fn decodes_what_it_encodes() {
        let cases: &[(&str, &str)] = &[
            ("int", "42"),
            ("long", "-9000000000"),
            ("double", "0.1"),
            ("bool", "true"),
            ("string", "\"naïve ✓\""),
            ("string", "\"\""),
            ("int[]", "[3, 1, 2]"),
            ("string[]", "[\"a\", \"\", \"b c\"]"),
            ("int[][]", "[[1], [], [2, 3]]"),
            ("bool[]", "[]"),
        ];
        for (ty, json) in cases {
            let ty: Type = ty.parse().unwrap();
            let value: Value = serde_json::from_str(json).unwrap();
            let mut tokens = String::new();
            encode_value(ty, &value, &mut tokens).unwrap();
            assert_eq!(decode_result(ty, &format!("\n{tokens}\n")).unwrap(), value, "{ty} {json}");
        }
    }

    #[test]
    fn rejects_malformed_results() {
        let int: Type = "int".parse().unwrap();
        let arr: Type = "int[]".parse().unwrap();
        assert!(decode_result(int, "").is_err());
        assert!(decode_result(int, "abc").is_err());
        assert!(decode_result(int, "1 2").is_err());
        assert!(decode_result(int, "3000000000").is_err());
        assert!(decode_result(arr, "3 1 2").is_err(), "fewer elements than announced");
        assert!(decode_result(arr, "99999999999 1").is_err());
        assert!(decode_result("double".parse().unwrap(), "inf").is_err());
        assert!(decode_result("bool".parse().unwrap(), "2").is_err());
        assert!(decode_result("string".parse().unwrap(), "zz").is_err());
        assert!(decode_result("string".parse().unwrap(), "ff").is_err(), "invalid UTF-8");
    }
}
