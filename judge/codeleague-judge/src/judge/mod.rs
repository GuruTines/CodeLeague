//! Turns a raw [`RunOutcome`] into a standardized verdict.

pub mod compare;

use std::time::Duration;

use serde_json::Value;

use crate::{
    function::{codec, split_stdout, types::Type},
    models::Verdict,
    sandbox::{RunOutcome, Termination},
};

/// Limits a test was run under (the user-facing ones).
#[derive(Debug, Clone, Copy)]
pub struct JudgeLimits {
    pub cpu_time: Duration,
    pub memory_bytes: u64,
}

/// What the function is expected to return.
#[derive(Debug, Clone, Copy)]
pub struct Expected<'a> {
    pub ty: Type,
    pub value: &'a Value,
}

/// Classifies one run. Order matters: resource violations take precedence over
/// crashes (a program killed for memory is MLE, not a runtime error), and a
/// crash takes precedence over the check of the returned value.
pub fn classify(outcome: &RunOutcome, limits: JudgeLimits, expected: Expected<'_>) -> (Verdict, Option<String>) {
    match outcome.termination {
        Termination::CpuTimeout | Termination::WallTimeout => {
            return (Verdict::TimeLimitExceeded, None);
        }
        Termination::MemoryExceeded => return (Verdict::MemoryLimitExceeded, None),
        Termination::OutputExceeded => {
            return (Verdict::RuntimeError, Some("output limit exceeded".into()));
        }
        Termination::Exited => {}
    }
    if outcome.peak_memory_bytes > limits.memory_bytes {
        return (Verdict::MemoryLimitExceeded, None);
    }
    if let Some(sig) = outcome.signal {
        return (Verdict::RuntimeError, Some(format!("terminated by signal {sig} ({})", signal_name(sig))));
    }
    match outcome.exit_code {
        Some(0) => {}
        Some(code) => return (Verdict::RuntimeError, Some(format!("non-zero exit code {code}"))),
        None => return (Verdict::RuntimeError, Some("abnormal termination".into())),
    }
    // The program exited cleanly: whatever follows the marker is the returned value.
    let Some(raw) = split_stdout(&outcome.stdout).1 else {
        return (
            Verdict::RuntimeError,
            Some("the function did not return a result (did the solution call exit?)".into()),
        );
    };
    let Ok(text) = std::str::from_utf8(raw) else {
        return (Verdict::RuntimeError, Some("the returned value is not valid UTF-8".into()));
    };
    match codec::decode_result(expected.ty, text) {
        Err(e) => (Verdict::RuntimeError, Some(format!("malformed function result: {e}"))),
        Ok(actual) if compare::values_equal(expected.value, &actual) => (Verdict::Accepted, None),
        Ok(_) => (Verdict::WrongAnswer, None),
    }
}

fn signal_name(sig: i32) -> &'static str {
    match sig {
        libc::SIGSEGV => "SIGSEGV",
        libc::SIGABRT => "SIGABRT",
        libc::SIGFPE => "SIGFPE",
        libc::SIGILL => "SIGILL",
        libc::SIGBUS => "SIGBUS",
        libc::SIGKILL => "SIGKILL",
        libc::SIGPIPE => "SIGPIPE",
        libc::SIGXFSZ => "SIGXFSZ",
        libc::SIGTERM => "SIGTERM",
        _ => "unknown",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn outcome(term: Termination, code: Option<i32>, sig: Option<i32>, out: &str, mem_mb: u64) -> RunOutcome {
        RunOutcome {
            stdout: out.as_bytes().to_vec(),
            stderr: vec![],
            exit_code: code,
            signal: sig,
            cpu_time: Duration::from_millis(10),
            wall_time: Duration::from_millis(12),
            peak_memory_bytes: mem_mb << 20,
            termination: term,
        }
    }

    const L: JudgeLimits = JudgeLimits { cpu_time: Duration::from_secs(1), memory_bytes: 64 << 20 };

    /// Output of a harness whose function returned `tokens`, preceded by some debug printing.
    fn returned(tokens: &str) -> String {
        format!("debug output\n@@CL_RESULT@@\n{tokens}\n")
    }

    fn v(o: RunOutcome) -> Verdict {
        let expected = json!(42);
        classify(&o, L, Expected { ty: "int".parse().unwrap(), value: &expected }).0
    }

    #[test]
    fn accepted_and_wrong_answer() {
        assert_eq!(v(outcome(Termination::Exited, Some(0), None, &returned("42"), 5)), Verdict::Accepted);
        assert_eq!(v(outcome(Termination::Exited, Some(0), None, &returned("43"), 5)), Verdict::WrongAnswer);
    }

    #[test]
    fn arrays_and_floats_are_compared_structurally() {
        let o = outcome(Termination::Exited, Some(0), None, &returned("2 1 2"), 5);
        let ty: Type = "int[]".parse().unwrap();
        assert_eq!(classify(&o, L, Expected { ty, value: &json!([1, 2]) }).0, Verdict::Accepted);
        assert_eq!(classify(&o, L, Expected { ty, value: &json!([2, 1]) }).0, Verdict::WrongAnswer);
        let o = outcome(Termination::Exited, Some(0), None, &returned("0.30000000000000004"), 5);
        let ty: Type = "double".parse().unwrap();
        assert_eq!(classify(&o, L, Expected { ty, value: &json!(0.3) }).0, Verdict::Accepted);
    }

    #[test]
    fn a_missing_or_broken_result_is_a_runtime_error() {
        // The solution called exit(0) before the harness printed anything.
        let (verdict, message) = classify(
            &outcome(Termination::Exited, Some(0), None, "42\n", 5),
            L,
            Expected { ty: "int".parse().unwrap(), value: &json!(42) },
        );
        assert_eq!(verdict, Verdict::RuntimeError);
        assert!(message.unwrap().contains("did not return"));
        assert_eq!(v(outcome(Termination::Exited, Some(0), None, &returned("abc"), 5)), Verdict::RuntimeError);
        assert_eq!(v(outcome(Termination::Exited, Some(0), None, &returned("42 43"), 5)), Verdict::RuntimeError);
    }

    #[test]
    fn printing_the_right_number_is_not_enough() {
        // Without the marker the printed "42" is just debug output.
        assert_eq!(v(outcome(Termination::Exited, Some(0), None, "42\n", 5)), Verdict::RuntimeError);
    }

    #[test]
    fn resource_violations_win_over_crashes() {
        assert_eq!(v(outcome(Termination::WallTimeout, None, Some(9), "", 5)), Verdict::TimeLimitExceeded);
        assert_eq!(v(outcome(Termination::CpuTimeout, None, Some(24), "", 5)), Verdict::TimeLimitExceeded);
        assert_eq!(v(outcome(Termination::MemoryExceeded, None, Some(9), "", 70)), Verdict::MemoryLimitExceeded);
        assert_eq!(
            v(outcome(Termination::Exited, Some(0), None, &returned("42"), 70)),
            Verdict::MemoryLimitExceeded
        );
    }

    #[test]
    fn crashes_are_runtime_errors_even_with_a_correct_result() {
        assert_eq!(v(outcome(Termination::Exited, Some(1), None, &returned("42"), 5)), Verdict::RuntimeError);
        assert_eq!(
            v(outcome(Termination::Exited, None, Some(libc::SIGSEGV), &returned("42"), 5)),
            Verdict::RuntimeError
        );
        assert_eq!(v(outcome(Termination::OutputExceeded, None, Some(9), "", 5)), Verdict::RuntimeError);
    }
}
