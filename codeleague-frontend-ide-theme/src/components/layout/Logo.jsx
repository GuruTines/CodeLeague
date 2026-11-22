import React from 'react';

export function LogoMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9b82ff" />
          <stop offset="1" stopColor="#3fd8e8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="17" fill="#141733" />
      <path d="M26 20 14 32l12 12M38 20l12 12-12 12" fill="none" stroke="url(#lm)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Logo() {
  return (
    <span className="logo">
      <LogoMark />
      <span>CodeLeague</span>
    </span>
  );
}
