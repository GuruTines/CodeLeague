//! HTTP interface (axum) used by the Go backend.
//!
//! * `GET  /healthz`      – liveness
//! * `GET  /v1/languages` – languages and whether their toolchain is installed
//! * `POST /v1/judge`     – compile + run + judge a submission

use std::sync::Arc;

use axum::{
    extract::{DefaultBodyLimit, Request, State},
    http::{header, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use tower_http::{catch_panic::CatchPanicLayer, trace::TraceLayer};

use crate::{
    config::Config,
    error::{Error, Result},
    models::{JudgeRequest, JudgeResponse, LanguageInfo},
    runner::{self, Engine},
};

#[derive(Clone)]
pub struct AppState {
    pub cfg: Arc<Config>,
    pub engine: Arc<Engine>,
}

pub fn router(state: AppState) -> Router {
    let v1 = Router::new()
        .route("/languages", get(languages))
        .route("/judge", post(judge))
        .layer(middleware::from_fn_with_state(state.clone(), require_token));

    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .nest("/v1", v1)
        .layer(DefaultBodyLimit::max(state.cfg.max_request_bytes))
        .layer(CatchPanicLayer::custom(panic_response))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn languages(State(st): State<AppState>) -> Json<Vec<LanguageInfo>> {
    Json(st.engine.languages())
}

async fn judge(State(st): State<AppState>, Json(req): Json<JudgeRequest>) -> Result<Json<JudgeResponse>> {
    runner::validate(&req, &st.cfg)?;
    // Run on a separate task so a panic inside the pipeline becomes a 500 for this
    // request only, and so the job keeps running to completion (and cleans up its
    // workspace and process group) even if the client disconnects.
    let engine = st.engine.clone();
    let resp = tokio::spawn(async move { engine.judge(req).await })
        .await
        .map_err(|e| Error::Internal(format!("judge task failed: {e}")))??;
    Ok(Json(resp))
}

/// Optional bearer-token authentication for `/v1/*`.
async fn require_token(State(st): State<AppState>, req: Request, next: Next) -> Response {
    if let Some(expected) = &st.cfg.api_token {
        let given = req
            .headers()
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "));
        if !given.is_some_and(|g| constant_time_eq(g.as_bytes(), expected.as_bytes())) {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": { "code": "unauthorized", "message": "missing or invalid bearer token" } })),
            )
                .into_response();
        }
    }
    next.run(req).await
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn panic_response(err: Box<dyn std::any::Any + Send + 'static>) -> Response {
    let detail = err
        .downcast_ref::<String>()
        .map(String::as_str)
        .or_else(|| err.downcast_ref::<&str>().copied())
        .unwrap_or("unknown panic");
    tracing::error!(panic = detail, "handler panicked");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({ "error": { "code": "internal_error", "message": "internal judge error" } })),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ct_eq() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"ab"));
    }
}
