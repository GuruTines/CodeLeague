// Стартовый код и описание сигнатуры задачи («решение — функция», как на LeetCode).
//
// Сигнатура приходит с бэкенда: { name, params: [{ name, type }], return_type }.
// Типы: int | long | double | bool | string, с необязательным суффиксом [] или [][].
// Таблица соответствия типов ДОЛЖНА совпадать с judge (judge/codeleague-judge/README.md,
// «Режим функций» и src/function/harness.rs): шаблон ниже — ровно то, что ждёт harness.

const parseType = (text) => {
  let base = String(text || '').trim();
  let dims = 0;
  while (base.endsWith('[]')) { base = base.slice(0, -2); dims += 1; }
  return { base, dims };
};

const ident = (name, i) => {
  const clean = String(name || '').replace(/[^A-Za-z0-9_]/g, '_');
  if (!clean) return `arg${i}`;
  return /^[0-9]/.test(clean) ? `_${clean}` : clean;
};

const normalize = (signature) => ({
  name: ident(signature.name, 0),
  params: (signature.params || []).map((p, i) => ({ name: ident(p.name, i), type: parseType(p.type) })),
  ret: parseType(signature.return_type),
});

const isNumber = (base) => base === 'int' || base === 'long' || base === 'double';

// ---- по языкам ---------------------------------------------------------------

const PY = { int: 'int', long: 'int', double: 'float', bool: 'bool', string: 'str' };
const pyType = ({ base, dims }) => `${'list['.repeat(dims)}${PY[base] || base}${']'.repeat(dims)}`;

const GO = { int: 'int', long: 'int64', double: 'float64', bool: 'bool', string: 'string' };
const goType = ({ base, dims }) => `${'[]'.repeat(dims)}${GO[base] || base}`;
const goZero = ({ base, dims }) => (dims ? 'nil' : isNumber(base) ? '0' : base === 'bool' ? 'false' : '""');

const RUST = { int: 'i32', long: 'i64', double: 'f64', bool: 'bool', string: 'String' };
const rustType = ({ base, dims }) => `${'Vec<'.repeat(dims)}${RUST[base] || base}${'>'.repeat(dims)}`;

const CPP = { int: 'int', long: 'long long', double: 'double', bool: 'bool', string: 'std::string' };
const cppType = ({ base, dims }) => `${'std::vector<'.repeat(dims)}${CPP[base] || base}${'>'.repeat(dims)}`;
const cppZero = ({ base, dims }) => (dims ? '{}' : isNumber(base) ? '0' : base === 'bool' ? 'false' : '""');

const C = { int: 'int', long: 'long long', double: 'double', bool: 'bool', string: 'char*' };
const cBase = ({ base }) => C[base] || base;
const cZero = ({ base }) => (isNumber(base) ? '0' : base === 'bool' ? 'false' : '""');

const BUILDERS = {
  python: (s) => `def ${s.name}(${s.params.map((p) => `${p.name}: ${pyType(p.type)}`).join(', ')}) -> ${pyType(s.ret)}:\n    # Ваш код здесь\n    pass\n`,

  go: (s) => `package main\n\nfunc ${s.name}(${s.params.map((p) => `${p.name} ${goType(p.type)}`).join(', ')}) ${goType(s.ret)} {\n\t// Ваш код здесь\n\treturn ${goZero(s.ret)}\n}\n`,

  rust: (s) => `fn ${s.name}(${s.params.map((p) => `${p.name}: ${rustType(p.type)}`).join(', ')}) -> ${rustType(s.ret)} {\n    // Ваш код здесь\n    todo!()\n}\n`,

  cpp: (s) => {
    const params = s.params.map((p) => `${cppType(p.type)}${p.type.dims ? '&' : ''} ${p.name}`).join(', ');
    return `#include <string>\n#include <vector>\n\n${cppType(s.ret)} ${s.name}(${params}) {\n    // Ваш код здесь\n    return ${cppZero(s.ret)};\n}\n`;
  },

  // В C нет обобщённого кода: за массивом идёт его длина, а массив в ответе возвращается
  // указателем на malloc-память с длиной через завершающие out-параметры.
  c: (s) => {
    const params = [];
    s.params.forEach((p) => {
      const { dims } = p.type;
      params.push(`${cBase(p.type)}${'*'.repeat(dims)} ${p.name}`);
      if (dims >= 1) params.push(`int ${p.name}_size`);
      if (dims >= 2) params.push(`int* ${p.name}_cols`);
    });
    const { dims } = s.ret;
    if (dims >= 1) params.push('int* return_size');
    if (dims >= 2) params.push('int** return_cols');
    const body = dims === 0
      ? `    return ${cZero(s.ret)};`
      : `    // Верните malloc-массив, а его длину запишите в *return_size${dims >= 2 ? ' (длины строк — в *return_cols)' : ''}\n    *return_size = 0;\n${dims >= 2 ? '    *return_cols = NULL;\n' : ''}    return NULL;`;
    return `#include <stdbool.h>\n#include <stdlib.h>\n#include <string.h>\n\n${cBase(s.ret)}${'*'.repeat(dims)} ${s.name}(${params.join(', ')}) {\n    // Ваш код здесь\n${body}\n}\n`;
  },
};

const NO_SIGNATURE = 'Для этой задачи не задана сигнатура функции — решение нельзя проверить. Сообщите администратору.';

/** Стартовый код на языке `language` для задачи с сигнатурой `signature`. */
export function buildStarter(language, signature) {
  if (!signature?.name) return `${language === 'python' ? '#' : '//'} ${NO_SIGNATURE}\n`;
  const build = BUILDERS[language];
  return build ? build(normalize(signature)) : '';
}

/** `two_sum(nums: int[], target: int) → int[]` */
export function describeSignature(signature) {
  if (!signature?.name) return '';
  const params = (signature.params || []).map((p) => `${p.name}: ${p.type}`).join(', ');
  return `${signature.name}(${params}) → ${signature.return_type}`;
}

// JSON с пробелами после запятых в массивах: [2, 7, 11, 15]
const showValue = (v) => (Array.isArray(v) ? `[${v.map(showValue).join(', ')}]` : JSON.stringify(v));

/** Аргументы примера по именам параметров: `nums = [2, 7]` / `target = 9`. Если не разобрать — как есть. */
export function formatSampleInput(signature, input) {
  const params = signature?.params;
  if (!params?.length) return input;
  try {
    const args = JSON.parse(input);
    if (!Array.isArray(args) || args.length !== params.length) return input;
    return params.map((p, i) => `${p.name} = ${showValue(args[i])}`).join('\n');
  } catch {
    return input;
  }
}
