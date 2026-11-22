import React from 'react';
import { Link } from 'react-router-dom';
import { Flag, Link2, Timer, UsersRound } from 'lucide-react';
import GradientLines from '../components/landing/GradientLines';
import LanguageMarquee from '../components/landing/LanguageMarquee';
import RoomPreview from '../components/landing/RoomPreview';
import { Button } from '../components/ui';
import { useAuth } from '../context/AuthContext';

const STEPS = [
  { icon: UsersRound, title: 'Создайте комнату', text: 'Название, число мест до 15 и режим доступа. Задачи выбираются из каталога.' },
  { icon: Link2, title: 'Позовите команду', text: 'Отправьте ссылку-приглашение. В закрытую комнату можно войти только по ней.' },
  { icon: Timer, title: 'Запустите раунд', text: 'Администратор выбирает задачу и время. Каждый пишет своё решение отдельно.' },
  { icon: Flag, title: 'Разберите решения', text: 'Когда все сдали, решения открываются. Лучшие переносите на общую доску и обсуждайте.' }
];

export default function Landing() {
  const { user, openAuth } = useAuth();
  return (
    <>
      <section className="hero">
        <div className="hero-bg" aria-hidden="true" />
        <GradientLines />
        <div className="hero-inner">
          <h1>Решайте задачи вместе и сравнивайте решения вживую</h1>
          <p className="hero-lead">
            Комната на всю команду: один таймер, одна задача, у каждого свой редактор.
            Когда время вышло, вы видите, как это решили остальные.
          </p>
          <div className="hero-cta">
            <Button as={Link} to="/rooms/new" variant="primary" size="lg">Создать комнату</Button>
            {user ? (
              <Button as={Link} to="/profile" variant="glass" size="lg">Мои комнаты</Button>
            ) : (
              <Button variant="glass" size="lg" onClick={() => openAuth('register')}>Создать аккаунт</Button>
            )}
          </div>
          <p className="hero-sub">Или <Link to="/rooms">зайдите в открытую комнату</Link> / <Link to="/tasks">посмотрите каталог задач</Link>.</p>
        </div>
        <div className="hero-langs">
          <p>Решайте на любом из пяти языков</p>
          <LanguageMarquee />
        </div>
      </section>

      <section className="section section-preview">
        <div className="container">
          <RoomPreview />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title">Как проходит раунд</h2>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="step-num">{i + 1}</span>
                <s.icon size={22} className="step-icon" />
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section-cta">
        <div className="container cta-band">
          <div>
            <h2>Первая комната — за минуту</h2>
            <p>Достаточно названия. Задачи и участников можно добавить позже.</p>
          </div>
          <Button as={Link} to="/rooms/new" variant="primary" size="lg">Создать комнату</Button>
        </div>
      </section>
    </>
  );
}
