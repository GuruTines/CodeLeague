use std::{
    ffi::OsString,
    io,
    os::unix::process::CommandExt,
    path::PathBuf,
    process::Stdio,
    time::{Duration, Instant},
};

use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::{ChildStderr, ChildStdin, ChildStdout},
    time::MissedTickBehavior,
};

use super::SandboxError;

/// Hard limits applied to one run.
#[derive(Debug, Clone)]
pub struct Limits {
    /// CPU time (user + system). Exceeding → [`Termination::CpuTimeout`].
    pub cpu_time: Duration,
    /// Wall-clock watchdog; protects against sleeping/blocked programs.
    pub wall_time: Duration,
    /// Peak RSS limit. Exceeding → [`Termination::MemoryExceeded`].
    pub memory_bytes: u64,
    /// Optional `RLIMIT_AS` backstop against allocations between watchdog polls.
    pub address_space_bytes: Option<u64>,
    /// Max captured bytes on each of stdout/stderr.
    pub output_bytes: usize,
    pub file_size_bytes: u64,
    pub max_open_files: u64,
    /// `RLIMIT_NPROC`; only applied when privileges are dropped (it is per-uid).
    pub max_processes: u64,
    pub stack_bytes: u64,
}

#[derive(Debug, Clone, Default)]
pub struct Isolation {
    /// Run as this uid/gid (requires the service to be root).
    pub uid: Option<u32>,
    pub gid: Option<u32>,
    /// Unshare network/IPC/UTS namespaces.
    pub namespaces: bool,
    /// Make a namespace failure fatal for the spawn.
    pub require_namespaces: bool,
}

#[derive(Debug, Clone)]
pub struct RunSpec {
    pub program: PathBuf,
    pub args: Vec<OsString>,
    pub cwd: PathBuf,
    pub env: Vec<(OsString, OsString)>,
    pub stdin: Vec<u8>,
    pub limits: Limits,
    pub isolation: Isolation,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Termination {
    /// The process ended on its own (successfully or not).
    Exited,
    CpuTimeout,
    WallTimeout,
    MemoryExceeded,
    OutputExceeded,
}

#[derive(Debug, Clone)]
pub struct RunOutcome {
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub exit_code: Option<i32>,
    pub signal: Option<i32>,
    pub cpu_time: Duration,
    pub wall_time: Duration,
    pub peak_memory_bytes: u64,
    pub termination: Termination,
}

impl RunOutcome {
    pub fn success(&self) -> bool {
        self.termination == Termination::Exited && self.exit_code == Some(0)
    }
}

const POLL_INTERVAL: Duration = Duration::from_millis(2);
const DRAIN_TIMEOUT: Duration = Duration::from_millis(500);

/// Runs `spec` to completion (or until a limit is hit) and reports the result.
pub async fn run(spec: RunSpec) -> Result<RunOutcome, SandboxError> {
    let limits = spec.limits.clone();
    let mut cmd = std::process::Command::new(&spec.program);
    cmd.args(&spec.args)
        .current_dir(&spec.cwd)
        .env_clear()
        .envs(spec.env.iter().map(|(k, v)| (k, v)))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let setup = ChildSetup::new(&spec);
    // SAFETY: `ChildSetup::apply` only performs async-signal-safe libc calls
    // and does not allocate (it runs between fork and exec).
    unsafe {
        cmd.pre_exec(move || setup.apply());
    }

    let start = Instant::now();
    let mut child = cmd.spawn().map_err(|source| SandboxError::Spawn {
        program: spec.program.display().to_string(),
        source,
    })?;
    let pid = child.id() as libc::pid_t;

    // From here on, make sure the process group dies if anything below fails.
    let guard = GroupKillGuard(pid);

    let stdin = ChildStdin::from_std(child.stdin.take().expect("piped stdin"))?;
    let stdout = ChildStdout::from_std(child.stdout.take().expect("piped stdout"))?;
    let stderr = ChildStderr::from_std(child.stderr.take().expect("piped stderr"))?;

    let input = spec.stdin;
    let stdin_task = tokio::spawn(async move {
        let mut stdin = stdin;
        // The program may exit without reading everything; EPIPE is fine.
        let _ = stdin.write_all(&input).await;
        let _ = stdin.shutdown().await;
    });
    let cap = limits.output_bytes;
    let out_task = tokio::spawn(read_capped(stdout, cap, pid));
    let err_task = tokio::spawn(read_capped(stderr, cap, pid));

    // `wait4` gives us rusage; tokio's own reaper would hide it, so we reap manually.
    let mut wait = tokio::task::spawn_blocking(move || wait4(pid));
    let mut ticker = tokio::time::interval(POLL_INTERVAL);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);

