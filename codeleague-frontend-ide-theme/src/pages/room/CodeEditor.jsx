import React, { useRef } from 'react';

// Лёгкий редактор кода: textarea с номерами строк, Tab и автоотступом.
// Без Monaco/CodeMirror, чтобы не тянуть мегабайты в бандл; при желании
// заменяется одним компонентом с тем же интерфейсом (value/onChange).
export default function CodeEditor({ value, onChange, readOnly = false, language = '', minLines = 14, label = 'Код решения' }) {
  const areaRef = useRef(null);
  const gutterRef = useRef(null);
  const lineCount = Math.max(value.split('\n').length, minLines);
  const numbers = Array.from({ length: lineCount }, (_, i) => i + 1).join('\n');
  const useTabs = language === 'go';
  const extension = ({ python: 'py', go: 'go', rust: 'rs', c: 'c', cpp: 'cpp' })[language] || 'txt';

  const insert = (text) => {
    const el = areaRef.current;
    el.focus();
    // execCommand сохраняет историю отмены (Ctrl+Z); setRangeText — запасной вариант
    if (!document.execCommand('insertText', false, text)) {
      const { selectionStart: s, selectionEnd: e } = el;
      el.setRangeText(text, s, e, 'end');
      onChange(el.value);
    }
  };

  const onKeyDown = (e) => {
    if (readOnly) return;
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      insert(useTabs ? '\t' : '    ');
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      const el = areaRef.current;
      const before = el.value.slice(0, el.selectionStart);
      const line = before.slice(before.lastIndexOf('\n') + 1);
      const indent = (line.match(/^[ \t]*/) || [''])[0];
      const extra = /[{(\[:]$/.test(line.trimEnd()) ? (useTabs ? '\t' : '    ') : '';
      if (indent || extra) { e.preventDefault(); insert(`\n${indent}${extra}`); }
    }
  };

  return (
    <div className={`editor ${readOnly ? 'readonly' : ''}`}>
      <div className="editor-windowbar">
        <span className="editor-window-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="editor-file-tab"><span className="editor-file-icon">‹›</span> solution.{extension}</span>
        <span className="editor-window-meta">{readOnly ? 'READ ONLY' : 'CodeLeague'}</span>
      </div>
      <div className="editor-content">
        <pre className="editor-gutter" ref={gutterRef} aria-hidden="true">{numbers}</pre>
        <textarea
          ref={areaRef} className="editor-area" aria-label={label}
          value={value} readOnly={readOnly} spellCheck={false} wrap="off"
          autoCapitalize="off" autoComplete="off" autoCorrect="off"
          onChange={(e) => onChange?.(e.target.value)} onKeyDown={onKeyDown}
          onScroll={(e) => { if (gutterRef.current) gutterRef.current.scrollTop = e.target.scrollTop; }}
          style={{ tabSize: 4 }}
        />
      </div>
    </div>
  );
}
