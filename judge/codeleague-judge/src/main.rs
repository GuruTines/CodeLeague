use std::sync::Arc;

use codeleague_judge::{
    api::{self, AppState},
    config::Config,
    runner::{language::Toolchain, Engine},
};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> std::process::ExitCode {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,tower_http=info")))
        .init();

    // A panic anywhere must at least leave a trace in the logs.
    std::panic::set_hook(Box::new(|info| tracing::error!(%info, "panic")));

    match serve().await {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(e) => {
            tracing::error!(error = %e, "fatal");
            std::process::ExitCode::FAILURE
        }
    }
}

async fn serve() -> std::io::Result<()> {
    let cfg = Arc::new(Config::from_env());
    tokio::fs::create_dir_all(&cfg.work_root).await?;
    if cfg.api_token.is_none() {
        tracing::warn!("CL_API_TOKEN is not set: the API is unauthenticated, keep it on a private network");
    }

    let toolchain = Toolchain::detect();
    let engine = Arc::new(Engine::new(cfg.clone(), toolchain));
    for l in engine.languages() {
        tracing::info!(language = l.id.as_str(), available = l.available, "toolchain");
    }

    let app = api::router(AppState { cfg: cfg.clone(), engine });
    let listener = tokio::net::TcpListener::bind(cfg.bind).await?;
    tracing::info!(addr = %cfg.bind, work_root = %cfg.work_root.display(), jobs = cfg.max_concurrent_jobs, "listening");
    axum::serve(listener, app).with_graceful_shutdown(shutdown_signal()).await
}

async fn shutdown_signal() {
    use tokio::signal::unix::{signal, SignalKind};
    let mut term = signal(SignalKind::terminate()).expect("SIGTERM handler");
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {}
        _ = term.recv() => {}
    }
    tracing::info!("shutting down");
}
