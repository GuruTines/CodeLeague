//! End-to-end tests: real compilers, real sandbox, real HTTP router.
//! Tests for a language are skipped (with a notice) when its toolchain is missing.

use std::sync::Arc;

use axum::{body::Body, http::{Request, StatusCode}};
use codeleague_judge::{
    api::{self, AppState},
    config::Config,
    runner::{language::{Language, Toolchain}, Engine},
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

struct Harness {
    app: axum::Router,
    toolchain: Toolchain,
    _dir: tempfile::TempDir,
}

fn harness(token: Option<&str>) -> Harness {
    harness_with(token, Config::default().run_uid_base)
}

fn harness_with(token: Option<&str>, run_uid_base: Option<u32>) -> Harness {
    let dir = tempfile::tempdir().unwrap();
    let cfg = Arc::new(Config {
        work_root: dir.path().to_path_buf(),
        max_concurrent_jobs: 2,
        api_token: token.map(str::to_string),
        run_uid_base,
        ..Config::default()
    });
    let toolchain = Toolchain::detect();
    let engine = Arc::new(Engine::new(cfg.clone(), toolchain.clone()));
    Harness { app: api::router(AppState { cfg, engine }), toolchain, _dir: dir }
}

/// A harness for `lang`, or `None` (with a notice) when its toolchain is missing.
fn harness_for(lang: Language) -> Option<Harness> {
    if lang == Language::Rust {
        // rustup installs under $HOME (unreadable by the sandbox uid); in production install
        // toolchains system-wide. Here we run Rust without dropping privileges, using the real
        // binary instead of the rustup proxy.
        if let Ok(o) = std::process::Command::new("rustc").arg("--print").arg("sysroot").output() {
            let real = format!("{}/bin/rustc", String::from_utf8_lossy(&o.stdout).trim());
            if std::path::Path::new(&real).is_file() {
                std::env::set_var("CL_RUSTC", real);
            }
        }
        let h = harness_with(None, None);
        return h.has(lang).then_some(h);
    }
    let h = harness(None);
    h.has(lang).then_some(h)
}

impl Harness {
    fn has(&self, l: Language) -> bool {
        let ok = self.toolchain.is_available(l);
        if !ok {
            eprintln!("SKIP: {} toolchain not installed", l.as_str());
        }
        ok
    }

    async fn post(&self, body: Value) -> (StatusCode, Value) {
        self.send(Request::post("/v1/judge").header("content-type", "application/json")
            .body(Body::from(body.to_string())).unwrap()).await
    }

    async fn send(&self, req: Request<Body>) -> (StatusCode, Value) {
        let resp = self.app.clone().oneshot(req).await.unwrap();
        let status = resp.status();
        let bytes = resp.into_body().collect().await.unwrap().to_bytes();
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }
}

const ALL: [Language; 5] = [Language::C, Language::Cpp, Language::Python, Language::Rust, Language::Go];

fn signature(params: &[(&str, &str)], ret: &str) -> Value {
    let params: Vec<Value> = params.iter().map(|(n, t)| json!({ "name": n, "type": t })).collect();
    json!({ "name": "solve", "params": params, "return_type": ret })
}

fn sum_signature() -> Value {
    signature(&[("a", "int"), ("b", "int")], "int")
}

fn request(language: &str, code: &str, sig: Value, tests: Value, tl: u64, ml: u64) -> Value {
    json!({ "language": language, "source_code": code, "signature": sig, "tests": tests,
            "time_limit_ms": tl, "memory_limit_mb": ml })
}

/// `solve(a, b) -> int` with the given source.
fn sum_request(language: &str, code: &str, tl: u64, ml: u64) -> Value {
    request(language, code, sum_signature(), sum_tests(), tl, ml)
}

fn sum_tests() -> Value {
    json!([{"input": "[2, 3]", "expected_output": "5"}, {"input": "[10, -4]", "expected_output": "6"}])
}

fn sum_code(lang: Language) -> &'static str {
    match lang {
        Language::C | Language::Cpp => "int solve(int a, int b) { return a + b; }",
        Language::Python => "def solve(a, b):\n    return a + b\n",
        Language::Rust => "fn solve(a: i32, b: i32) -> i32 { a + b }",
        Language::Go => "package main\n\nfunc solve(a, b int) int { return a + b }\n",
    }
}

