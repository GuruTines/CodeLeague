//! Turns a raw [`RunOutcome`] into a standardized verdict.

pub mod compare;

use std::time::Duration;

use crate::{
    models::{CompareMode, Verdict},
    sandbox::{RunOutcome, Termination},
};

/// Limits a test was run under (the user-facing ones).
#[derive(Debug, Clone, Copy)]
pub struct JudgeLimits {
    pub cpu_time: Duration,
    pub memory_bytes: u64,
}

/// Classifies one run. Order matters: resource violations take precedence over
/// crashes (a program killed for memory is MLE, not a runtime error), and a
/// crash takes precedence over output comparison.
pub fn classify(
    outcome: &RunOutcome,
    limits: JudgeLimits,
    expected: &[u8],
    mode: CompareMode,
) -> (Verdict, Option<String>) {
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
    if compare::outputs_match(mode, &outcome.stdout, expected) {
        (Verdict::Accepted, None)
    } else {
        (Verdict::WrongAnswer, None)
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

    fn v(o: RunOutcome) -> Verdict {
        classify(&o, L, b"42\n", CompareMode::TrimTrailing).0
    }

    #[test]
    fn accepted_and_wrong_answer() {
        assert_eq!(v(outcome(Termination::Exited, Some(0), None, "42", 5)), Verdict::Accepted);
        assert_eq!(v(outcome(Termination::Exited, Some(0), None, "43", 5)), Verdict::WrongAnswer);
    }

    #[test]
    fn resource_violations_win_over_crashes() {
        assert_eq!(v(outcome(Termination::WallTimeout, None, Some(9), "", 5)), Verdict::TimeLimitExceeded);
        assert_eq!(v(outcome(Termination::CpuTimeout, None, Some(24), "", 5)), Verdict::TimeLimitExceeded);
        assert_eq!(v(outcome(Termination::MemoryExceeded, None, Some(9), "", 70)), Verdict::MemoryLimitExceeded);
        assert_eq!(v(outcome(Termination::Exited, Some(0), None, "42", 70)), Verdict::MemoryLimitExceeded);
    }

    #[test]
    fn crashes_are_runtime_errors_even_with_matching_output() {
        assert_eq!(v(outcome(Termination::Exited, Some(1), None, "42", 5)), Verdict::RuntimeError);
        assert_eq!(v(outcome(Termination::Exited, None, Some(libc::SIGSEGV), "42", 5)), Verdict::RuntimeError);
        assert_eq!(v(outcome(Termination::OutputExceeded, None, Some(9), "", 5)), Verdict::RuntimeError);
    }
}
