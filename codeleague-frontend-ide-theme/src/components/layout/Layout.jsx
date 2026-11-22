import React, { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Logo from './Logo';

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <Logo />
        <nav aria-label="Ссылки внизу страницы">
          <Link to="/tasks">Каталог задач</Link>
          <Link to="/rooms/new">Создать комнату</Link>
          <Link to="/profile">Профиль</Link>
        </nav>
        <small>Решайте задачи вместе. Go, Python, Rust, C++ и C.</small>
      </div>
    </footer>
  );
}

export default function Layout({ footer = true }) {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <div className={`layout ${footer ? '' : 'layout-app'}`}>
      <Header />
      <main className="main"><Outlet /></main>
      {footer ? <Footer /> : null}
    </div>
  );
}
