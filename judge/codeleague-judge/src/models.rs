//! Wire types shared between the Go backend and this service.

use serde::{Deserialize, Serialize};

use crate::runner::language::Language;

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

/// How the program output is compared with the expected output.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompareMode {
    /// Byte-for-byte equality.
    Exact,
    /// Ignores `\r`, trailing whitespace on every line and trailing blank lines.
    #[default]
    TrimTrailing,
    /// Compares whitespace-separated tokens only.
    Tokens,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TestCase {
    /// Fed to the program's stdin.
    pub input: String,
    pub expected_output: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct JudgeRequest {
    pub language: Language,
    pub source_code: String,
    pub tests: Vec<TestCase>,
    /// CPU time limit per test, in milliseconds.
    pub time_limit_ms: u64,
    /// Peak resident memory limit per test, in mebibytes.
    pub memory_limit_mb: u64,
    #[serde(default)]
    pub compare_mode: CompareMode,
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
