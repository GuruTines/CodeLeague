//! Generates the program that surrounds the user's function.
//!
//! The static part of every harness (token reader/writer) lives in
//! `templates/runtime.*` (the Go one is `runtime.go.tmpl`, so that `go build ./...` does not treat it as code); only the entry point, which depends on the signature,
//! is generated here. For single-file languages the harness is appended *after*
//! the user's code, so line numbers in compiler messages stay valid. Go gets a
//! second file next to the user's `main.go`.
//!
//! The mapping of signature types to language types is documented in the judge
//! README; the frontend generates its starter code from the same table.

use std::fmt::Write as _;

use super::types::{Base, Signature, Type};
use crate::runner::language::Language;

const C_RUNTIME: &str = include_str!("templates/runtime.c");
const CPP_RUNTIME: &str = include_str!("templates/runtime.cpp");
const RUST_RUNTIME: &str = include_str!("templates/runtime.rs");
const GO_RUNTIME: &str = include_str!("templates/runtime.go.tmpl");
const PY_RUNTIME: &str = include_str!("templates/runtime.py");

/// Source files (name, content) to place in the workspace for `lang`.
pub fn render(lang: Language, sig: &Signature, user_code: &str) -> Vec<(&'static str, String)> {
    match lang {
        Language::C => vec![("main.c", append(user_code, &gen_c(sig)))],
        Language::Cpp => vec![("main.cpp", append(user_code, &gen_cpp(sig)))],
        Language::Rust => vec![("main.rs", append(user_code, &gen_rust(sig)))],
        Language::Python => vec![("main.py", append(user_code, &gen_python(sig)))],
        Language::Go => vec![("main.go", user_code.to_string()), ("harness.go", gen_go(sig))],
    }
}

fn append(user_code: &str, harness: &str) -> String {
    let mut s = String::with_capacity(user_code.len() + harness.len() + 1);
    s.push_str(user_code);
    if !user_code.ends_with('\n') {
        s.push('\n');
    }
    s.push_str(harness);
    s
}

// ---- C ---------------------------------------------------------------------

fn c_type(base: Base) -> &'static str {
    match base {
        Base::Int => "int",
        Base::Long => "long long",
        Base::Double => "double",
        Base::Bool => "bool",
        Base::Str => "char *",
    }
}

/// Suffix of the runtime helpers (`cl_read_<tag>`, `cl_write_<tag>_1`, …).
fn c_tag(base: Base) -> &'static str {
    match base {
        Base::Int => "int",
        Base::Long => "long",
        Base::Double => "double",
        Base::Bool => "bool",
        Base::Str => "str",
    }
}

/// C has neither generics nor reflection: an array parameter is passed as a
/// pointer followed by its length (`T[][]`: pointer, rows, per-row lengths) and
/// array results come back through trailing out-parameters.
fn gen_c(sig: &Signature) -> String {
    let mut s = String::from(C_RUNTIME);
    s.push_str("\nint main(void) {\n    cl_load();\n");
    let mut args: Vec<String> = Vec::new();
    for (i, p) in sig.params.iter().enumerate() {
        let ct = c_type(p.ty.base);
        let t = c_tag(p.ty.base);
        match p.ty.dims {
            0 => {
                let _ = writeln!(s, "    {ct} a{i} = cl_read_{t}();");
                args.push(format!("a{i}"));
            }
            1 => {
                let _ = writeln!(s, "    int a{i}_n = 0;");
                let _ = writeln!(s, "    {ct} *a{i} = cl_read_{t}_1(&a{i}_n);");
                args.push(format!("a{i}, a{i}_n"));
            }
            _ => {
                let _ = writeln!(s, "    int a{i}_n = 0;");
                let _ = writeln!(s, "    int *a{i}_c = NULL;");
                let _ = writeln!(s, "    {ct} **a{i} = cl_read_{t}_2(&a{i}_n, &a{i}_c);");
                args.push(format!("a{i}, a{i}_n, a{i}_c"));
            }
        }
    }
    let rt = sig.return_type;
    let ct = c_type(rt.base);
    let t = c_tag(rt.base);
    let name = &sig.name;
    match rt.dims {
        0 => {
            let decl = if rt.base == Base::Str { "const char *" } else { ct };
            let _ = writeln!(s, "    {decl} r = {name}({});", args.join(", "));
            s.push_str("    cl_begin_result();\n");
            let _ = writeln!(s, "    cl_write_{t}(r);");
        }
        1 => {
            args.push("&r_n".to_string());
            let _ = writeln!(s, "    int r_n = 0;");
            let _ = writeln!(s, "    {ct} *r = {name}({});", args.join(", "));
            s.push_str("    cl_begin_result();\n");
            let _ = writeln!(s, "    cl_write_{t}_1(r, r_n);");
        }
        _ => {
            args.push("&r_n".to_string());
            args.push("&r_c".to_string());
            let _ = writeln!(s, "    int r_n = 0;");
            let _ = writeln!(s, "    int *r_c = NULL;");
            let _ = writeln!(s, "    {ct} **r = {name}({});", args.join(", "));
            s.push_str("    cl_begin_result();\n");
            let _ = writeln!(s, "    cl_write_{t}_2(r, r_n, r_c);");
        }
    }
    s.push_str("    cl_end_result();\n    return 0;\n}\n");
    s
}

