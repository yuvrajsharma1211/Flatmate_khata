import React, { useState } from 'react';
import MemberBadge from './MemberBadge';
import LedgerRow from './LedgerRow';

function formatBalance(value) {
  const amount = Number(value || 0);
  const sign = amount > 0 ? '+' : '';
  return `${sign}INR ${amount.toFixed(2)}`;
}

const BalanceAccordionItem = ({
  member,
  netBalance,
  onLoadBreakdown,
  breakdown = [],
  isLoading = false,
  error = '',
  onBreakdownRowClick
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const balanceClass = netBalance < 0 ? 'text-rust' : netBalance > 0 ? 'text-sage' : 'text-ink';

  const handleToggle = async () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next && breakdown.length === 0 && onLoadBreakdown) {
      await onLoadBreakdown(member.userId);
    }
  };

  return (
    <div className="border-b border-dashed border-paper-line">
      <button
        type="button"
        onClick={handleToggle}
        className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-1 py-3 text-left"
      >
        <MemberBadge name={member.name} />
        <span className="text-sm font-semibold text-ink">{member.name}</span>
        <span className={`mono-data text-sm font-semibold ${balanceClass}`}>{formatBalance(netBalance)}</span>
        <span className="mono-data text-xs text-ink-muted">{isOpen ? '−' : '+'}</span>
      </button>

      {isOpen ? (
        <div className="mb-3 ml-11 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          {isLoading ? <p className="text-sm text-ink-muted">Loading passbook lines...</p> : null}
          {error ? <p className="text-sm text-rust">{error}</p> : null}
          {!isLoading && !error && breakdown.length === 0 ? (
            <p className="text-sm text-ink-muted">No drill-down entries.</p>
          ) : null}
          {!isLoading && !error
            ? breakdown.map(row => (
                <LedgerRow
                  key={`${row.type}-${row.id}-${row.date}`}
                  date={row.date}
                  description={row.description}
                  amount={Number(row.change)}
                  currency={row.currency || 'INR'}
                  splitType={row.split_type || row.type}
                  compact
                  onClick={typeof onBreakdownRowClick === 'function' ? () => onBreakdownRowClick(row) : undefined}
                />
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
};

export default BalanceAccordionItem;
