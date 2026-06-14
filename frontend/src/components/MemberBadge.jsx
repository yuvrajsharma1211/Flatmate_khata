import React from 'react';

const PALETTE = [
  { bg: 'rgba(139, 92, 246, 0.18)', fg: '#c4b5fd' },
  { bg: 'rgba(244, 63, 94, 0.14)', fg: '#fb7185' },
  { bg: 'rgba(34, 197, 94, 0.14)', fg: '#86efac' },
  { bg: 'rgba(251, 191, 36, 0.14)', fg: '#fbbf24' },
  { bg: 'rgba(56, 189, 248, 0.14)', fg: '#7dd3fc' },
  { bg: 'rgba(148, 163, 184, 0.14)', fg: '#cbd5e1' }
];

function hashName(name) {
  return Array.from(name).reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

const MemberBadge = ({ name }) => {
  const safeName = name || 'Unknown';
  const index = hashName(safeName) % PALETTE.length;
  const { bg, fg } = PALETTE[index];

  return (
    <span
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-xs font-semibold mono-data"
      style={{ backgroundColor: bg, color: fg }}
      title={safeName}
      aria-label={safeName}
    >
      {getInitials(safeName)}
    </span>
  );
};

export default MemberBadge;
