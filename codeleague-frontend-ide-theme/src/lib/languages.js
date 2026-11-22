import goLogo from '../assets/lang/go.svg';
import pythonLogo from '../assets/lang/python.svg';
import rustLogo from '../assets/lang/rust.svg';
import cppLogo from '../assets/lang/cpp.svg';
import cLogo from '../assets/lang/c.svg';

// Список ТОЧНО совпадает с enum Language в judge (c, cpp, python, rust, go).
// Любое другое значение Judge отклонит.
export const LANGUAGES = [
  {
    value: 'go', label: 'Go', logo: goLogo,
    starter: `package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	in := bufio.NewReader(os.Stdin)
	var a, b int
	fmt.Fscan(in, &a, &b)
	fmt.Println(a + b)
}
`
  },
  {
    value: 'python', label: 'Python', logo: pythonLogo,
    starter: `import sys

def main():
    data = sys.stdin.read().split()
    a, b = int(data[0]), int(data[1])
    print(a + b)

main()
`
  },
  {
    value: 'rust', label: 'Rust', logo: rustLogo, monoOnly: true,
    starter: `use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let nums: Vec<i64> = input.split_whitespace().map(|x| x.parse().unwrap()).collect();
    println!("{}", nums[0] + nums[1]);
}
`
  },
  {
    value: 'cpp', label: 'C++', logo: cppLogo,
    starter: `#include <iostream>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    long long a, b;
    cin >> a >> b;
    cout << a + b << "\\n";
    return 0;
}
`
  },
  {
    value: 'c', label: 'C', logo: cLogo,
    starter: `#include <stdio.h>

int main(void) {
    long long a, b;
    scanf("%lld %lld", &a, &b);
    printf("%lld\\n", a + b);
    return 0;
}
`
  }
];

export const getLanguage = (value) => LANGUAGES.find((l) => l.value === value) || LANGUAGES[0];

// Человекочитаемые вердикты Judge (см. judge/README.md)
export const VERDICTS = {
  ACCEPTED: { label: 'Принято', tone: 'ok' },
  WRONG_ANSWER: { label: 'Неверный ответ', tone: 'bad' },
  TIME_LIMIT_EXCEEDED: { label: 'Превышено время', tone: 'warn' },
  MEMORY_LIMIT_EXCEEDED: { label: 'Превышена память', tone: 'warn' },
  RUNTIME_ERROR: { label: 'Ошибка выполнения', tone: 'bad' },
  COMPILATION_ERROR: { label: 'Ошибка компиляции', tone: 'bad' }
};

// Ограничения, зашитые в бэкенде (service/round.go) и в БД
export const LIMITS = {
  timeMs: 2000,
  memoryMb: 256,
  roomCapacity: { min: 1, max: 15 },
  roundSeconds: { min: 30, max: 7200 },
  chatPayload: 4000
};
