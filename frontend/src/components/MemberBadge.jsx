import React from 'react';

const PALETTE = [
  { bg: '#DCE8E5', fg: '#23514B' },
  { bg: '#E6D7C4', fg: '#6D4A2B' },
  { bg: '#E2EBD8', fg: '#4F7A5E' },
  { bg: '#F1D9CE', fg: '#A44E2B' },
  { bg: '#EFE2C8', fg: '#946C22' },
  { bg: '#D9D7E8', fg: '#4A4768' }
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
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-paper-line text-xs font-semibold mono-data"
      style={{ backgroundColor: bg, color: fg }}
      title={safeName}
      aria-label={safeName}
    >
      {getInitials(safeName)}
    </span>
  );
};

export default MemberBadge;