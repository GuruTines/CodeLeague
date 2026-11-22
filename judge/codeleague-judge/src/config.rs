use std::{env, net::SocketAddr, path::PathBuf, time::Duration};

/// Service configuration, read from `CL_*` environment variables.
#[derive(Debug, Clone)]
pub struct Config {
    pub bind: SocketAddr,
    /// Directory in which per-submission workspaces are created.
    pub work_root: PathBuf,
    /// Maximum number of submissions processed at the same time.
    pub max_concurrent_jobs: usize,
    /// Optional bearer token required on `/v1/*` endpoints.
    pub api_token: Option<String>,
    /// First uid of the pool used to run untrusted code (slot `i` → `base + i`).
    /// `None` disables privilege dropping (default when not running as root).
    pub run_uid_base: Option<u32>,
    /// Fail a run instead of continuing when namespaces can't be created.
    pub require_namespaces: bool,
    pub max_tests: usize,
    pub max_source_bytes: usize,
    pub max_request_bytes: usize,
    pub max_time_limit_ms: u64,
    pub max_memory_limit_mb: u64,
    /// Cap on captured stdout/stderr of one run (exceeding → Runtime Error).
    pub max_output_bytes: usize,
    /// Cap on stdout/stderr echoed back in the API response.
    pub response_output_bytes: usize,
    pub compile_timeout: Duration,
    pub compile_memory_mb: u64,
}

impl Default for Config {
    fn default() -> Self {
        let is_root = unsafe { libc::geteuid() } == 0;
        Self {
            bind: "0.0.0.0:8081".parse().unwrap(),
            work_root: env::temp_dir().join("codeleague-judge"),
            max_concurrent_jobs: std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2),
            api_token: None,
            run_uid_base: is_root.then_some(200_000),
            require_namespaces: false,
            max_tests: 100,
            max_source_bytes: 256 * 1024,
            max_request_bytes: 32 * 1024 * 1024,
            max_time_limit_ms: 30_000,
            max_memory_limit_mb: 2048,
            max_output_bytes: 8 * 1024 * 1024,
            response_output_bytes: 4 * 1024,
            compile_timeout: Duration::from_secs(30),
            compile_memory_mb: 2048,
        }
    }
}

fn var<T: std::str::FromStr>(name: &str) -> Option<T> {
    match env::var(name) {
        Ok(v) => match v.parse() {
            Ok(v) => Some(v),
            Err(_) => {
                tracing::warn!(variable = name, value = %v, "ignoring unparsable environment variable");
                None
            }
        },
        Err(_) => None,
    }
}

impl Config {
    pub fn from_env() -> Self {
        let mut c = Self::default();
        if let Some(v) = var("CL_BIND") { c.bind = v; }
        if let Some(v) = var::<String>("CL_WORK_ROOT") { c.work_root = v.into(); }
        if let Some(v) = var::<usize>("CL_MAX_JOBS") { c.max_concurrent_jobs = v.max(1); }
        c.api_token = env::var("CL_API_TOKEN").ok().filter(|t| !t.is_empty());
        match var::<i64>("CL_RUN_UID_BASE") {
            Some(v) if v <= 0 => c.run_uid_base = None,
            Some(v) => c.run_uid_base = Some(v as u32),
            None => {}
        }
        if let Some(v) = var::<bool>("CL_REQUIRE_NAMESPACES") { c.require_namespaces = v; }
        if let Some(v) = var("CL_MAX_TESTS") { c.max_tests = v; }
        if let Some(v) = var("CL_MAX_SOURCE_BYTES") { c.max_source_bytes = v; }
        if let Some(v) = var("CL_MAX_REQUEST_BYTES") { c.max_request_bytes = v; }
        if let Some(v) = var("CL_MAX_TIME_LIMIT_MS") { c.max_time_limit_ms = v; }
        if let Some(v) = var("CL_MAX_MEMORY_LIMIT_MB") { c.max_memory_limit_mb = v; }
        if let Some(v) = var("CL_MAX_OUTPUT_BYTES") { c.max_output_bytes = v; }
        if let Some(v) = var("CL_RESPONSE_OUTPUT_BYTES") { c.response_output_bytes = v; }
        if let Some(v) = var::<u64>("CL_COMPILE_TIMEOUT_SECS") { c.compile_timeout = Duration::from_secs(v); }
        if let Some(v) = var("CL_COMPILE_MEMORY_MB") { c.compile_memory_mb = v; }
        c
    }
}