// ---- one function per language, the same contract everywhere -----------------

#[tokio::test]
async fn sum_is_accepted_in_every_language() {
    for lang in ALL {
        let Some(h) = harness_for(lang) else { continue };
        let (st, v) = h.post(sum_request(lang.as_str(), sum_code(lang), 5000, 256)).await;
        assert_eq!(st, StatusCode::OK, "{lang:?}: {v}");
        assert_eq!(v["verdict"], "ACCEPTED", "{lang:?}: {v}");
        assert_eq!(v["passed"], 2, "{lang:?}");
        assert!(v["memory_kb"].as_u64().unwrap() > 0, "{lang:?}");
    }
}

fn two_sum_code(lang: Language) -> &'static str {
    match lang {
        Language::C => r#"#include <stdlib.h>
int* solve(int* nums, int nums_size, int target, int* return_size) {
    int* r = malloc(2 * sizeof(int));
    *return_size = 2;
    for (int i = 0; i < nums_size; i++)
        for (int j = i + 1; j < nums_size; j++)
            if (nums[i] + nums[j] == target) { r[0] = i; r[1] = j; return r; }
    *return_size = 0;
    return r;
}"#,
        Language::Cpp => r#"#include <vector>
std::vector<int> solve(std::vector<int>& nums, int target) {
    for (size_t i = 0; i < nums.size(); i++)
        for (size_t j = i + 1; j < nums.size(); j++)
            if (nums[i] + nums[j] == target) return {(int)i, (int)j};
    return {};
}"#,
        Language::Python => "def solve(nums, target):\n    for i in range(len(nums)):\n        for j in range(i + 1, len(nums)):\n            if nums[i] + nums[j] == target:\n                return [i, j]\n    return []\n",
        Language::Rust => r#"fn solve(nums: Vec<i32>, target: i32) -> Vec<i32> {
    for i in 0..nums.len() {
        for j in i + 1..nums.len() {
            if nums[i] + nums[j] == target { return vec![i as i32, j as i32]; }
        }
    }
    vec![]
}"#,
        Language::Go => r#"package main

func solve(nums []int, target int) []int {
	for i := range nums {
		for j := i + 1; j < len(nums); j++ {
			if nums[i]+nums[j] == target {
				return []int{i, j}
			}
		}
	}
	return []int{}
}
"#,
    }
}

fn shout_code(lang: Language) -> &'static str {
    match lang {
        Language::C => r#"#include <stdlib.h>
#include <string.h>
char** solve(char** words, int words_size, char* suffix, int* return_size) {
    char** r = malloc(sizeof(char*) * (words_size > 0 ? words_size : 1));
    for (int i = 0; i < words_size; i++) {
        r[i] = malloc(strlen(words[i]) + strlen(suffix) + 1);
        strcpy(r[i], words[i]);
        strcat(r[i], suffix);
    }
    *return_size = words_size;
    return r;
}"#,
        Language::Cpp => r#"#include <string>
#include <vector>
std::vector<std::string> solve(std::vector<std::string>& words, std::string suffix) {
    for (auto& w : words) w += suffix;
    return words;
}"#,
        Language::Python => "def solve(words, suffix):\n    return [w + suffix for w in words]\n",
        Language::Rust => "fn solve(words: Vec<String>, suffix: String) -> Vec<String> {\n    words.into_iter().map(|w| w + &suffix).collect()\n}",
        Language::Go => r#"package main

func solve(words []string, suffix string) []string {
	out := make([]string, len(words))
	for i, w := range words {
		out[i] = w + suffix
	}
	return out
}
"#,
    }
}

fn is_balanced_code(lang: Language) -> &'static str {
    match lang {
        Language::C => r#"#include <stdbool.h>
bool solve(int** grid, int grid_size, int* grid_cols, double ratio) {
    long long s = 0;
    for (int i = 0; i < grid_size; i++)
        for (int j = 0; j < grid_cols[i]; j++) s += grid[i][j];
    return s * ratio > 10;
}"#,
        Language::Cpp => r#"#include <vector>
bool solve(std::vector<std::vector<int>>& grid, double ratio) {
    long long s = 0;
    for (auto& row : grid) for (int x : row) s += x;
    return s * ratio > 10;
}"#,
        Language::Python => "def solve(grid, ratio):\n    return sum(sum(r) for r in grid) * ratio > 10\n",
        Language::Rust => "fn solve(grid: Vec<Vec<i32>>, ratio: f64) -> bool {\n    grid.iter().flatten().map(|&x| x as f64).sum::<f64>() * ratio > 10.0\n}",
        Language::Go => r#"package main

func solve(grid [][]int, ratio float64) bool {
	s := 0
	for _, row := range grid {
		for _, x := range row {
			s += x
		}
	}
	return float64(s)*ratio > 10
}
"#,
    }
}