// ---- C++ -------------------------------------------------------------------

fn cpp_type(ty: Type) -> String {
    let base = match ty.base {
        Base::Int => "int",
        Base::Long => "long long",
        Base::Double => "double",
        Base::Bool => "bool",
        Base::Str => "std::string",
    };
    let mut s = base.to_string();
    for _ in 0..ty.dims {
        s = format!("std::vector<{s}>");
    }
    s
}

fn gen_cpp(sig: &Signature) -> String {
    let mut s = String::from(CPP_RUNTIME);
    s.push_str("\nint main() {\n");
    let mut args: Vec<String> = Vec::new();
    for (i, p) in sig.params.iter().enumerate() {
        let _ = writeln!(s, "    auto a{i} = cl_harness::read_arg<{}>();", cpp_type(p.ty));
        args.push(format!("a{i}"));
    }
    let _ = writeln!(s, "    auto r = {}({});", sig.name, args.join(", "));
    s.push_str("    std::string out;\n    cl_harness::write_value(out, r);\n    cl_harness::emit(out);\n    return 0;\n}\n");
    s
}

// ---- Rust ------------------------------------------------------------------

fn rust_type(ty: Type) -> String {
    let base = match ty.base {
        Base::Int => "i32",
        Base::Long => "i64",
        Base::Double => "f64",
        Base::Bool => "bool",
        Base::Str => "String",
    };
    let mut s = base.to_string();
    for _ in 0..ty.dims {
        s = format!("Vec<{s}>");
    }
    s
}

fn gen_rust(sig: &Signature) -> String {
    let mut s = String::from(RUST_RUNTIME);
    s.push_str("\nfn main() {\n    use std::io::Read as _;\n");
    s.push_str("    let mut data = String::new();\n");
    s.push_str("    std::io::stdin().read_to_string(&mut data).expect(\"harness: cannot read stdin\");\n");
    s.push_str("    let mut it = data.split_ascii_whitespace();\n");
    let mut args: Vec<String> = Vec::new();
    for (i, p) in sig.params.iter().enumerate() {
        let _ = writeln!(s, "    let a{i}: {} = __cl_harness::ClRead::read(&mut it);", rust_type(p.ty));
        args.push(format!("a{i}"));
    }
    let _ = writeln!(s, "    let result = {}({});", sig.name, args.join(", "));
    s.push_str("    let mut out = String::new();\n");
    s.push_str("    __cl_harness::ClWrite::write(&result, &mut out);\n");
    s.push_str("    __cl_harness::emit(&out);\n}\n");
    s
}

// ---- Go --------------------------------------------------------------------

fn go_type(ty: Type) -> String {
    let base = match ty.base {
        Base::Int => "int",
        Base::Long => "int64",
        Base::Double => "float64",
        Base::Bool => "bool",
        Base::Str => "string",
    };
    format!("{}{}", "[]".repeat(ty.dims as usize), base)
}

fn go_leaf(base: Base) -> (&'static str, &'static str) {
    match base {
        Base::Int => ("clReadInt", "clWriteInt"),
        Base::Long => ("clReadInt64", "clWriteInt64"),
        Base::Double => ("clReadFloat", "clWriteFloat"),
        Base::Bool => ("clReadBool", "clWriteBool"),
        Base::Str => ("clReadString", "clWriteString"),
    }
}

/// Expression of type `func(*clIn) T` that reads a value of type `ty`.
fn go_read_fn(ty: Type) -> String {
    if ty.dims == 0 {
        go_leaf(ty.base).0.to_string()
    } else {
        format!("func(s *clIn) {} {{ return clReadSlice(s, {}) }}", go_type(ty), go_read_fn(ty.element()))
    }
}

/// Expression of type `func(*clOut, T)` that writes a value of type `ty`.
fn go_write_fn(ty: Type) -> String {
    if ty.dims == 0 {
        go_leaf(ty.base).1.to_string()
    } else {
        format!("func(o *clOut, v {}) {{ clWriteSlice(o, v, {}) }}", go_type(ty), go_write_fn(ty.element()))
    }
}

