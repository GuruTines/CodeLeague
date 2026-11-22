//! Per-submission pipeline: workspace → compile → run every test → verdicts.

pub mod language;

use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use tokio::sync::Semaphore;

use crate::{
    config::Config,
    error::{Error, Result},
    judge::{classify, JudgeLimits},
    models::{JudgeRequest, JudgeResponse, LanguageInfo, TestResult, Verdict},
    sandbox::{self, Isolation, Limits, RunOutcome, RunSpec, Termination},
};
use language::{Language, Toolchain};

/// Cap on compiler diagnostics returned to the client.
const COMPILE_OUTPUT_LIMIT: usize = 16 * 1024;

pub struct Engine {
    cfg: Arc<Config>,
    toolchain: Toolchain,
    permits: Semaphore,
    /// Free sandbox slots; each slot maps to its own uid so concurrent jobs
    /// can't read each other's files or exhaust each other's `RLIMIT_NPROC`.
    slots: Mutex<Vec<usize>>,
    namespaces: bool,
}

struct SlotGuard<'a> {
    engine: &'a Engine,
    slot: usize,
}

impl Drop for SlotGuard<'_> {
    fn drop(&mut self) {
        self.engine.slots.lock().unwrap_or_else(|e| e.into_inner()).push(self.slot);
    }
}

impl Engine {
    pub fn new(cfg: Arc<Config>, toolchain: Toolchain) -> Self {
        let namespaces = sandbox::probe_namespaces();
        if !namespaces {
            if cfg.require_namespaces {
                tracing::error!("namespaces unavailable but CL_REQUIRE_NAMESPACES=true: every run will fail");
            } else {
                tracing::warn!("cannot create network/IPC/UTS namespaces: user code will share the host network");
            }
        }
        if cfg.run_uid_base.is_none() {
            tracing::warn!("privilege dropping disabled (not root or CL_RUN_UID_BASE<=0): user code runs as the service user");
        }
        let n = cfg.max_concurrent_jobs.max(1);
        Self {
            permits: Semaphore::new(n),
            slots: Mutex::new((0..n).rev().collect()),
            cfg,
            toolchain,
            namespaces,
        }
    }

    pub fn languages(&self) -> Vec<LanguageInfo> {
        Language::ALL
            .iter()
            .map(|&id| LanguageInfo { id, available: self.toolchain.is_available(id) })
            .collect()
    }

    pub fn is_language_available(&self, lang: Language) -> bool {
        self.toolchain.is_available(lang)
    }

