import React, { useState } from 'react';
import Modal from './Modal';
import { Button } from './index';

export default function ConfirmModal({ open, title, text, confirmLabel = 'Подтвердить', danger = false, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };
  return (
    <Modal
      open={open} title={title} onClose={onClose} width={440}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Отмена</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={run} loading={busy}>{confirmLabel}</Button>
        </>
      )}
    >
      <p className="modal-text">{text}</p>
    </Modal>
  );
}
