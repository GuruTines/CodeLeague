

// ==== CodeLeague harness (generated, do not edit) ====
mod __cl_harness {
    use std::str::SplitAsciiWhitespace;

    pub trait ClRead: Sized {
        fn read(it: &mut SplitAsciiWhitespace<'_>) -> Self;
    }

    pub trait ClWrite {
        fn write(&self, out: &mut String);
    }

    const HEX: &[u8; 16] = b"0123456789abcdef";

    fn token<'a>(it: &mut SplitAsciiWhitespace<'a>) -> &'a str {
        match it.next() {
            Some(t) => t,
            None => {
                eprintln!("harness: unexpected end of input");
                std::process::exit(3)
            }
        }
    }

    fn digit(c: u8) -> u8 {
        match c {
            b'0'..=b'9' => c - b'0',
            b'a'..=b'f' => c - b'a' + 10,
            b'A'..=b'F' => c - b'A' + 10,
            _ => 0,
        }
    }

    macro_rules! impl_number {
        ($($t:ty),*) => {$(
            impl ClRead for $t {
                fn read(it: &mut SplitAsciiWhitespace<'_>) -> Self {
                    token(it).parse().expect("harness: bad number")
                }
            }
        )*};
    }
    impl_number!(i32, i64, f64);

    impl ClWrite for i32 {
        fn write(&self, out: &mut String) {
            out.push_str(&self.to_string());
        }
    }
    impl ClWrite for i64 {
        fn write(&self, out: &mut String) {
            out.push_str(&self.to_string());
        }
    }
    impl ClWrite for f64 {
        fn write(&self, out: &mut String) {
            out.push_str(&format!("{:?}", self));
        }
    }

    impl ClRead for bool {
        fn read(it: &mut SplitAsciiWhitespace<'_>) -> Self {
            token(it) == "1"
        }
    }
    impl ClWrite for bool {
        fn write(&self, out: &mut String) {
            out.push(if *self { '1' } else { '0' });
        }
    }

    impl ClRead for String {
        fn read(it: &mut SplitAsciiWhitespace<'_>) -> Self {
            let t = token(it);
            if t == "-" {
                return String::new();
            }
            let mut bytes = Vec::with_capacity(t.len() / 2);
            for pair in t.as_bytes().chunks_exact(2) {
                bytes.push((digit(pair[0]) << 4) | digit(pair[1]));
            }
            String::from_utf8(bytes).expect("harness: bad string")
        }
    }
    impl ClWrite for String {
        fn write(&self, out: &mut String) {
            if self.is_empty() {
                out.push('-');
                return;
            }
            for b in self.bytes() {
                out.push(HEX[(b >> 4) as usize] as char);
                out.push(HEX[(b & 15) as usize] as char);
            }
        }
    }

    impl<T: ClRead> ClRead for Vec<T> {
        fn read(it: &mut SplitAsciiWhitespace<'_>) -> Self {
            let n: usize = token(it).parse().expect("harness: bad length");
            let mut v = Vec::with_capacity(n);
            for _ in 0..n {
                v.push(T::read(it));
            }
            v
        }
    }
    impl<T: ClWrite> ClWrite for Vec<T> {
        fn write(&self, out: &mut String) {
            out.push_str(&self.len().to_string());
            for x in self {
                out.push(' ');
                x.write(out);
            }
        }
    }

    pub fn emit(out: &str) {
        println!("\n@@CL_RESULT@@\n{}", out);
    }
}
