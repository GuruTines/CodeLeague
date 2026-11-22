import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Crown, Globe, Lock, Trash2, Users } from 'lucide-react';
import { Badge, Button, CopyButton } from './ui';
import { inviteLink, plural } from '../lib/format';

export default function RoomCard({ room, onDelete, joinOnly = false, ownLabel = 'Вы администратор', showMembership = false }) {
  const members = room.members_count;
  const full = Boolean(joinOnly && room.capacity && members != null && members >= room.capacity);

  return (
    <article className="room-card">
      <div className="room-card-main">
        <h3>{room.title || 'Комната без названия'}</h3>
        <div className="room-card-meta">
          {room.is_private
            ? <Badge icon={Lock} title="Вход только по ссылке">Закрытая</Badge>
            : <Badge icon={Globe} title="Видна в списке открытых комнат">Открытая</Badge>}
          {room.is_admin ? <Badge tone="violet" icon={Crown}>{ownLabel}</Badge> : null}
          {showMembership && !room.is_admin && !joinOnly ? <Badge tone="ok" icon={Check}>Вы участник</Badge> : null}
          {room.capacity ? (
            <Badge icon={Users}>
              {members != null ? `${members} из ${room.capacity}` : `${room.capacity} ${plural(room.capacity, 'место', 'места', 'мест')}`}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="room-card-actions">
        {joinOnly ? (
          full ? (
            <Button variant="ghost" size="sm" disabled>Мест нет</Button>
          ) : (
            <Button as={Link} to={`/join/${room.id}`} variant="primary" size="sm">Присоединиться</Button>
          )
        ) : (
          <Button as={Link} to={`/rooms/${room.id}`} variant="primary" size="sm">Открыть</Button>
        )}
        <CopyButton text={inviteLink(room.id)} label="Ссылка" doneLabel="Скопировано" size="sm" variant="ghost" />
        {room.is_admin && onDelete ? (
          <Button variant="quiet" size="sm" icon={Trash2} aria-label="Удалить комнату" title="Удалить комнату" onClick={() => onDelete(room)} />
        ) : null}
      </div>
    </article>
  );
}