import React from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/layout/Layout';
import RequireAuth from './components/layout/RequireAuth';
import Landing from './pages/Landing';
import Catalog from './pages/Catalog';
import CreateRoom from './pages/CreateRoom';
import Profile from './pages/Profile';
import Rooms from './pages/Rooms';
import JoinRoom from './pages/JoinRoom';
import RoomPage from './pages/room/RoomPage';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout footer />}>
        <Route index element={<Landing />} />
        <Route path="tasks" element={<Catalog />} />
        <Route path="tasks/:taskId" element={<Catalog />} />
        <Route path="rooms" element={<RequireAuth text="Войдите, чтобы увидеть открытые комнаты."><Rooms /></RequireAuth>} />
        <Route path="rooms/new" element={<RequireAuth text="Войдите, чтобы создать комнату для команды."><CreateRoom /></RequireAuth>} />
        <Route path="profile" element={<RequireAuth text="Войдите, чтобы увидеть свои комнаты."><Profile /></RequireAuth>} />
        <Route path="join/:roomId" element={<RequireAuth title="Вас пригласили в комнату" text="Войдите или создайте аккаунт, чтобы присоединиться."><JoinRoom /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route element={<Layout footer={false} />}>
        <Route path="rooms/:roomId" element={<RequireAuth text="Войдите, чтобы зайти в комнату."><RoomPage /></RequireAuth>} />
      </Route>
    </Routes>
  );
}
