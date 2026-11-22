import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Info, LogIn, LogOut, Send, WifiOff } from 'lucide-react';
import RichText from '../../components/ui/RichText';
import { Avatar, Button } from '../../components/ui';
import { formatTime } from '../../lib/format';
import { LIMITS } from '../../lib/languages';

// Общая доска комнаты: все участники пишут сообщения (WebSocket, тип chat).
// Бэкенд рассылает сообщение и отправителю тоже, поэтому свои сообщения
// появляются только после эха сервера — так порядок всегда одинаковый у всех.
export default function BoardPanel({ messages, nameOf, myId, socketState, onSend, onReconnect }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);
  const stick = useRef(true);
  const open = socketState === 'open';
  const over = text.length > LIMITS.chatPayload;

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => { stick.current = true; }, []);

  const send = () => {
    const value = text.trim();
    if (!value || over || !open) return;
    if (onSend(value)) { setText(''); stick.current = true; }
  };

  return (
    <div className="board">
      <div
        className="board-feed" ref={listRef}
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
      >
        <p className="board-note"><Info size={14} /> История сообщений не сохраняется: вы видите всё, что написано с момента вашего входа.</p>
        {messages.length === 0 ? (
          <div className="board-empty">
            <h3>Доска пока пуста</h3>
            <p>Напишите первое сообщение — его увидят все, кто сейчас в комнате.</p>
          </div>
        ) : null}
        {messages.map((m) => {
          if (m.kind === 'system') {
            return (
              <div key={m.id} className="msg-system">
                {m.event === 'user_joined' ? <LogIn size={13} /> : <LogOut size={13} />}
                <span>{nameOf(m.userId)} {m.event === 'user_joined' ? 'вошёл в комнату' : 'вышел из комнаты'}</span>
              </div>
            );
          }
          const mine = String(m.userId) === String(myId);
          return (
            <div key={m.id} className={`msg ${mine ? 'mine' : ''}`}>
              <Avatar name={nameOf(m.userId)} id={m.userId} size={32} />
              <div className="msg-body">
                <div className="msg-head">
                  <strong>{mine ? 'Вы' : nameOf(m.userId)}</strong>
                  <time>{formatTime(m.at)}</time>
                </div>
                <div className="msg-text"><RichText text={m.text} /></div>
              </div>
            </div>
          );
        })}
      </div>

      {!open ? (
        <div className="board-offline" role="status">
          <WifiOff size={15} />
          <span>{socketState === 'closed' ? 'Нет соединения с комнатой.' : 'Соединяемся с комнатой…'}</span>
          {socketState === 'closed' ? <Button size="sm" variant="ghost" onClick={onReconnect}>Переподключиться</Button> : null}
        </div>
      ) : null}

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea
          value={text} rows={1} placeholder={open ? 'Сообщение для всех в комнате' : 'Сообщения недоступны без соединения'}
          aria-label="Сообщение" disabled={!open}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <Button type="submit" variant="accent" icon={Send} disabled={!open || !text.trim() || over} aria-label="Отправить сообщение" />
        {text.length > LIMITS.chatPayload - 400 ? (
          <span className={`composer-count ${over ? 'over' : ''}`}>{text.length}/{LIMITS.chatPayload}</span>
        ) : null}
      </form>
    </div>
  );
}
