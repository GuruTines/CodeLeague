import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, DoorOpen, LogOut, Menu, User, X } from 'lucide-react';
import Logo from './Logo';
import { Avatar, Button } from '../ui';
import { useAuth } from '../../context/AuthContext';

const NAV = [
  { to: '/tasks', label: 'Каталог задач' },
  { to: '/rooms', label: 'Комнаты', end: true },
  { to: '/rooms/new', label: 'Создать комнату' },
  { to: '/profile', label: 'Профиль' }
];

export default function Header() {
  const { user, status, openAuth, signOut } = useAuth();
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(false);
  const ref = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => { setMenu(false); setMobile(false); }, [location.pathname]);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const logout = async () => { setMenu(false); await signOut(); navigate('/'); };

  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="header-logo" aria-label="CodeLeague — на главную"><Logo /></Link>

        <nav className={`header-nav ${mobile ? 'open' : ''}`} aria-label="Основная навигация">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={Boolean(n.end)} className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
            </NavLink>
          ))}
          <div className="header-nav-auth">
            {user ? null : (
              <>
                <Button variant="ghost" onClick={() => openAuth('login')}>Войти</Button>
                <Button variant="primary" onClick={() => openAuth('register')}>Регистрация</Button>
              </>
            )}
          </div>
        </nav>

        <div className="header-actions">
          {status === 'loading' ? null : user ? (
            <div className="user-menu" ref={ref}>
              <button type="button" className="user-chip" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
                <Avatar name={user.username} id={user.id} size={28} />
                <span className="user-chip-name">{user.username}</span>
                <ChevronDown size={15} />
              </button>
              {menu ? (
                <div className="menu" role="menu">
                  <div className="menu-head">
                    <strong>{user.username}</strong>
                    <small>ID {user.id}</small>
                  </div>
                  <Link role="menuitem" to="/profile"><User size={16} /> Профиль</Link>
                  <Link role="menuitem" to="/profile?tab=mine"><DoorOpen size={16} /> Мои комнаты</Link>
                  <button type="button" role="menuitem" onClick={logout}><LogOut size={16} /> Выйти</button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="header-auth-desktop">
              <Button variant="ghost" onClick={() => openAuth('login')}>Войти</Button>
              <Button variant="primary" onClick={() => openAuth('register')}>Регистрация</Button>
            </div>
          )}
          <button type="button" className="icon-btn header-burger" aria-label={mobile ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={mobile} onClick={() => setMobile((m) => !m)}>
            {mobile ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
    </header>
  );
}
