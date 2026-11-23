//! The small type system used by function signatures.

use std::{fmt, str::FromStr};

use serde::{de, Deserialize, Deserializer};

/// Deepest supported nesting of arrays (`int[][]`).
pub const MAX_DIMS: u8 = 2;
/// Most parameters a function may declare.
pub const MAX_PARAMS: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Base {
    /// 32-bit signed integer.
    Int,
    /// 64-bit signed integer.
    Long,
    /// 64-bit IEEE float.
    Double,
    Bool,
    /// UTF-8 text.
    Str,
}

impl Base {
    pub fn name(self) -> &'static str {
        match self {
            Base::Int => "int",
            Base::Long => "long",
            Base::Double => "double",
            Base::Bool => "bool",
            Base::Str => "string",
        }
    }
}

/// A base type wrapped in `dims` levels of arrays: `int`, `string[]`, `double[][]`…
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Type {
    pub base: Base,
    pub dims: u8,
}

impl Type {
    pub const fn new(base: Base, dims: u8) -> Self {
        Self { base, dims }
    }

    /// The type of one element. Only meaningful when `dims > 0`.
    pub fn element(self) -> Type {
        Type { base: self.base, dims: self.dims.saturating_sub(1) }
    }
}

impl fmt::Display for Type {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.base.name())?;
        for _ in 0..self.dims {
            f.write_str("[]")?;
        }
        Ok(())
    }
}

impl FromStr for Type {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, String> {
        let mut rest = s.trim();
        let mut dims = 0u8;
        while let Some(inner) = rest.strip_suffix("[]") {
            if dims == MAX_DIMS {
                return Err(format!("type `{s}`: at most {MAX_DIMS} array dimensions are supported"));
            }
            dims += 1;
            rest = inner;
        }
        let base = match rest {
            "int" => Base::Int,
            "long" => Base::Long,
            "double" => Base::Double,
            "bool" => Base::Bool,
            "string" => Base::Str,
            _ => return Err(format!("unknown type `{s}` (expected int, long, double, bool or string, optionally followed by [] or [][])")),
        };
        Ok(Type { base, dims })
    }
}

impl<'de> Deserialize<'de> for Type {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let text = String::deserialize(deserializer)?;
        text.parse().map_err(de::Error::custom)
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Param {
    pub name: String,
    #[serde(rename = "type")]
    pub ty: Type,
}

/// `name(params...) -> return_type`.
#[derive(Debug, Clone, Deserialize)]
pub struct Signature {
    pub name: String,
    #[serde(default)]
    pub params: Vec<Param>,
    pub return_type: Type,
}

impl Signature {
    /// Names end up in generated source code, so they must be plain identifiers.
    pub fn validate(&self) -> Result<(), String> {
        check_identifier("function name", &self.name)?;
        if self.params.len() > MAX_PARAMS {
            return Err(format!("at most {MAX_PARAMS} parameters are supported"));
        }
        for (i, p) in self.params.iter().enumerate() {
            check_identifier("parameter name", &p.name)?;
            if self.params[..i].iter().any(|q| q.name == p.name) {
                return Err(format!("duplicate parameter name `{}`", p.name));
            }
        }
        Ok(())
    }
}

fn check_identifier(what: &str, s: &str) -> Result<(), String> {
    let mut chars = s.chars();
    let ok = s.len() <= 64
        && matches!(chars.next(), Some(c) if c.is_ascii_alphabetic() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_');
    if ok {
        Ok(())
    } else {
        Err(format!("{what} `{s}` is not a valid identifier"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_prints_types() {
        for s in ["int", "long", "double", "bool", "string", "int[]", "string[][]"] {
            assert_eq!(s.parse::<Type>().unwrap().to_string(), s);
        }
        assert_eq!(" int[] ".parse::<Type>().unwrap(), Type::new(Base::Int, 1));
        assert!("int[][][]".parse::<Type>().is_err());
        assert!("float".parse::<Type>().is_err());
        assert!("[]".parse::<Type>().is_err());
        assert!("".parse::<Type>().is_err());
    }

    #[test]
    fn signature_from_json() {
        let sig: Signature = serde_json::from_str(
            r#"{"name":"solve","params":[{"name":"nums","type":"int[]"},{"name":"k","type":"long"}],"return_type":"bool"}"#,
        )
        .unwrap();
        assert_eq!(sig.params.len(), 2);
        assert_eq!(sig.params[0].ty, Type::new(Base::Int, 1));
        assert_eq!(sig.return_type, Type::new(Base::Bool, 0));
        assert!(sig.validate().is_ok());
        assert!(serde_json::from_str::<Signature>(r#"{"name":"f","return_type":"void"}"#).is_err());
    }

    #[test]
    fn validation_rejects_unsafe_names() {
        let sig = |name: &str, p: &str| Signature {
            name: name.into(),
            params: vec![Param { name: p.into(), ty: Type::new(Base::Int, 0) }],
            return_type: Type::new(Base::Int, 0),
        };
        assert!(sig("solve", "a").validate().is_ok());
        assert!(sig("_f1", "x_2").validate().is_ok());
        assert!(sig("1abc", "a").validate().is_err());
        assert!(sig("solve(); evil", "a").validate().is_err());
        assert!(sig("solve", "a b").validate().is_err());
        assert!(sig("", "a").validate().is_err());
        let dup = Signature {
            name: "f".into(),
            params: vec![
                Param { name: "a".into(), ty: Type::new(Base::Int, 0) },
                Param { name: "a".into(), ty: Type::new(Base::Int, 0) },
            ],
            return_type: Type::new(Base::Int, 0),
        };
        assert!(dup.validate().is_err());
    }
}
