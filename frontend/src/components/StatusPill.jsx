import React from 'react';

const STYLE_MAP = {
  positive: 'bg-sage/10 text-sage border-sage/30',
  negative: 'bg-rust/10 text-rust border-rust/30',
  warning: 'bg-gold/15 text-gold border-gold/40',
  neutral: 'bg-teal-soft text-teal border-teal/30'
};

const StatusPill = ({ label, tone = 'neutral' }) => {
  const style = STYLE_MAP[tone] || STYLE_MAP.neutral;

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${style}`}>
      {label}
    </span>
  );
};

export default StatusPill;