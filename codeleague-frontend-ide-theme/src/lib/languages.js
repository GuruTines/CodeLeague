import goLogo from '../assets/lang/go.svg';
import pythonLogo from '../assets/lang/python.svg';
import rustLogo from '../assets/lang/rust.svg';
import cppLogo from '../assets/lang/cpp.svg';
import cLogo from '../assets/lang/c.svg';

// Список ТОЧНО совпадает с enum Language в judge (c, cpp, python, rust, go).
// Любое другое значение Judge отклонит.
// Стартовый код зависит от задачи (сигнатуры), см. lib/starter.js.
export const LANGUAGES = [
  {
    value: 'go', label: 'Go', logo: goLogo
  },
  {
    value: 'python', label: 'Python', logo: pythonLogo
  },
  {
    value: 'rust', label: 'Rust', logo: rustLogo, monoOnly: true
  },
  {
    value: 'cpp', label: 'C++', logo: cppLogo
  },
  {
    value: 'c', label: 'C', logo: cLogo
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
