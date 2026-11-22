import React from 'react';
import { Crown, Globe, Lock } from 'lucide-react';
import { Avatar, Badge, CopyButton } from '../../components/ui';
import { inviteLink, plural, shortId } from '../../lib/format';

export default function MembersPanel({ roomId, meta, people, online, myId }) {
  const total = people.length;
  return (
    <section className="panel" aria-label="Участники">
      <header className="panel-head">
        <h2>Участники</h2>
        <Badge>{meta.capacity ? `${total} из ${meta.capacity}` : total}</Badge>
      </header>
      <ul className="people">
        {people.map((p) => {
          const mine = String(p.user_id) === String(myId);
          const isOnline = online.has(String(p.user_id));
          return (
            <li key={p.user_id} className={`person${isOnline ? '' : ' offline'}`}>
              <Avatar name={p.username} id={p.user_id} size={34} />
              <div className="person-text">
                <strong>{p.username}{mine ? ' (вы)' : ''}</strong>
                {p.is_admin ? <small className="person-role"><Crown size={12} /> Администратор</small> : null}
              </div>
              <span className={`presence-label${isOnline ? ' on' : ''}`}>
                <i className={`presence${isOnline ? ' on' : ''}`} aria-hidden="true" />
                {isOnline ? 'в сети' : 'не в сети'}
              </span>
            </li>
          );
        })}
      </ul>
      <footer className="panel-foot">
        <div className="invite">
          <div className="invite-label">
            {meta.is_private ? <Lock size={14} /> : <Globe size={14} />}
            {meta.is_private ? 'Только по ссылке' : 'Открытая комната'}
          </div>
          <code className="invite-link" title={inviteLink(roomId)}>…/join/{shortId(roomId)}</code>
          <CopyButton text={inviteLink(roomId)} label="Скопировать приглашение" doneLabel="Ссылка скопирована" variant="ghost" size="md" />
        </div>
        {meta.capacity && total >= meta.capacity ? <p className="panel-hint">Комната заполнена.</p> : null}
        <span className="sr-only">{plural(total, 'участник', 'участника', 'участников')}</span>
      </footer>
    </section>
  );
}