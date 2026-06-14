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
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="mono-data text-sm uppercase tracking-[0.1em] text-ink-muted">Loading expense...</p>
      </div>
    );
  }

  if (error || !expense) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper p-4">
        <div className="w-full max-w-lg border border-paper-line bg-[#fffdf8] p-6">
          <h1 className="text-2xl text-teal">Expense not available</h1>
          <p className="mt-2 text-sm text-rust">{error || 'Unknown error'}</p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mt-4 border border-teal bg-teal-soft px-4 py-2 text-sm font-semibold text-teal"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-4xl border border-paper-line bg-[#fffdf8] p-5">
        <button
          type="button"
          onClick={() => navigate(`/groups/${expense.group_id}`)}
          className="mono-data text-xs uppercase tracking-[0.12em] text-ink-muted hover:text-teal"
        >
          back to group
        </button>

        <header className="mt-4 border-b border-paper-line pb-4">
          <h1 className="text-3xl text-teal">{expense.description}</h1>
          <p className="mt-1 text-sm text-ink-muted">Paid by {expense.payer?.name || 'Unknown'} on {new Date(expense.expense_date).toLocaleDateString('en-GB')}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill label={expense.split_type} tone="neutral" />
            <StatusPill label={expense.status} tone={expense.status === 'voided' ? 'negative' : 'positive'} />
            <span className="mono-data text-sm text-ink">INR {toNumber(expense.amount_base).toFixed(2)}</span>
          </div>
        </header>

        <section className="mt-5">
          <h2 className="text-xl text-teal">Split Breakdown</h2>
          <p className="mt-1 text-sm text-ink-muted">Each row is part of the total, so balances can be verified without hidden math.</p>
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

          <div className="mt-4 grid gap-2 border border-paper-line bg-paper p-3 text-sm sm:grid-cols-2">
            <p className="text-ink-muted">Original amount: <span className="mono-data text-ink">{expense.currency} {toNumber(expense.original_amount).toFixed(2)}</span></p>
            <p className="text-ink-muted">Exchange rate: <span className="mono-data text-ink">{toNumber(expense.exchange_rate).toFixed(4)}</span></p>
            <p className="text-ink-muted">Amount in base: <span className="mono-data text-ink">INR {toNumber(expense.amount_base).toFixed(2)}</span></p>
            <p className="text-ink-muted">Split total: <span className="mono-data text-ink">INR {splitTotal.toFixed(2)}</span></p>
          </div>

          {expense.notes ? (
            <div className="mt-4 border border-paper-line bg-paper p-3 text-sm text-ink">
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