    let wall_limit = limits.wall_time;
    let mut termination = Termination::Exited;
    let mut peak: u64 = 0;
    let (status, rusage) = loop {
        tokio::select! {
            res = &mut wait => {
                break res
                    .map_err(|e| SandboxError::Wait(e.to_string()))?
                    .map_err(|e| SandboxError::Wait(e.to_string()))?;
            }
            _ = ticker.tick() => {
                if termination != Termination::Exited { continue; }
                if start.elapsed() > wall_limit {
                    termination = Termination::WallTimeout;
                    kill_group(pid);
                } else if let Some(rss) = read_vm_hwm(pid) {
                    peak = peak.max(rss);
                    if rss > limits.memory_bytes {
                        termination = Termination::MemoryExceeded;
                        kill_group(pid);
                    }
                }
            }
        }
    };
    let wall_time = start.elapsed();
    // The leader is reaped; kill leftovers (grandchildren holding the pipes).
    kill_group(pid);
    std::mem::forget(guard);

    let _ = stdin_task.await;
    let (stdout, out_exceeded) = join_reader(out_task).await;
    let (stderr, err_exceeded) = join_reader(err_task).await;

    let (exit_code, signal) = decode_status(status);
    let cpu_time = timeval(rusage.ru_utime) + timeval(rusage.ru_stime);

    if termination == Termination::Exited {
        if out_exceeded || err_exceeded {
            termination = Termination::OutputExceeded;
        } else if signal == Some(libc::SIGXCPU) || cpu_time > limits.cpu_time {
            termination = Termination::CpuTimeout;
        }
    }
    if peak == 0 {
        // Process ended before the first poll. `ru_maxrss` may include the
        // parent's pre-exec footprint, so it is only a fallback.
        peak = (rusage.ru_maxrss.max(0) as u64) * 1024;
    }

    Ok(RunOutcome {
        stdout,
        stderr,
        exit_code,
        signal,
        cpu_time,
        wall_time,
        peak_memory_bytes: peak,
        termination,
    })
}

// ---------------------------------------------------------------------------
// child setup (runs after fork, before exec)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy)]
struct ChildSetup {
    cpu_secs: u64,
    address_space: Option<u64>,
    file_size: u64,
    open_files: u64,
    processes: u64,
    stack: u64,
    uid: Option<u32>,
    gid: Option<u32>,
    namespaces: bool,
    require_namespaces: bool,
}

impl ChildSetup {
    fn new(spec: &RunSpec) -> Self {
        let l = &spec.limits;
        let ms = l.cpu_time.as_millis() as u64;
        Self {
            // Soft limit slightly above the real one: precise accounting is done
            // from rusage, RLIMIT_CPU is only the kernel-enforced backstop.
            cpu_secs: ms.div_ceil(1000).max(1) + 1,
            address_space: l.address_space_bytes,
            file_size: l.file_size_bytes,
            open_files: l.max_open_files,
            processes: l.max_processes,
            stack: l.stack_bytes,
            uid: spec.isolation.uid,
            gid: spec.isolation.gid.or(spec.isolation.uid),
            namespaces: spec.isolation.namespaces,
            require_namespaces: spec.isolation.require_namespaces,
        }
    }

    #[allow(clippy::unnecessary_cast)] // rlimit resource constants differ in type between glibc and musl
    fn apply(&self) -> io::Result<()> {
        unsafe {
            if libc::setsid() < 0 {
                return Err(io::Error::last_os_error());
            }
            libc::prctl(libc::PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0);

            if self.namespaces {
                let flags = libc::CLONE_NEWNET | libc::CLONE_NEWIPC | libc::CLONE_NEWUTS;
                if libc::unshare(flags) != 0 && self.require_namespaces {
                    return Err(io::Error::last_os_error());
                }
            }

            set_rlimit(libc::RLIMIT_CPU as u32, self.cpu_secs, self.cpu_secs + 1)?;
            if let Some(a) = self.address_space {
                set_rlimit(libc::RLIMIT_AS as u32, a, a)?;
            }
            set_rlimit(libc::RLIMIT_FSIZE as u32, self.file_size, self.file_size)?;
            set_rlimit(libc::RLIMIT_NOFILE as u32, self.open_files, self.open_files)?;
            set_rlimit(libc::RLIMIT_STACK as u32, self.stack, self.stack)?;
            set_rlimit(libc::RLIMIT_CORE as u32, 0, 0)?;

            if let (Some(uid), Some(gid)) = (self.uid, self.gid) {
                if libc::setgroups(0, std::ptr::null()) != 0
                    || libc::setgid(gid) != 0
                    || libc::setuid(uid) != 0
                {
                    return Err(io::Error::last_os_error());
                }
                // After setuid: setuid() itself fails with EAGAIN if the new uid is
                // already above RLIMIT_NPROC, so this must come last.
                set_rlimit(libc::RLIMIT_NPROC as u32, self.processes, self.processes)?;
            }
        }
        Ok(())
    }
}

