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

fn req(language: &str, code: &str, tests: Value, tl: u64, ml: u64) -> Value {
    json!({ "language": language, "source_code": code, "tests": tests,
            "time_limit_ms": tl, "memory_limit_mb": ml })
}

fn sum_tests() -> Value {
    json!([{"input": "2 3\n", "expected_output": "5\n"}, {"input": "10 -4\n", "expected_output": "6"}])
}

const C_SUM: &str = r#"#include <stdio.h>
int main(){int a,b;scanf("%d %d",&a,&b);printf("%d\n",a+b);return 0;}"#;

#[tokio::test]
async fn c_accepted() {
    let h = harness(None);
    if !h.has(Language::C) { return; }
    let (st, v) = h.post(req("c", C_SUM, sum_tests(), 1000, 64)).await;
    assert_eq!(st, StatusCode::OK, "{v}");
    assert_eq!(v["verdict"], "ACCEPTED", "{v}");
    assert_eq!(v["passed"], 2);
    assert!(v["memory_kb"].as_u64().unwrap() > 0);
}

#[tokio::test]
async fn c_wrong_answer_stops_at_first_failure() {
    let h = harness(None);
    if !h.has(Language::C) { return; }
    let code = r#"#include <stdio.h>
int main(){printf("0\n");return 0;}"#;
    let (_, v) = h.post(req("c", code, sum_tests(), 1000, 64)).await;
    assert_eq!(v["verdict"], "WRONG_ANSWER");
    assert_eq!(v["tests"].as_array().unwrap().len(), 1);
    assert_eq!(v["total"], 2);
}

