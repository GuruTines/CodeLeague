import React, { useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { hueFor, initials } from '../../lib/format';

export function Button({
  variant = 'ghost', size = 'md', icon: Icon, iconRight: IconRight, loading = false,
  as: Tag = 'button', className = '', children, disabled, ...props
}) {
  const isButton = Tag === 'button';
  return (
    <Tag
      className={`btn btn-${variant} btn-${size} ${className}`}
      disabled={isButton ? disabled || loading : undefined}
      aria-disabled={!isButton && (disabled || loading) ? true : undefined}
      type={isButton ? props.type || 'button' : undefined}
      {...props}
    >
      {loading ? <Loader2 size={16} className="spin" /> : Icon ? <Icon size={size === 'sm' ? 15 : 17} /> : null}
      {children ? <span>{children}</span> : null}
      {IconRight && !loading ? <IconRight size={size === 'sm' ? 15 : 17} /> : null}
    </Tag>
  );
}

export function Spinner({ label = 'Загрузка' }) {
  return (
    <div className="spinner" role="status">
      <Loader2 size={20} className="spin" />
      <span>{label}</span>
    </div>
  );
}

export function Avatar({ name = '?', id, size = 36, className = '' }) {
  const hue = hueFor(String(id ?? name));
  return (
    <span
      className={`avatar ${className}`}
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.38),
        background: `linear-gradient(140deg, hsl(${hue} 70% 58%), hsl(${(hue + 50) % 360} 70% 42%))`
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function Badge({ tone = 'neutral', icon: Icon, children, title }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {Icon ? <Icon size={12} /> : null}
      {children}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="empty">
      {Icon ? <span className="empty-icon"><Icon size={22} /></span> : null}
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className={`field ${error ? 'field-error' : ''}`}>
      {label ? <label htmlFor={htmlFor}>{label}</label> : null}
      {children}
      {error ? <p className="field-msg field-msg-error">{error}</p> : hint ? <p className="field-msg">{hint}</p> : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, description }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="switch-row" onClick={() => onChange(!checked)}>
      <span className="switch-text">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <span className={`switch ${checked ? 'on' : ''}`}><span /></span>
    </button>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value}
          className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}
        >
          {o.icon ? <o.icon size={15} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CopyButton({ text, label = 'Копировать', doneLabel = 'Скопировано', size = 'sm', variant = 'quiet', onCopied }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setDone(true);
    onCopied?.();
    setTimeout(() => setDone(false), 1800);
  };
  return (
    <Button variant={variant} size={size} icon={done ? Check : Copy} onClick={copy}>
      {done ? doneLabel : label}
    </Button>
  );
}