    /// Judges a submission. Request must already have passed [`validate`].
    pub async fn judge(&self, req: JudgeRequest) -> Result<JudgeResponse> {
        if !self.toolchain.is_available(req.language) {
            return Err(Error::UnsupportedLanguage(req.language.as_str().into()));
        }
        let _permit = self
            .permits
            .acquire()
            .await
            .map_err(|_| Error::Internal("job semaphore closed".into()))?;
        let slot = self
            .slots
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .pop()
            .ok_or_else(|| Error::Internal("no free sandbox slot".into()))?;
        let _slot = SlotGuard { engine: self, slot };

        let ids = self.cfg.run_uid_base.map(|base| base + slot as u32);
        let isolation = Isolation {
            uid: ids,
            gid: ids,
            namespaces: self.namespaces,
            require_namespaces: self.cfg.require_namespaces,
        };
        let ws = Workspace::create(&self.cfg.work_root, ids).await?;
        let go_cache = self.cfg.work_root.join(".cache").join(format!("slot-{slot}"));
        if req.language == Language::Go {
            prepare_dir(&go_cache, ids)?;
        }
        let env = self.toolchain.env(req.language, ws.path(), &go_cache);

        tokio::fs::write(ws.path().join(req.language.source_file()), &req.source_code).await?;
        chown_opt(&ws.path().join(req.language.source_file()), ids)?;

        let mut response = JudgeResponse {
            verdict: Verdict::Accepted,
            passed: 0,
            total: req.tests.len(),
            time_ms: 0,
            memory_kb: 0,
            compile_output: None,
            tests: Vec::with_capacity(req.tests.len()),
        };

        // ---- compile ------------------------------------------------------
        if let Some(cmd) = self.toolchain.compile_command(req.language) {
            let outcome = sandbox::run(RunSpec {
                program: cmd.program,
                args: cmd.args,
                cwd: ws.path().to_path_buf(),
                env: env.clone(),
                stdin: Vec::new(),
                limits: self.compile_limits(),
                isolation: isolation.clone(),
            })
            .await?;
            if !outcome.success() {
                tracing::info!(language = req.language.as_str(), "compilation failed");
                response.verdict = Verdict::CompilationError;
                response.compile_output = Some(compile_message(&outcome));
                return Ok(response);
            }
        }

        // ---- run tests ----------------------------------------------------
        let run_cmd = self
            .toolchain
            .run_command(req.language, ws.path())
            .ok_or_else(|| Error::UnsupportedLanguage(req.language.as_str().into()))?;
        let limits = self.run_limits(&req);
        let judge_limits = JudgeLimits {
            cpu_time: limits.cpu_time,
            memory_bytes: limits.memory_bytes,
        };

        for (index, test) in req.tests.iter().enumerate() {
            // Fresh cwd per test: nothing a run leaves behind is visible to the next one.
            let cwd = ws.path().join(format!("run-{index}"));
            prepare_dir(&cwd, ids)?;
            let outcome = sandbox::run(RunSpec {
                program: run_cmd.program.clone(),
                args: run_cmd.args.clone(),
                cwd: cwd.clone(),
                env: env.clone(),
                stdin: test.input.clone().into_bytes(),
                limits: limits.clone(),
                isolation: isolation.clone(),
            })
            .await?;
            let _ = tokio::fs::remove_dir_all(&cwd).await;

            let (verdict, message) =
                classify(&outcome, judge_limits, test.expected_output.as_bytes(), req.compare_mode);
            let result = self.test_result(index, verdict, message, &outcome);
            response.time_ms = response.time_ms.max(result.time_ms);
            response.memory_kb = response.memory_kb.max(result.memory_kb);
            if verdict == Verdict::Accepted {
                response.passed += 1;
            } else if response.verdict == Verdict::Accepted {
                response.verdict = verdict;
            }
            response.tests.push(result);
            if verdict != Verdict::Accepted && req.stop_on_first_failure {
                break;
            }
        }
        tracing::info!(
            language = req.language.as_str(),
            verdict = ?response.verdict,
            passed = response.passed,
            total = response.total,
            time_ms = response.time_ms,
            memory_kb = response.memory_kb,
            "judged"
        );
        Ok(response)
    }

    fn compile_limits(&self) -> Limits {
        Limits {
            cpu_time: self.cfg.compile_timeout,
            wall_time: self.cfg.compile_timeout + Duration::from_secs(5),
            memory_bytes: self.cfg.compile_memory_mb << 20,
            address_space_bytes: None,
            output_bytes: 1 << 20,
            file_size_bytes: 256 << 20,
            max_open_files: 1024,
            max_processes: 1024,
            stack_bytes: 64 << 20,
        }
    }

    fn run_limits(&self, req: &JudgeRequest) -> Limits {
        let cpu = Duration::from_millis(req.time_limit_ms);
        let memory = req.memory_limit_mb << 20;
        Limits {
            cpu_time: cpu,
            // Generous enough for scheduling noise, tight enough to stop sleepers.
            wall_time: cpu * 2 + Duration::from_millis(500),
            memory_bytes: memory,
            // Backstop only: the /proc watchdog enforces the real limit.
            address_space_bytes: req
                .language
                .supports_address_space_limit()
                .then(|| memory * 2 + (256 << 20)),
            output_bytes: self.cfg.max_output_bytes,
            file_size_bytes: self.cfg.max_output_bytes as u64,
            max_open_files: 64,
            max_processes: 128,
            stack_bytes: memory.min(512 << 20),
        }
    }