unsafe fn set_rlimit(resource: u32, soft: u64, hard: u64) -> io::Result<()> {
    let rl = libc::rlimit { rlim_cur: soft as libc::rlim_t, rlim_max: hard as libc::rlim_t };
    if libc::setrlimit(resource as _, &rl) != 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

pub(super) fn probe_namespaces() -> bool {
    let mut cmd = std::process::Command::new("true");
    unsafe {
        cmd.pre_exec(|| {
            if libc::unshare(libc::CLONE_NEWNET | libc::CLONE_NEWIPC | libc::CLONE_NEWUTS) != 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        });
    }
    cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    matches!(cmd.status(), Ok(s) if s.success())
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

struct GroupKillGuard(libc::pid_t);

impl Drop for GroupKillGuard {
    fn drop(&mut self) {
        kill_group(self.0);
        // Reap the zombie so it doesn't linger.
        let pid = self.0;
        std::thread::spawn(move || {
            let _ = wait4(pid);
        });
    }
}

fn kill_group(pid: libc::pid_t) {
    // The child called setsid(), so its pid is also its process-group id.
    unsafe {
        libc::kill(-pid, libc::SIGKILL);
    }
}

fn wait4(pid: libc::pid_t) -> io::Result<(libc::c_int, libc::rusage)> {
    loop {
        let mut status: libc::c_int = 0;
        let mut ru: libc::rusage = unsafe { std::mem::zeroed() };
        let r = unsafe { libc::wait4(pid, &mut status, 0, &mut ru) };
        if r == pid {
            return Ok((status, ru));
        }
        let err = io::Error::last_os_error();
        if r < 0 && err.kind() == io::ErrorKind::Interrupted {
            continue;
        }
        return Err(err);
    }
}

fn decode_status(status: libc::c_int) -> (Option<i32>, Option<i32>) {
    if libc::WIFEXITED(status) {
        (Some(libc::WEXITSTATUS(status)), None)
    } else if libc::WIFSIGNALED(status) {
        (None, Some(libc::WTERMSIG(status)))
    } else {
        (None, None)
    }
}

fn timeval(tv: libc::timeval) -> Duration {
    Duration::new(tv.tv_sec.max(0) as u64, (tv.tv_usec.max(0) as u32) * 1000)
}

/// Peak resident set size of `pid` in bytes (`VmHWM`), if the process is alive.
fn read_vm_hwm(pid: libc::pid_t) -> Option<u64> {
    let status = std::fs::read_to_string(format!("/proc/{pid}/status")).ok()?;
    parse_vm_hwm(&status)
}

pub(crate) fn parse_vm_hwm(status: &str) -> Option<u64> {
    let line = status.lines().find(|l| l.starts_with("VmHWM:"))?;
    let kb: u64 = line.split_whitespace().nth(1)?.parse().ok()?;
    Some(kb * 1024)
}

/// Reads up to `cap` bytes; on overflow kills the group and returns `exceeded = true`.
async fn read_capped<R: tokio::io::AsyncRead + Unpin>(
    mut reader: R,
    cap: usize,
    pid: libc::pid_t,
) -> (Vec<u8>, bool) {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 16 * 1024];
    loop {
        match reader.read(&mut chunk).await {
            Ok(0) | Err(_) => return (buf, false),
            Ok(n) => {
                let room = cap.saturating_sub(buf.len());
                if n > room {
                    buf.extend_from_slice(&chunk[..room]);
                    kill_group(pid);
                    return (buf, true);
                }
                buf.extend_from_slice(&chunk[..n]);
            }
        }
    }
}

async fn join_reader(handle: tokio::task::JoinHandle<(Vec<u8>, bool)>) -> (Vec<u8>, bool) {
    let abort = handle.abort_handle();
    match tokio::time::timeout(DRAIN_TIMEOUT, handle).await {
        Ok(Ok(r)) => r,
        _ => {
            abort.abort();
            (Vec::new(), false)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_vm_hwm() {
        let s = "Name:\tfoo\nVmPeak:\t  100 kB\nVmHWM:\t    2048 kB\nVmRSS:\t 1 kB\n";
        assert_eq!(parse_vm_hwm(s), Some(2048 * 1024));
        assert_eq!(parse_vm_hwm("Name:\tx\n"), None);
    }

    #[test]
    fn decodes_exit_status() {
        assert_eq!(decode_status(0), (Some(0), None));
        assert_eq!(decode_status(3 << 8), (Some(3), None));
        assert_eq!(decode_status(libc::SIGSEGV), (None, Some(libc::SIGSEGV)));
    }
}