#[tokio::test]
async fn arrays_strings_and_matrices_in_every_language() {
    let cases: [(&str, Value, Value, fn(Language) -> &'static str); 3] = [
        (
            "two_sum",
            signature(&[("nums", "int[]"), ("target", "int")], "int[]"),
            json!([
                {"input": "[[2, 7, 11, 15], 9]", "expected_output": "[0, 1]"},
                {"input": "[[3, 2, 4], 6]", "expected_output": "[1,2]"},
                {"input": "[[3, 3], 6]", "expected_output": "[0, 1]"},
                {"input": "[[], 1]", "expected_output": "[]"}
            ]),
            two_sum_code,
        ),
        (
            "shout",
            signature(&[("words", "string[]"), ("suffix", "string")], "string[]"),
            json!([
                {"input": "[[\"héllo\", \"wörld\", \"\"], \"!\"]", "expected_output": "[\"héllo!\", \"wörld!\", \"!\"]"},
                {"input": "[[], \"x\"]", "expected_output": "[]"}
            ]),
            shout_code,
        ),
        (
            "is_balanced",
            signature(&[("grid", "int[][]"), ("ratio", "double")], "bool"),
            json!([
                {"input": "[[[1, 2], [3]], 2.5]", "expected_output": "true"},
                {"input": "[[[1], []], 0.5]", "expected_output": "false"},
                {"input": "[[], 3.0]", "expected_output": "false"}
            ]),
            is_balanced_code,
        ),
    ];
    for lang in ALL {
        let Some(h) = harness_for(lang) else { continue };
        for (name, sig, tests, code) in &cases {
            let (st, v) = h.post(request(lang.as_str(), code(lang), sig.clone(), tests.clone(), 5000, 256)).await;
            assert_eq!(st, StatusCode::OK, "{lang:?}/{name}: {v}");
            assert_eq!(v["verdict"], "ACCEPTED", "{lang:?}/{name}: {v}");
            assert_eq!(v["passed"], v["total"], "{lang:?}/{name}: {v}");
        }
    }
}

#[tokio::test]
async fn zero_parameters_and_a_non_default_function_name() {
    let Some(h) = harness_for(Language::Python) else { return };
    let sig = json!({ "name": "answer", "params": [], "return_type": "long" });
    let tests = json!([{"input": "[]", "expected_output": "9000000000"}]);
    let (_, v) = h.post(request("python", "def answer():\n    return 9_000_000_000\n", sig, tests, 2000, 128)).await;
    assert_eq!(v["verdict"], "ACCEPTED", "{v}");
}

// ---- verdicts ------------------------------------------------------------------

#[tokio::test]
async fn wrong_answer_stops_at_first_failure() {
    let Some(h) = harness_for(Language::C) else { return };
    let (_, v) = h.post(sum_request("c", "int solve(int a, int b) { return 0; }", 1000, 64)).await;
    assert_eq!(v["verdict"], "WRONG_ANSWER");
    assert_eq!(v["tests"].as_array().unwrap().len(), 1);
    assert_eq!(v["total"], 2);
}

#[tokio::test]
async fn floats_are_compared_with_a_tolerance() {
    let Some(h) = harness_for(Language::Python) else { return };
    let sig = signature(&[("a", "double"), ("b", "double")], "double");
    let tests = json!([{"input": "[0.1, 0.2]", "expected_output": "0.3"}]);
    let (_, v) = h.post(request("python", "def solve(a, b):\n    return a + b\n", sig, tests, 2000, 128)).await;
    assert_eq!(v["verdict"], "ACCEPTED", "{v}");
}

#[tokio::test]
async fn compilation_errors_are_reported() {
    let Some(h) = harness_for(Language::C) else { return };
    let (_, v) = h.post(sum_request("c", "int solve( { oops", 1000, 64)).await;
    assert_eq!(v["verdict"], "COMPILATION_ERROR");
    assert!(v["compile_output"].as_str().unwrap().contains("error"));
    assert!(v["tests"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn a_function_that_does_not_match_the_signature_does_not_compile() {
    let Some(h) = harness_for(Language::Cpp) else { return };
    // The signature declares two parameters; the harness calls solve(a, b).
    let (_, v) = h.post(sum_request("cpp", "int solve(int a) { return a; }", 1000, 64)).await;
    assert_eq!(v["verdict"], "COMPILATION_ERROR", "{v}");
}

#[tokio::test]
async fn debug_output_is_kept_but_does_not_affect_the_verdict() {
    let Some(h) = harness_for(Language::Python) else { return };
    let code = "def solve(a, b):\n    print('debug', a, b)\n    return a + b\n";
    let (_, v) = h.post(sum_request("python", code, 2000, 128)).await;
    assert_eq!(v["verdict"], "ACCEPTED", "{v}");
    assert_eq!(v["tests"][0]["stdout"], "debug 2 3");
}

#[tokio::test]
async fn exiting_before_returning_is_a_runtime_error() {
    let Some(h) = harness_for(Language::Python) else { return };
    // Printing the right number and exiting cleanly must not count as an answer.
    let code = "import sys\ndef solve(a, b):\n    print(a + b)\n    sys.exit(0)\n";
    let (_, v) = h.post(sum_request("python", code, 2000, 128)).await;
    assert_eq!(v["verdict"], "RUNTIME_ERROR", "{v}");
    assert!(v["tests"][0]["message"].as_str().unwrap().contains("did not return"));
}

#[tokio::test]
async fn returning_a_value_of_the_wrong_type_is_a_runtime_error() {
    let Some(h) = harness_for(Language::Python) else { return };
    let (_, v) = h.post(sum_request("python", "def solve(a, b):\n    return 'five'\n", 2000, 128)).await;
    assert_eq!(v["verdict"], "RUNTIME_ERROR", "{v}");
    assert!(v["tests"][0]["stderr"].as_str().unwrap().contains("TypeError"));
}

#[tokio::test]
async fn python_exceptions_are_runtime_errors() {
    let Some(h) = harness_for(Language::Python) else { return };
    let (_, v) = h.post(sum_request("py", "def solve(a, b):\n    return a // 0\n", 2000, 128)).await;
    assert_eq!(v["verdict"], "RUNTIME_ERROR");
    assert!(v["tests"][0]["stderr"].as_str().unwrap().contains("ZeroDivisionError"));
}

#[tokio::test]
async fn time_limit_exceeded() {
    let Some(h) = harness_for(Language::C) else { return };
    let code = "int solve(int a, int b) { volatile long x = 0; for (;;) x++; return 0; }";
    let started = std::time::Instant::now();
    let (_, v) = h.post(sum_request("c", code, 300, 64)).await;
    assert_eq!(v["verdict"], "TIME_LIMIT_EXCEEDED", "{v}");
    assert!(started.elapsed().as_secs() < 10, "watchdog must kill the loop promptly");
}

#[tokio::test]
async fn memory_limit_exceeded() {
    let Some(h) = harness_for(Language::C) else { return };
    let code = r#"#include <stdlib.h>
#include <string.h>
int solve(int a, int b) { for (;;) { char* p = malloc(1 << 20); if (!p) return 3; memset(p, 1, 1 << 20); } }"#;
    let (_, v) = h.post(sum_request("c", code, 3000, 64)).await;
    assert_eq!(v["verdict"], "MEMORY_LIMIT_EXCEEDED", "{v}");
}

#[tokio::test]
async fn crashes_and_exit_codes_are_runtime_errors() {
    let Some(h) = harness_for(Language::C) else { return };
    let segv = "int solve(int a, int b) { volatile int* p = 0; return *p; }";
    let (_, v) = h.post(sum_request("c", segv, 1000, 64)).await;
    assert_eq!(v["verdict"], "RUNTIME_ERROR");
    assert_eq!(v["tests"][0]["signal"], 11);

    let exit7 = "#include <stdlib.h>\nint solve(int a, int b) { exit(7); return 0; }";
    let (_, v) = h.post(sum_request("c", exit7, 1000, 64)).await;
    assert_eq!(v["verdict"], "RUNTIME_ERROR");
    assert_eq!(v["tests"][0]["exit_code"], 7);
}

#[tokio::test]
async fn output_flood_is_contained() {
    let Some(h) = harness_for(Language::C) else { return };
    let code = r#"#include <stdio.h>
int solve(int a, int b) { for (;;) puts("flood flood flood flood flood flood"); }"#;
    let (_, v) = h.post(sum_request("c", code, 5000, 64)).await;
    assert_eq!(v["verdict"], "RUNTIME_ERROR", "{v}");
    assert!(v["tests"][0]["message"].as_str().unwrap().contains("output"));
    assert!(v["tests"][0]["stdout"].as_str().unwrap().len() < 10_000);
}

#[tokio::test]
async fn fork_bomb_does_not_leave_processes_or_hang() {
    let Some(h) = harness_for(Language::C) else { return };
    let code = "#include <unistd.h>\nint solve(int a, int b) { for (;;) fork(); }";
    let started = std::time::Instant::now();
    let (st, v) = h.post(sum_request("c", code, 500, 64)).await;
    assert_eq!(st, StatusCode::OK);
    assert_ne!(v["verdict"], "ACCEPTED");
    assert!(started.elapsed().as_secs() < 15);
}

// ---- request validation -----------------------------------------------------------

#[tokio::test]
async fn validation_and_errors() {
    let h = harness(None);
    let (st, v) = h.post(sum_request("c", "", 1000, 64)).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(v["error"]["code"], "invalid_request");

    let (st, _) = h.post(request("c", "x", sum_signature(), json!([]), 1000, 64)).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    let (st, _) = h.post(sum_request("c", "x", 0, 64)).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // Unknown language is rejected by the JSON extractor.
    let (st, _) = h.post(sum_request("brainfuck", "x", 1000, 64)).await;
    assert!(st.is_client_error());
}

#[tokio::test]
async fn the_signature_and_the_tests_are_validated_before_anything_runs() {
    let h = harness(None);
    let code = "int solve(int a, int b) { return a + b; }";

    // Names end up in generated code, so they must be plain identifiers.
    let evil = json!({ "name": "solve(); system(\"x\")", "params": [], "return_type": "int" });
    let (st, v) = h.post(request("c", code, evil, sum_tests(), 1000, 64)).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert!(v["error"]["message"].as_str().unwrap().contains("signature"), "{v}");

    // Unsupported type.
    let (st, _) = h.post(request("c", code, signature(&[("a", "float")], "int"), sum_tests(), 1000, 64)).await;
    assert!(st.is_client_error());

    // Wrong number of arguments in test 2.
    let tests = json!([{"input": "[1, 2]", "expected_output": "3"}, {"input": "[1]", "expected_output": "1"}]);
    let (st, v) = h.post(request("c", code, sum_signature(), tests, 1000, 64)).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert!(v["error"]["message"].as_str().unwrap().contains("test 2"), "{v}");

    // Expected value that does not fit the return type.
    let tests = json!([{"input": "[1, 2]", "expected_output": "\"three\""}]);
    let (st, v) = h.post(request("c", code, sum_signature(), tests, 1000, 64)).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert!(v["error"]["message"].as_str().unwrap().contains("expected_output"), "{v}");

    // Missing signature entirely.
    let body = json!({ "language": "c", "source_code": code, "tests": sum_tests(), "time_limit_ms": 1000, "memory_limit_mb": 64 });
    let (st, _) = h.post(body).await;
    assert!(st.is_client_error());
}

#[tokio::test]
async fn bearer_token_is_enforced() {
    let h = harness(Some("s3cret"));
    let (st, _) = h.send(Request::get("/v1/languages").body(Body::empty()).unwrap()).await;
    assert_eq!(st, StatusCode::UNAUTHORIZED);
    let (st, v) = h.send(Request::get("/v1/languages").header("authorization", "Bearer s3cret")
        .body(Body::empty()).unwrap()).await;
    assert_eq!(st, StatusCode::OK);
    assert!(v.as_array().unwrap().iter().any(|l| l["id"] == "python"));
    // Health stays open for orchestrators.
    let (st, _) = h.send(Request::get("/healthz").body(Body::empty()).unwrap()).await;
    assert_eq!(st, StatusCode::OK);
}