#[tokio::test]
async fn c_compilation_error() {
    let h = harness(None);
    if !h.has(Language::C) { return; }
    let (_, v) = h.post(req("c", "int main( { oops", sum_tests(), 1000, 64)).await;
    assert_eq!(v["verdict"], "COMPILATION_ERROR");
    assert!(v["compile_output"].as_str().unwrap().contains("error"));
    assert!(v["tests"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn c_time_limit_exceeded() {
    let h = harness(None);
    if !h.has(Language::C) { return; }
    let code = "int main(){volatile long x=0; for(;;) x++;}";
    let started = std::time::Instant::now();
    let (_, v) = h.post(req("c", code, sum_tests(), 300, 64)).await;
    assert_eq!(v["verdict"], "TIME_LIMIT_EXCEEDED", "{v}");
    assert!(started.elapsed().as_secs() < 10, "watchdog must kill the loop promptly");
}

#[tokio::test]
async fn c_memory_limit_exceeded() {
    let h = harness(None);
    if !h.has(Language::C) { return; }
    let code = r#"#include <stdlib.h>
#include <string.h>
int main(){ for(;;){ char*p=malloc(1<<20); if(!p) return 3; memset(p,1,1<<20);} }"#;
    let (_, v) = h.post(req("c", code, sum_tests(), 3000, 64)).await;
    assert_eq!(v["verdict"], "MEMORY_LIMIT_EXCEEDED", "{v}");
}

#[tokio::test]
async fn c_runtime_error_segfault_and_exit_code() {
    let h = harness(None);
    if !h.has(Language::C) { return; }
    let segv = "int main(){ volatile int*p=0; return *p; }";
    let (_, v) = h.post(req("c", segv, sum_tests(), 1000, 64)).await;
    assert_eq!(v["verdict"], "RUNTIME_ERROR");
    assert_eq!(v["tests"][0]["signal"], 11);

    let (_, v) = h.post(req("c", "int main(){return 7;}", sum_tests(), 1000, 64)).await;
    assert_eq!(v["verdict"], "RUNTIME_ERROR");
    assert_eq!(v["tests"][0]["exit_code"], 7);
}

#[tokio::test]
async fn c_output_flood_is_contained() {
    let h = harness(None);
    if !h.has(Language::C) { return; }
    let code = r#"#include <stdio.h>
int main(){ for(;;) puts("flood flood flood flood flood flood"); }"#;
    let (_, v) = h.post(req("c", code, sum_tests(), 5000, 64)).await;
    assert_eq!(v["verdict"], "RUNTIME_ERROR", "{v}");
    assert!(v["tests"][0]["message"].as_str().unwrap().contains("output"));
    assert!(v["tests"][0]["stdout"].as_str().unwrap().len() < 10_000);
}

#[tokio::test]
async fn c_fork_bomb_does_not_leave_processes_or_hang() {
    let h = harness(None);
    if !h.has(Language::C) { return; }
    let code = r#"#include <unistd.h>
int main(){ for(;;) fork(); }"#;
    let started = std::time::Instant::now();
    let (st, v) = h.post(req("c", code, sum_tests(), 500, 64)).await;
    assert_eq!(st, StatusCode::OK);
    assert_ne!(v["verdict"], "ACCEPTED");
    assert!(started.elapsed().as_secs() < 15);
}

#[tokio::test]
async fn python_accepted_and_runtime_error() {
    let h = harness(None);
    if !h.has(Language::Python) { return; }
    let (_, v) = h.post(req("python", "a,b=map(int,input().split());print(a+b)", sum_tests(), 2000, 128)).await;
    assert_eq!(v["verdict"], "ACCEPTED", "{v}");
    let (_, v) = h.post(req("python", "raise SystemExit(2)", sum_tests(), 2000, 128)).await;
    assert_eq!(v["verdict"], "RUNTIME_ERROR");
    let (_, v) = h.post(req("py", "print(1/0)", sum_tests(), 2000, 128)).await;
    assert_eq!(v["verdict"], "RUNTIME_ERROR");
    assert!(v["tests"][0]["stderr"].as_str().unwrap().contains("ZeroDivisionError"));
}

#[tokio::test]
async fn rust_accepted() {
    // rustup installs under $HOME (unreadable by the sandbox uid); in production install
    // toolchains system-wide. Here we simply run this one test without dropping privileges.
    // The `rustc` on PATH may be a rustup proxy that needs $HOME; use the real binary.
    if let Ok(o) = std::process::Command::new("rustc").arg("--print").arg("sysroot").output() {
        let real = format!("{}/bin/rustc", String::from_utf8_lossy(&o.stdout).trim());
        if std::path::Path::new(&real).is_file() {
            std::env::set_var("CL_RUSTC", real);
        }
    }
    let h = harness_with(None, None);
    if !h.has(Language::Rust) { return; }
    let code = r#"use std::io::Read;
fn main(){ let mut s=String::new(); std::io::stdin().read_to_string(&mut s).unwrap();
 let v:Vec<i64>=s.split_whitespace().map(|x|x.parse().unwrap()).collect(); println!("{}", v[0]+v[1]); }"#;
    let (_, v) = h.post(req("rust", code, sum_tests(), 2000, 128)).await;
    assert_eq!(v["verdict"], "ACCEPTED", "{v}");
}

#[tokio::test]
async fn go_accepted() {
    let h = harness(None);
    if !h.has(Language::Go) { return; }
    let code = r#"package main
import "fmt"
func main(){ var a,b int; fmt.Scan(&a,&b); fmt.Println(a+b) }"#;
    let (_, v) = h.post(req("go", code, sum_tests(), 2000, 256)).await;
    assert_eq!(v["verdict"], "ACCEPTED", "{v}");
}

#[tokio::test]
async fn validation_and_errors() {
    let h = harness(None);
    let (st, v) = h.post(req("c", "", sum_tests(), 1000, 64)).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);
    assert_eq!(v["error"]["code"], "invalid_request");

    let (st, _) = h.post(req("c", "x", json!([]), 1000, 64)).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    let (st, _) = h.post(req("c", "x", sum_tests(), 0, 64)).await;
    assert_eq!(st, StatusCode::BAD_REQUEST);

    // Unknown language is rejected by the JSON extractor.
    let (st, _) = h.post(req("brainfuck", "x", sum_tests(), 1000, 64)).await;
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
