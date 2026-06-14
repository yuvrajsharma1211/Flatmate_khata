import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';
import SidebarShell from '../components/SidebarShell';
import LedgerRow from '../components/LedgerRow';
import BalanceAccordionItem from '../components/BalanceAccordionItem';
import MemberBadge from '../components/MemberBadge';
import StatusPill from '../components/StatusPill';

function prettifySettingKey(key) {
  return key.replace(/_/g, ' ');
}

function toNumber(value) {
  return Number.parseFloat(value || 0);
}

function inferSplitTone(splitType) {
  if (splitType === 'percentage') return 'warning';
  if (splitType === 'share') return 'neutral';
  return 'neutral';
}

function getMemberName(member) {
  return member?.user?.name || member?.name || `Member ${member?.user_id || member?.id || ''}`.trim();
}

const GroupDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [balances, setBalances] = useState([]);
  const [debts, setDebts] = useState([]);
  const [breakdownMap, setBreakdownMap] = useState({});
  const [breakdownLoading, setBreakdownLoading] = useState({});
  const [breakdownError, setBreakdownError] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('expenses');

  useEffect(() => {
    fetchGroupDetails();
    fetchBalances();
  }, [id]);

  const fetchGroupDetails = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get(`/groups/${id}`);
      setGroup(response.data.group);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch group details.');
    } finally {
      setLoading(false);
    }
  };

  const fetchBalances = async () => {
    try {
      const response = await api.get(`/groups/${id}/balances`);
      setBalances(response.data.balances || []);
      setDebts(response.data.simplifiedDebts || []);
    } catch (err) {
      console.error('Error fetching balances:', err);
    }
  };

  const loadBreakdown = async (userId) => {
    if (breakdownMap[userId]) {
      return;
    }

    setBreakdownLoading(prev => ({ ...prev, [userId]: true }));
    setBreakdownError(prev => ({ ...prev, [userId]: '' }));

    try {
      const response = await api.get(`/groups/${id}/balances/${userId}`);
      setBreakdownMap(prev => ({ ...prev, [userId]: response.data.breakdown || [] }));
    } catch (err) {
      setBreakdownError(prev => ({
        ...prev,
        [userId]: err.response?.data?.error || 'Could not load passbook lines.'
      }));
    } finally {
      setBreakdownLoading(prev => ({ ...prev, [userId]: false }));
    }
  };

  const totalExpenses = useMemo(() => {
    if (!group) return 0;
    return group.expenses.filter(expense => expense.status === 'active').reduce((sum, expense) => sum + toNumber(expense.amount_base), 0);
  }, [group]);

  const totalSettlements = useMemo(() => {
    if (!group) return 0;
    return group.settlements.reduce((sum, settlement) => sum + toNumber(settlement.amount_base), 0);
  }, [group]);

  const memberList = useMemo(() => {
    if (!group) return [];
    return [...(group.members || [])].sort((a, b) => getMemberName(a).localeCompare(getMemberName(b)));
  }, [group]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f17]">
        <p className="mono-data text-sm uppercase tracking-[0.12em] text-gray-400">Loading ledger...</p>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f17] p-4">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-glass p-6 shadow-glass">
          <h2 className="text-2xl font-bold text-white">Unable to open ledger</h2>
          <p className="mt-3 text-sm text-gray-400">{error || 'Group not found.'}</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-5 rounded-xl border border-brand-500/30 bg-brand-600/15 px-4 py-2 text-sm font-semibold text-brand-300"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f17] text-white lg:grid lg:grid-cols-[256px_1fr]">
      <SidebarShell
        groupName={group.name}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        onBack={() => navigate('/')}
      />

      <main className="p-4 sm:p-6 lg:p-8">
        <header className="mb-6 border-b border-white/10 pb-4">
          <h2 className="text-3xl font-extrabold tracking-tight text-white">Household Khata</h2>
          <p className="mt-1 text-sm text-gray-400">Track shared expenses, passbook balances, and settlement trails.</p>
        </header>

        {activeSection === 'expenses' ? (
          <section className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="ledger-paper rounded-xl p-4 shadow-glass">
                <p className="text-xs uppercase tracking-[0.12em] text-ink-muted">Total Expenses</p>
                <p className="mono-data mt-2 text-xl text-ink">INR {totalExpenses.toFixed(2)}</p>
              </div>
              <div className="ledger-paper rounded-xl p-4 shadow-glass">
                <p className="text-xs uppercase tracking-[0.12em] text-ink-muted">Total Settled</p>
                <p className="mono-data mt-2 text-xl text-sage">INR {totalSettlements.toFixed(2)}</p>
              </div>
              <div className="ledger-paper rounded-xl p-4 shadow-glass">
                <p className="text-xs uppercase tracking-[0.12em] text-ink-muted">Base Currency</p>
                <p className="mono-data mt-2 text-xl text-teal">{group.base_currency}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-glass-card p-5 shadow-glass">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">Expense Register</h3>
                <StatusPill label={`${group.expenses.length} entries`} tone="neutral" />
              </div>

              {group.expenses.length === 0 ? (
                <p className="py-6 text-sm text-ink-muted">No expenses logged yet.</p>
              ) : (
                <div>
                  {group.expenses.map(expense => {
                    const amountBase = toNumber(expense.amount_base);
                    const splitLabel = `${expense.split_type} split`;
                    const sideMeta = expense.status === 'voided' ? 'voided' : `paid by ${expense.payer?.name || 'unknown'}`;

                    return (
                      <LedgerRow
                        key={expense.id}
                        date={expense.expense_date}
                        description={expense.description}
                        amount={expense.status === 'voided' ? 0 : amountBase}
                        currency={group.base_currency}
                        splitType={splitLabel}
                        note={expense.notes || ''}
                        rightMeta={sideMeta}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            <div className="receipt-zigzag rounded-2xl border border-white/10 p-5 shadow-glass">
              <h4 className="text-lg font-bold text-white">Settle Up Snapshot</h4>
              {debts.length === 0 ? (
                <p className="mt-2 text-sm text-ink-muted">No pending debts after simplification.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {debts.map((debt, idx) => (
                    <li key={`${debt.from.userId}-${debt.to.userId}-${idx}`} className="flex items-center justify-between border-b border-dashed border-paper-line py-1.5 text-sm">
                      <span>
                        {debt.from.name} pays {debt.to.name}
                      </span>
                      <span className="mono-data text-rust">INR {Number(debt.amount).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}

        {activeSection === 'balances' ? (
          <section className="rounded-2xl border border-white/10 bg-glass-card p-5 shadow-glass">
            <div className="mb-3">
              <h3 className="text-xl font-bold text-white">Passbook Balances</h3>
              <p className="text-sm text-gray-400">Expand a row to inspect exactly how each balance was computed.</p>
            </div>

            {balances.length === 0 ? (
              <p className="py-6 text-sm text-ink-muted">No balances available.</p>
            ) : (
              <div>
                {balances.map(member => (
                  <BalanceAccordionItem
                    key={member.userId}
                    member={member}
                    netBalance={Number(member.net_balance)}
                    onLoadBreakdown={loadBreakdown}
                    breakdown={breakdownMap[member.userId] || []}
                    isLoading={Boolean(breakdownLoading[member.userId])}
                    error={breakdownError[member.userId] || ''}
                  />
                ))}
              </div>
            )}
          </section>
        ) : null}

        {activeSection === 'members' ? (
          <section className="rounded-2xl border border-white/10 bg-glass-card p-5 shadow-glass">
            <h3 className="mb-3 text-xl font-bold text-white">Members and Membership Dates</h3>
            <div className="space-y-2">
              {memberList.map(member => (
                <div key={member.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 border-b border-dashed border-paper-line py-2">
                  <MemberBadge name={getMemberName(member)} />
                  <span className="text-sm font-semibold">{getMemberName(member)}</span>
                  <span className="mono-data text-xs text-ink-muted">joined {new Date(member.joined_at).toLocaleDateString('en-GB')}</span>
                  {member.left_at ? (
                    <StatusPill label={`left ${new Date(member.left_at).toLocaleDateString('en-GB')}`} tone="warning" />
                  ) : (
                    <StatusPill label="active" tone="positive" />
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {activeSection === 'import' ? (
          <section className="rounded-2xl border border-white/10 bg-glass-card p-5 shadow-glass">
            <h3 className="text-xl font-bold text-white">Import and Review</h3>
            <p className="mt-2 text-sm text-gray-400">Review anomalies and import batches before posting to the ledger.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link to="/import-review" className="rounded-xl border border-brand-500/30 bg-brand-600/15 px-4 py-2 text-sm font-semibold text-brand-300">
                Open Import Review
              </Link>
              {group.settings.map(setting => (
                <div key={setting.id} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1 text-xs">
                  <span className="text-gray-400">{prettifySettingKey(setting.key)}</span>
                  <span className="mono-data text-white">{setting.value}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
};

export default GroupDetail;
