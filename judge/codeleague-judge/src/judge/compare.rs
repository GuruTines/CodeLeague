use crate::models::CompareMode;

/// Returns whether `actual` matches `expected` under `mode`.
pub fn outputs_match(mode: CompareMode, actual: &[u8], expected: &[u8]) -> bool {
    match mode {
        CompareMode::Exact => actual == expected,
        CompareMode::TrimTrailing => normalized_lines(actual).eq(normalized_lines(expected)),
        CompareMode::Tokens => tokens(actual).eq(tokens(expected)),
    }
}

/// Lines with trailing whitespace stripped and trailing blank lines removed.
fn normalized_lines(data: &[u8]) -> impl Iterator<Item = &[u8]> {
    let mut lines: Vec<&[u8]> = data.split(|&b| b == b'\n').map(trim_end).collect();
    while lines.last().is_some_and(|l| l.is_empty()) {
        lines.pop();
    }
    lines.into_iter()
}

fn trim_end(mut line: &[u8]) -> &[u8] {
    while let Some((&last, rest)) = line.split_last() {
        if last.is_ascii_whitespace() {
            line = rest;
        } else {
            break;
        }
    }
    line
}

fn tokens(data: &[u8]) -> impl Iterator<Item = &[u8]> {
    data.split(|b| b.is_ascii_whitespace()).filter(|t| !t.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use CompareMode::*;

    #[test]
    fn exact_is_strict() {
        assert!(outputs_match(Exact, b"1 2\n", b"1 2\n"));
        assert!(!outputs_match(Exact, b"1 2\n", b"1 2"));
        assert!(!outputs_match(Exact, b"1 2 \n", b"1 2\n"));
    }

    #[test]
    fn trim_trailing_ignores_line_end_noise() {
        assert!(outputs_match(TrimTrailing, b"1 2  \r\n3\r\n\r\n\n", b"1 2\n3"));
        assert!(outputs_match(TrimTrailing, b"", b"\n\n"));
        assert!(!outputs_match(TrimTrailing, b"1  2\n", b"1 2\n"));
        assert!(!outputs_match(TrimTrailing, b"1\n\n2\n", b"1\n2\n"));
        assert!(!outputs_match(TrimTrailing, b" 1\n", b"1\n"));
    }

    #[test]
    fn tokens_ignore_all_whitespace_layout() {
        assert!(outputs_match(Tokens, b"1   2\n\n3", b"1 2 3\n"));
        assert!(!outputs_match(Tokens, b"1 2", b"1 2 3"));
        assert!(!outputs_match(Tokens, b"12", b"1 2"));
    }
}
