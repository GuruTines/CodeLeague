//! "Function mode": the submission is a single function, not a whole program.
//!
//! A task carries a [`types::Signature`]; its tests carry the arguments as a JSON
//! array (`input`) and the return value as JSON (`expected_output`). For every run
//! the judge
//!
//! 1. encodes the arguments into a flat, whitespace-separated token stream
//!    ([`codec::encode_args`]) that is fed to the program's stdin;
//! 2. wraps the user's code into a generated *harness* ([`harness::render`]) that
//!    reads those tokens, calls the function and prints the returned value after
//!    [`RESULT_MARKER`];
//! 3. decodes whatever follows the marker ([`codec::decode_result`]) and compares
//!    it with the expected JSON value ([`crate::judge::compare::values_equal`]).
//!
//! Everything the user's code prints *before* the marker (debug output) is kept
//! as the run's stdout and has no influence on the verdict.
//!
//! Token format (shared by input and result):
//! * `int`/`long` – decimal; `double` – shortest round-trip decimal;
//!   `bool` – `1`/`0`; `string` – lowercase hex of the UTF-8 bytes (`-` if empty);
//! * `T[]` – the length followed by the elements; `T[][]` – the number of rows,
//!   then every row as `T[]`.

pub mod codec;
pub mod harness;
pub mod types;

/// Printed by the harness right before the encoded return value.
pub const RESULT_MARKER: &str = "@@CL_RESULT@@";

/// Splits captured stdout into what the user's code printed and the raw result
/// (everything after the last marker), if the harness got as far as printing it.
pub fn split_stdout(stdout: &[u8]) -> (&[u8], Option<&[u8]>) {
    let marker = RESULT_MARKER.as_bytes();
    match rfind(stdout, marker) {
        Some(pos) => {
            let mut user = &stdout[..pos];
            // The harness emits "\n" before the marker so it always starts a line.
            if user.last() == Some(&b'\n') {
                user = &user[..user.len() - 1];
            }
            (user, Some(&stdout[pos + marker.len()..]))
        }
        None => (stdout, None),
    }
}

fn rfind(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack.windows(needle.len()).rposition(|w| w == needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_user_output_from_result() {
        let out = b"debug 1\ndebug 2\n@@CL_RESULT@@\n5\n";
        let (user, result) = split_stdout(out);
        assert_eq!(user, b"debug 1\ndebug 2");
        assert_eq!(result.unwrap(), b"\n5\n");
    }

    #[test]
    fn last_marker_wins_and_missing_marker_is_none() {
        let (user, result) = split_stdout(b"@@CL_RESULT@@\n1\n@@CL_RESULT@@\n2\n");
        assert_eq!(user, b"@@CL_RESULT@@\n1");
        assert_eq!(result.unwrap(), b"\n2\n");
        let (user, result) = split_stdout(b"just text");
        assert_eq!(user, b"just text");
        assert!(result.is_none());
    }
}
