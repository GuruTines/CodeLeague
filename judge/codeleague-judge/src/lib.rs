//! CodeLeague judge: compiles and runs untrusted user code inside a
//! resource-limited sandbox and returns a standardized verdict.
//!
//! Layers (top → bottom):
//! * [`api`]     – axum HTTP interface used by the Go backend
//! * [`runner`]  – per-submission pipeline: workspace → compile → run tests
//! * [`function`] – signatures, argument/result encoding and the generated harness
//! * [`judge`]   – verdict classification and comparison of returned values
//! * [`sandbox`] – process isolation, limits and measurement (Linux only)

#[cfg(not(target_os = "linux"))]
compile_error!("codeleague-judge relies on Linux-specific sandboxing primitives");

pub mod api;
pub mod config;
pub mod error;
pub mod function;
pub mod judge;
pub mod models;
pub mod runner;
pub mod sandbox;
