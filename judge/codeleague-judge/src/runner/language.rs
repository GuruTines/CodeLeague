use std::{
    env,
    ffi::OsString,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    C,
    #[serde(alias = "c++")]
    Cpp,
    #[serde(alias = "python3", alias = "py")]
    Python,
    #[serde(alias = "rs")]
    Rust,
    #[serde(alias = "golang")]
    Go,
}

impl Language {
    pub const ALL: [Language; 5] = [Language::C, Language::Cpp, Language::Python, Language::Rust, Language::Go];

    pub fn as_str(self) -> &'static str {
        match self {
            Language::C => "c",
            Language::Cpp => "cpp",
            Language::Python => "python",
            Language::Rust => "rust",
            Language::Go => "go",
        }
    }

    pub fn source_file(self) -> &'static str {
        match self {
            Language::C => "main.c",
            Language::Cpp => "main.cpp",
            Language::Python => "main.py",
            Language::Rust => "main.rs",
            Language::Go => "main.go",
        }
    }

    pub fn needs_compile(self) -> bool {
        !matches!(self, Language::Python)
    }

    /// Whether `RLIMIT_AS` may be used as a backstop. Go reserves large virtual
    /// ranges up front, so a virtual-memory limit would break it.
    pub fn supports_address_space_limit(self) -> bool {
        !matches!(self, Language::Go)
    }
}

/// Absolute paths of the installed toolchains (`None` = not installed).
#[derive(Debug, Clone, Default)]
pub struct Toolchain {
    pub cc: Option<PathBuf>,
    pub cxx: Option<PathBuf>,
    pub python: Option<PathBuf>,
    pub rustc: Option<PathBuf>,
    pub go: Option<PathBuf>,
}

/// A command line to execute inside the sandbox.
#[derive(Debug, Clone)]
pub struct Command {
    pub program: PathBuf,
    pub args: Vec<OsString>,
}

impl Toolchain {
    /// Looks the tools up in `PATH`; `CL_CC`, `CL_CXX`, `CL_PYTHON`, `CL_RUSTC`, `CL_GO` override.
    pub fn detect() -> Self {
        let find = |var: &str, default: &str| which(&env::var(var).unwrap_or_else(|_| default.to_string()));
        Self {
            cc: find("CL_CC", "gcc").or_else(|| which("cc")),
            cxx: find("CL_CXX", "g++"),
            python: find("CL_PYTHON", "python3"),
            rustc: find("CL_RUSTC", "rustc"),
            go: find("CL_GO", "go"),
        }
    }

    pub fn is_available(&self, lang: Language) -> bool {
        match lang {
            Language::C => self.cc.is_some(),
            Language::Cpp => self.cxx.is_some(),
            Language::Python => self.python.is_some(),
            Language::Rust => self.rustc.is_some(),
            Language::Go => self.go.is_some(),
        }
    }

    /// Compile command for `lang`, with `dir` as the working directory.
    /// Returns `None` for interpreted or unavailable languages.
    pub fn compile_command(&self, lang: Language) -> Option<Command> {
        let s = |x: &str| OsString::from(x);
        match lang {
            Language::C => Some(Command {
                program: self.cc.clone()?,
                args: ["-O2", "-std=gnu17", "-pipe", "-o", "main", "main.c", "-lm"].map(s).to_vec(),
            }),
            Language::Cpp => Some(Command {
                program: self.cxx.clone()?,
                args: ["-O2", "-std=gnu++20", "-pipe", "-o", "main", "main.cpp"].map(s).to_vec(),
            }),
            Language::Rust => Some(Command {
                program: self.rustc.clone()?,
                args: ["-O", "--edition", "2021", "-o", "main", "main.rs"].map(s).to_vec(),
            }),
            Language::Go => Some(Command {
                program: self.go.clone()?,
                args: ["build", "-o", "main", "main.go"].map(s).to_vec(),
            }),
            Language::Python => None,
        }
    }

    /// Command that runs the (compiled) program located in `dir`.
    pub fn run_command(&self, lang: Language, dir: &Path) -> Option<Command> {
        match lang {
            Language::Python => Some(Command {
                program: self.python.clone()?,
                args: vec![OsString::from("-B"), dir.join("main.py").into_os_string()],
            }),
            _ => self.is_available(lang).then(|| Command { program: dir.join("main"), args: vec![] }),
        }
    }

    /// Environment for the compile step / run step. `go_cache` is a per-slot cache dir.
    pub fn env(&self, lang: Language, home: &Path, go_cache: &Path) -> Vec<(OsString, OsString)> {
        let mut v: Vec<(OsString, OsString)> = vec![
            ("PATH".into(), "/usr/local/bin:/usr/bin:/bin".into()),
            ("HOME".into(), home.into()),
            ("TMPDIR".into(), home.into()),
            ("LANG".into(), "C.UTF-8".into()),
        ];
        match lang {
            Language::Python => {
                v.push(("PYTHONDONTWRITEBYTECODE".into(), "1".into()));
                v.push(("PYTHONIOENCODING".into(), "utf-8".into()));
            }
            Language::Go => {
                v.push(("GOCACHE".into(), go_cache.into()));
                v.push(("GOPATH".into(), go_cache.join("path").into()));
                v.push(("GO111MODULE".into(), "off".into()));
                v.push(("GOTOOLCHAIN".into(), "local".into()));
                v.push(("GOFLAGS".into(), "-buildvcs=false".into()));
                v.push(("CGO_ENABLED".into(), "0".into()));
            }
            _ => {}
        }
        v
    }
}

fn which(name: &str) -> Option<PathBuf> {
    let p = Path::new(name);
    if p.is_absolute() {
        return p.is_file().then(|| p.to_path_buf());
    }
    env::var_os("PATH")?
        .to_string_lossy()
        .split(':')
        .map(|d| Path::new(d).join(name))
        .find(|c| c.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_language_aliases() {
        for (s, l) in [("c", Language::C), ("c++", Language::Cpp), ("py", Language::Python),
                       ("python3", Language::Python), ("rs", Language::Rust), ("golang", Language::Go)] {
            let got: Language = serde_json::from_str(&format!("\"{s}\"")).unwrap();
            assert_eq!(got, l);
        }
        assert!(serde_json::from_str::<Language>("\"brainfuck\"").is_err());
    }

    #[test]
    fn python_is_interpreted() {
        let t = Toolchain { python: Some("/usr/bin/python3".into()), ..Default::default() };
        assert!(t.compile_command(Language::Python).is_none());
        let c = t.run_command(Language::Python, Path::new("/w")).unwrap();
        assert_eq!(c.args.last().unwrap(), "/w/main.py");
        assert!(t.run_command(Language::C, Path::new("/w")).is_none());
    }
}
