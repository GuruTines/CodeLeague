import React from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button, EmptyState } from '../components/ui';

export default function NotFound() {
  return (
    <div className="page-center">
      <EmptyState
        icon={Compass} title="Такой страницы нет"
        text="Возможно, ссылка устарела или в адресе опечатка."
        action={<Button as={Link} to="/" variant="primary">На главную</Button>}
      />
    </div>
  );
}
