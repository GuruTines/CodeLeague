import React from 'react';
import { LANGUAGES } from '../../lib/languages';

// Бегущая строка с логотипами языков (аналог блока «Нам доверяют» на сайте Codex).
// Логотипы белые, при наведении возвращают фирменный цвет.
export default function LanguageMarquee() {
  const row = (suffix) => (
    <ul className="marquee-track" aria-hidden={suffix ? 'true' : undefined} key={suffix || 'a'}>
      {[...LANGUAGES, ...LANGUAGES].map((lang, i) => (
        <li key={`${lang.value}-${i}`} className={`marquee-item ${lang.monoOnly ? 'mono-only' : ''}`}>
          <img src={lang.logo} alt="" width="34" height="34" />
          <span>{lang.label}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="marquee" role="group" aria-label="Поддерживаемые языки: Go, Python, Rust, C++, C">
      <div className="marquee-rail">{row('')}{row('b')}</div>
    </div>
  );
}
