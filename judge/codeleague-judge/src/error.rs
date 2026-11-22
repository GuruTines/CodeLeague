use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use serde_json::json;

use crate::sandbox::SandboxError;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// The request is malformed or violates configured limits (HTTP 400).
    #[error("{0}")]
    Validation(String),
    /// The requested language is unknown or its toolchain is not installed (HTTP 422).
    #[error("language `{0}` is not available on this judge")]
    UnsupportedLanguage(String),
    #[error("sandbox failure: {0}")]
    Sandbox(#[from] SandboxError),
    #[error("i/o error: {0}")]
    Io(#[from] std::io::Error),
    #[error("internal error: {0}")]
    Internal(String),
}

impl Error {
    fn parts(&self) -> (StatusCode, &'static str) {
        match self {
            Error::Validation(_) => (StatusCode::BAD_REQUEST, "invalid_request"),
            Error::UnsupportedLanguage(_) => (StatusCode::UNPROCESSABLE_ENTITY, "unsupported_language"),
            Error::Sandbox(_) => (StatusCode::INTERNAL_SERVER_ERROR, "sandbox_error"),
            Error::Io(_) => (StatusCode::INTERNAL_SERVER_ERROR, "io_error"),
            Error::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error"),
        }
    }
}

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let (status, code) = self.parts();
        if status.is_server_error() {
            tracing::error!(error = %self, code, "request failed");
        } else {
            tracing::warn!(error = %self, code, "request rejected");
        }
        // Internal details (paths, errno) are logged, not leaked to the client.
        let message = if status.is_server_error() { "internal judge error".to_string() } else { self.to_string() };
        (status, Json(json!({ "error": { "code": code, "message": message } }))).into_response()
    }
}