    fn test_result(&self, index: usize, verdict: Verdict, message: Option<String>, o: &RunOutcome) -> TestResult {
        let cap = self.cfg.response_output_bytes;
        TestResult {
            index,
            verdict,
            time_ms: o.cpu_time.as_millis() as u64,
            memory_kb: o.peak_memory_bytes / 1024,
            exit_code: o.exit_code,
            signal: o.signal,
            stdout: lossy_truncate(&o.stdout, cap),
            stderr: lossy_truncate(&o.stderr, cap),
            message,
        }
    }
}

/// Request validation against configured limits.
pub fn validate(req: &JudgeRequest, cfg: &Config) -> Result<()> {
    let bad = |m: String| Err(Error::Validation(m));
    if req.source_code.trim().is_empty() {
        return bad("source_code must not be empty".into());
    }
    if req.source_code.len() > cfg.max_source_bytes {
        return bad(format!("source_code exceeds {} bytes", cfg.max_source_bytes));
    }
    if req.tests.is_empty() {
        return bad("at least one test is required".into());
    }
    if req.tests.len() > cfg.max_tests {
        return bad(format!("at most {} tests are allowed", cfg.max_tests));
    }
    if !(1..=cfg.max_time_limit_ms).contains(&req.time_limit_ms) {
        return bad(format!("time_limit_ms must be in 1..={}", cfg.max_time_limit_ms));
    }
    if !(4..=cfg.max_memory_limit_mb).contains(&req.memory_limit_mb) {
        return bad(format!("memory_limit_mb must be in 4..={}", cfg.max_memory_limit_mb));
    }
    Ok(())
}

fn compile_message(o: &RunOutcome) -> String {
    let mut text = match o.termination {
        Termination::WallTimeout | Termination::CpuTimeout => "compilation timed out\n".to_string(),
        Termination::MemoryExceeded => "compiler exceeded the memory limit\n".to_string(),
        Termination::OutputExceeded => "compiler output too large\n".to_string(),
        Termination::Exited => String::new(),
    };
    text.push_str(&String::from_utf8_lossy(&o.stderr));
    if o.stderr.is_empty() {
        text.push_str(&String::from_utf8_lossy(&o.stdout)); // `go build` writes to stderr, but be safe
    }
    truncate_string(text, COMPILE_OUTPUT_LIMIT)
}

fn lossy_truncate(bytes: &[u8], cap: usize) -> String {
    if bytes.len() <= cap {
        return String::from_utf8_lossy(bytes).into_owned();
    }
    let mut s = String::from_utf8_lossy(&bytes[..cap]).into_owned();
    s.push_str("\n…[truncated]");
    s
}

fn truncate_string(mut s: String, cap: usize) -> String {
    if s.len() > cap {
        let mut end = cap;
        while !s.is_char_boundary(end) {
            end -= 1;
        }
        s.truncate(end);
        s.push_str("\n…[truncated]");
    }
    s
}

fn chown_opt(path: &Path, ids: Option<u32>) -> std::io::Result<()> {
    match ids {
        Some(id) => std::os::unix::fs::chown(path, Some(id), Some(id)),
        None => Ok(()),
    }
}

/// Creates `path` (and parents) and hands it to the sandbox uid.
fn prepare_dir(path: &Path, ids: Option<u32>) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::create_dir_all(path)?;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))?;
    chown_opt(path, ids)
}

/// Temporary per-submission directory, removed on drop.
struct Workspace {
    dir: tempfile::TempDir,
}

impl Workspace {
    async fn create(root: &Path, ids: Option<u32>) -> Result<Self> {
        let root: PathBuf = root.to_path_buf();
        let dir = tokio::task::spawn_blocking(move || -> std::io::Result<tempfile::TempDir> {
            use std::os::unix::fs::PermissionsExt;
            std::fs::create_dir_all(&root)?;
            // The root must be traversable by sandbox uids but not listable.
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o711))?;
            let dir = tempfile::Builder::new().prefix("job-").tempdir_in(&root)?;
            chown_opt(dir.path(), ids)?;
            Ok(dir)
        })
        .await
        .map_err(|e| Error::Internal(e.to_string()))??;
        Ok(Self { dir })
    }

    fn path(&self) -> &Path {
        self.dir.path()
    }
}

