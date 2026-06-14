import React from 'react';
import StatusPill from './StatusPill';

function formatDate(dateValue) {
  return new Date(dateValue).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function formatAmount(value, currency = 'INR') {
  const number = Number(value || 0);
  const symbol = currency === 'INR' ? 'INR' : currency;
  const sign = number > 0 ? '+' : '';

  return `${sign}${symbol} ${number.toFixed(2)}`;
}

function toneFromAmount(value) {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

const LedgerRow = ({
  date,
  description,
  amount,
  currency = 'INR',
  splitType,
  note,
  rightMeta,
  compact = false,
  onClick
}) => {
  const interactive = typeof onClick === 'function';

  return (
    <div
      className={`border-b border-dashed border-paper-line ${compact ? 'py-2' : 'py-3'} ${interactive ? 'cursor-pointer hover:bg-white/[0.04]' : ''}`}
      onClick={interactive ? onClick : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
    >
      <div className="grid grid-cols-[100px_1fr_auto] items-start gap-3 sm:grid-cols-[120px_1fr_auto]">
        <div className="mono-data text-[11px] uppercase tracking-[0.08em] text-ink-muted">
          {formatDate(date)}
        </div>
        <div>
          <p className="text-sm text-ink">{description}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {splitType ? <StatusPill label={splitType} tone="neutral" /> : null}
            {note ? <span className="text-xs text-ink-muted">{note}</span> : null}
          </div>
        </div>
        <div className="text-right">
          <div className={`mono-data text-sm font-medium ${amount < 0 ? 'text-rust' : amount > 0 ? 'text-sage' : 'text-ink'}`}>
            {formatAmount(amount, currency)}
          </div>
          {rightMeta ? <div className="mt-1 text-[11px] text-ink-muted">{rightMeta}</div> : null}
          {!rightMeta ? <StatusPill label={toneFromAmount(amount)} tone={toneFromAmount(amount)} /> : null}
        </div>
      </div>
    </div>
  );
};

export default LedgerRow;