fn gen_go(sig: &Signature) -> String {
    let mut s = String::from(GO_RUNTIME);
    s.push_str("\nfunc main() {\n\tin := clNewIn()\n\t_ = in // a function without parameters never reads it\n");
    let mut args: Vec<String> = Vec::new();
    for (i, p) in sig.params.iter().enumerate() {
        if p.ty.dims == 0 {
            let _ = writeln!(s, "\ta{i} := {}(in)", go_leaf(p.ty.base).0);
        } else {
            let _ = writeln!(s, "\ta{i} := clReadSlice(in, {})", go_read_fn(p.ty.element()));
        }
        args.push(format!("a{i}"));
    }
    let _ = writeln!(s, "\tresult := {}({})", sig.name, args.join(", "));
    s.push_str("\tout := &clOut{}\n");
    let rt = sig.return_type;
    if rt.dims == 0 {
        let _ = writeln!(s, "\t{}(out, result)", go_leaf(rt.base).1);
    } else {
        let _ = writeln!(s, "\tclWriteSlice(out, result, {})", go_write_fn(rt.element()));
    }
    s.push_str("\tclFinish(out)\n}\n");
    s
}

// ---- Python ----------------------------------------------------------------

fn gen_python(sig: &Signature) -> String {
    let params: Vec<String> = sig
        .params
        .iter()
        .map(|p| format!("(\"{}\", {})", p.ty.base.name(), p.ty.dims))
        .collect();
    let rt = sig.return_type;
    format!(
        "{}\n\n__cl_main([{}], (\"{}\", {}), {})\n",
        PY_RUNTIME,
        params.join(", "),
        rt.base.name(),
        rt.dims,
        sig.name
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::function::types::Param;
    use crate::function::RESULT_MARKER;

    fn sig(params: &[(&str, &str)], ret: &str) -> Signature {
        Signature {
            name: "solve".into(),
            params: params
                .iter()
                .map(|(n, t)| Param { name: (*n).into(), ty: t.parse().unwrap() })
                .collect(),
            return_type: ret.parse().unwrap(),
        }
    }

    #[test]
    fn every_runtime_prints_the_shared_marker() {
        for rt in [C_RUNTIME, CPP_RUNTIME, RUST_RUNTIME, GO_RUNTIME, PY_RUNTIME] {
            assert!(rt.contains(RESULT_MARKER));
        }
    }

    #[test]
    fn user_code_comes_first_so_line_numbers_survive() {
        let s = sig(&[("a", "int")], "int");
        for lang in [Language::C, Language::Cpp, Language::Rust, Language::Python] {
            let files = render(lang, &s, "// user line 1\nint solve(int a) { return a; }");
            assert_eq!(files.len(), 1);
            assert!(files[0].1.starts_with("// user line 1\n"), "{lang:?}");
        }
        let go = render(Language::Go, &s, "package main\n");
        assert_eq!(go.iter().map(|f| f.0).collect::<Vec<_>>(), ["main.go", "harness.go"]);
        assert_eq!(go[0].1, "package main\n");
    }

    #[test]
    fn c_entry_point_follows_the_calling_convention() {
        let c = gen_c(&sig(&[("xs", "int[]"), ("m", "string[][]"), ("k", "long")], "int[]"));
        assert!(c.contains("int *a0 = cl_read_int_1(&a0_n);"));
        assert!(c.contains("char * **a1 = cl_read_str_2(&a1_n, &a1_c);"));
        assert!(c.contains("long long a2 = cl_read_long();"));
        assert!(c.contains("int *r = solve(a0, a0_n, a1, a1_n, a1_c, a2, &r_n);"));
        assert!(c.contains("cl_write_int_1(r, r_n);"));
        let c = gen_c(&sig(&[], "string"));
        assert!(c.contains("const char * r = solve();") || c.contains("const char *r = solve();"));
    }

    #[test]
    fn other_entry_points() {
        let s = sig(&[("grid", "int[][]"), ("name", "string")], "bool[]");
        assert!(gen_cpp(&s).contains("auto a0 = cl_harness::read_arg<std::vector<std::vector<int>>>();"));
        assert!(gen_cpp(&s).contains("auto r = solve(a0, a1);"));
        assert!(gen_rust(&s).contains("let a0: Vec<Vec<i32>> = __cl_harness::ClRead::read(&mut it);"));
        assert!(gen_rust(&s).contains("let result = solve(a0, a1);"));
        let go = gen_go(&s);
        assert!(go.contains("a0 := clReadSlice(in, func(s *clIn) []int { return clReadSlice(s, clReadInt) })"));
        assert!(go.contains("a1 := clReadString(in)"));
        assert!(go.contains("clWriteSlice(out, result, clWriteBool)"));
        assert!(gen_go(&sig(&[], "int")).contains("_ = in"));
        assert!(gen_python(&s).ends_with("__cl_main([(\"int\", 2), (\"string\", 0)], (\"bool\", 1), solve)\n"));
    }
}
