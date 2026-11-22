//! Process sandbox: spawns an untrusted program with hard resource limits and
//! measures what it did.
//!
//! Isolation layers (all best-effort except where noted):
//! * dedicated session + process group, killed as a whole (`kill(-pgid)`)
//! * `RLIMIT_CPU/AS/FSIZE/NOFILE/NPROC/STACK/CORE`
//! * `PR_SET_NO_NEW_PRIVS`
//! * new network/IPC/UTS namespaces (needs `CAP_SYS_ADMIN`)
//! * drop to an unprivileged uid/gid (when started as root)
//! * wall-clock watchdog and a `/proc` memory watchdog

mod process;

pub use process::{run, Isolation, Limits, RunOutcome, RunSpec, Termination};

/// Returns whether new network/IPC/UTS namespaces can be created by this process.
pub fn probe_namespaces() -> bool {
    process::probe_namespaces()
}

#[derive(Debug, thiserror::Error)]
pub enum SandboxError {
    #[error("failed to spawn `{program}`: {source}")]
    Spawn { program: String, source: std::io::Error },
    #[error("failed to wait for child: {0}")]
    Wait(String),
    #[error("i/o error talking to child: {0}")]
    Io(#[from] std::io::Error),
}
