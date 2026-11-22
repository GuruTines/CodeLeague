import React from 'react';
import { CopyButton } from './index';

// Безопасный мини-рендер условия задачи: абзацы, `код` и блоки ``` ```.
// Никакого dangerouslySetInnerHTML — только текстовые узлы React.
function renderInline(text, keyPrefix) {
  return text.split(/(`[^`\n]+`)/g).map((part, i) =>
    part.startsWith('`') && part.endsWith('`') && part.length > 2
      ? <code key={`${keyPrefix}-${i}`}>{part.slice(1, -1)}</code>
      : <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>
  );
}

export function parseBlocks(source = '') {
  const blocks = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(source))) {
    if (m.index > last) blocks.push({ type: 'text', value: source.slice(last, m.index) });
    blocks.push({ type: 'code', lang: m[1], value: m[2].replace(/\n$/, '') });
    last = re.lastIndex;
  }
  if (last < source.length) blocks.push({ type: 'text', value: source.slice(last) });
  return blocks;
}

export function CodeBlock({ code, lang, copy = true }) {
  return (
    <div className="codeblock">
      <div className="codeblock-bar">
        <span>{lang || 'текст'}</span>
        {copy ? <CopyButton text={code} size="sm" /> : null}
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

export default function RichText({ text }) {
  return (
    <div className="richtext">
      {parseBlocks(text).map((b, i) => {
        if (b.type === 'code') return <CodeBlock key={i} code={b.value} lang={b.lang} />;
        return b.value
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p, j) => (
            <p key={`${i}-${j}`}>
              {p.split('\n').map((line, k, arr) => (
                <React.Fragment key={k}>
                  {renderInline(line, `${i}-${j}-${k}`)}
                  {k < arr.length - 1 ? <br /> : null}
                </React.Fragment>
              ))}
            </p>
          ));
      })}
    </div>
  );
}
