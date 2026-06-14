import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';
import LedgerRow from '../components/LedgerRow';
import StatusPill from '../components/StatusPill';

function toNumber(value) {
  return Number.parseFloat(value || 0);
}

const ExpenseDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchExpense();
  }, [id]);

  const fetchExpense = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get(`/expenses/${id}`);
      setExpense(response.data.expense);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load expense details.');
    } finally {
      setLoading(false);
    }
  };

  const splitTotal = useMemo(() => {
    if (!expense?.splits) return 0;
    return expense.splits.reduce((sum, split) => sum + toNumber(split.owed_amount), 0);
  }, [expense]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f17]">
        <p className="mono-data text-sm uppercase tracking-[0.1em] text-gray-400">Loading expense...</p>
      </div>
    );
  }

  if (error || !expense) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f17] p-4">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-glass p-6 shadow-glass">
          <h1 className="text-2xl font-bold text-white">Expense not available</h1>
          <p className="mt-2 text-sm text-rust">{error || 'Unknown error'}</p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mt-4 rounded-xl border border-brand-500/30 bg-brand-600/15 px-4 py-2 text-sm font-semibold text-brand-300"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f17] p-4 text-white sm:p-6 lg:p-8">
      <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-glass-card p-5 shadow-glass">
        <button
          type="button"
          onClick={() => navigate(`/group/${expense.group_id}`)}
          className="mono-data text-xs uppercase tracking-[0.12em] text-gray-400 hover:text-brand-300"
        >
          back to group
        </button>

        <header className="mt-4 border-b border-white/10 pb-4">
          <h1 className="text-3xl font-bold text-white">{expense.description}</h1>
          <p className="mt-1 text-sm text-gray-400">Paid by {expense.payer?.name || 'Unknown'} on {new Date(expense.expense_date).toLocaleDateString('en-GB')}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill label={expense.split_type} tone="neutral" />
            <StatusPill label={expense.status} tone={expense.status === 'voided' ? 'negative' : 'positive'} />
            <span className="mono-data text-sm text-ink">INR {toNumber(expense.amount_base).toFixed(2)}</span>
          </div>
        </header>

        <section className="mt-5">
          <h2 className="text-xl font-bold text-white">Split Breakdown</h2>
          <p className="mt-1 text-sm text-gray-400">Each row is part of the total, so balances can be verified without hidden math.</p>
          <div className="mt-3">
            {expense.splits?.map(split => (
              <LedgerRow
                key={split.id}
                date={expense.expense_date}
                description={`${split.user?.name || 'Unknown'} share`}
                amount={-toNumber(split.owed_amount)}
                currency={expense.currency || 'INR'}
                splitType={expense.split_type}
                note={split.raw_value !== null && split.raw_value !== undefined ? `raw ${split.raw_value}` : ''}
              />
            ))}
          </div>

          <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm sm:grid-cols-2">
            <p className="text-ink-muted">Original amount: <span className="mono-data text-ink">{expense.currency} {toNumber(expense.original_amount).toFixed(2)}</span></p>
            <p className="text-ink-muted">Exchange rate: <span className="mono-data text-ink">{toNumber(expense.exchange_rate).toFixed(4)}</span></p>
            <p className="text-ink-muted">Amount in base: <span className="mono-data text-ink">INR {toNumber(expense.amount_base).toFixed(2)}</span></p>
            <p className="text-ink-muted">Split total: <span className="mono-data text-ink">INR {splitTotal.toFixed(2)}</span></p>
          </div>

          {expense.notes ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-ink">
              <p className="text-xs uppercase tracking-[0.1em] text-ink-muted">Notes</p>
              <p className="mt-1">{expense.notes}</p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default ExpenseDetail;
