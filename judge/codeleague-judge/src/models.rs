//! Wire types shared between the Go backend and this service.

use serde::{Deserialize, Serialize};

use crate::{function::types::Signature, runner::language::Language};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Verdict {
    Accepted,
    WrongAnswer,
    TimeLimitExceeded,
    MemoryLimitExceeded,
    RuntimeError,
    CompilationError,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TestCase {
    /// The arguments: a JSON array with one element per parameter of the signature,
    /// e.g. `[[2, 7, 11, 15], 9]`.
    pub input: String,
    /// The expected return value as JSON, e.g. `[0, 1]`.
    pub expected_output: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct JudgeRequest {
    pub language: Language,
    /// The user's code: the function described by `signature` (plus any helpers).
    /// It must not define an entry point of its own; the judge appends one.
    pub source_code: String,
    pub signature: Signature,
    pub tests: Vec<TestCase>,
    /// CPU time limit per test, in milliseconds.
    pub time_limit_ms: u64,
    /// Peak resident memory limit per test, in mebibytes.
    pub memory_limit_mb: u64,
    /// Skip remaining tests after the first non-accepted verdict (default: true).
    #[serde(default = "default_true")]
    pub stop_on_first_failure: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize)]
pub struct TestResult {
    /// Zero-based index into the request's `tests`.
    pub index: usize,
    pub verdict: Verdict,
    /// CPU time (user + system) in milliseconds.
    pub time_ms: u64,
    /// Peak resident set size in kibibytes.
    pub memory_kb: u64,
    pub exit_code: Option<i32>,
    /// Terminating signal number, if the process was killed by one.
    pub signal: Option<i32>,
    /// Captured stdout, truncated to the configured response size.
    pub stdout: String,
    pub stderr: String,
    /// Human-readable detail for non-accepted verdicts.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct JudgeResponse {
    /// Overall verdict: `ACCEPTED` or the first failing test's verdict.
    pub verdict: Verdict,
    pub passed: usize,
    /// Number of tests in the request (executed ones are in `tests`).
    pub total: usize,
    /// Maximum CPU time over executed tests, in milliseconds.
    pub time_ms: u64,
    /// Maximum peak memory over executed tests, in kibibytes.
    pub memory_kb: u64,
    /// Compiler diagnostics when `verdict == COMPILATION_ERROR`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compile_output: Option<String>,
    pub tests: Vec<TestResult>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LanguageInfo {
    pub id: Language,
    pub available: bool,
}
