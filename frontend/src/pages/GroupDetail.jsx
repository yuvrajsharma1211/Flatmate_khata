import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';

const GroupDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('expenses');

  useEffect(() => {
    fetchGroupDetails();
  }, [id]);

  const fetchGroupDetails = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get(`/groups/${id}`);
      setGroup(response.data.group);
    } catch (err) {
      console.error('Error fetching group details:', err);
      setError(err.response?.data?.error || 'Failed to fetch group details.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f17] flex items-center justify-center text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-brand-500"></div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="min-h-screen bg-[#0b0f17] text-white flex flex-col items-center justify-center p-4">
        <div className="bg-glass border border-white/5 rounded-2xl p-8 max-w-md text-center">
          <span className="text-4xl block mb-4">⚠️</span>
          <h2 className="text-xl font-bold mb-2">Error Loading Group</h2>
          <p className="text-gray-400 text-sm mb-6">{error || 'Group not found.'}</p>
          <button
            onClick={() => navigate('/')}
            className="bg-brand-600 hover:bg-brand-500 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Calculate some overview stats
  const totalExpenses = group.expenses
    .filter(e => e.status === 'active')
    .reduce((sum, e) => sum + parseFloat(e.amount_base), 0);

  const totalSettlements = group.settlements
    .reduce((sum, s) => sum + parseFloat(s.amount_base), 0);

  return (
    <div className="min-h-screen bg-[#0b0f17] text-white font-sans pb-12">
      {/* Header / Nav */}
      <nav className="border-b border-white/5 bg-glass sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="text-gray-400 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
            >
              <span>⬅️</span> Dashboard
            </button>
            <span className="text-white/20">|</span>
            <h1 className="text-lg font-bold">{group.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/import-review"
              className="bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold px-4 py-2 rounded-lg transition-all"
            >
              Audit Imports
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Col: Info, Members, Settings */}
        <div className="space-y-6">
          {/* Card: Stats */}
          <div className="bg-glass rounded-2xl border border-white/5 p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-brand-600/5 rounded-full blur-xl"></div>
            <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-4">Group Financials</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-gray-400 text-xs">Total Expenses</p>
                <p className="text-2xl font-black mt-1">₹{totalExpenses.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Total Settled</p>
                <p className="text-2xl font-black mt-1 text-emerald-400">₹{totalSettlements.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Card: Time-Bound Memberships */}
          <div className="bg-glass rounded-2xl border border-white/5 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-bold tracking-wide uppercase text-gray-300">Flatmates</h2>
              <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-gray-400">Active History</span>
            </div>
            <div className="space-y-4">
              {group.members.map((member) => {
                const joined = new Date(member.joined_at).toLocaleDateString('en-US', {
                  month: 'short',
                  year: 'numeric',
                  day: 'numeric',
                });
                const left = member.left_at ? new Date(member.left_at).toLocaleDateString('en-US', {
                  month: 'short',
                  year: 'numeric',
                  day: 'numeric',
                }) : null;
                const isActive = !member.left_at;

                return (
                  <div key={member.id} className="flex justify-between items-center p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{member.user.name}</span>
                        {member.role === 'admin' && (
                          <span className="bg-brand-500/10 text-brand-300 text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase">
                            Admin
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">
                        Joined: {joined}
                      </p>
                      {left && (
                        <p className="text-[10px] text-rose-400">
                          Left: {left}
                        </p>
                      )}
                    </div>
                    <div>
                      {isActive ? (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 block" title="Currently Active"></span>
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-rose-500 block" title="Inactive member"></span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card: App & Group Settings */}
          <div className="bg-glass rounded-2xl border border-white/5 p-6">
            <h2 className="text-sm font-bold tracking-wide uppercase text-gray-300 mb-4">Settings & Rates</h2>
            <div className="space-y-3">
              {group.settings.map((setting) => (
                <div key={setting.id} className="flex justify-between items-center text-sm p-2 rounded-lg hover:bg-white/5">
                  <span className="text-gray-400 capitalize">{setting.key.replace(/_/g, ' ')}</span>
                  <span className="font-bold text-white font-mono bg-brand-500/10 px-2 py-0.5 rounded text-xs">
                    {setting.value}
                  </span>
                </div>
              ))}
              {group.settings.length === 0 && (
                <p className="text-xs text-gray-500 text-center">No group settings configured.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Col: Transactions, Expenses, Settlements */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-glass rounded-2xl border border-white/5 overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-white/5 bg-white/[0.01]">
              <button
                onClick={() => setActiveTab('expenses')}
                className={`flex-1 py-4 text-center text-sm font-bold border-b-2 transition-all ${
                  activeTab === 'expenses'
                    ? 'border-brand-500 text-white bg-brand-500/5'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Expenses ({group.expenses.length})
              </button>
              <button
                onClick={() => setActiveTab('settlements')}
                className={`flex-1 py-4 text-center text-sm font-bold border-b-2 transition-all ${
                  activeTab === 'settlements'
                    ? 'border-brand-500 text-white bg-brand-500/5'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                Settlements ({group.settlements.length})
              </button>
            </div>

            {/* List Panels */}
            <div className="p-6">
              {activeTab === 'expenses' ? (
                <div className="space-y-4">
                  {group.expenses.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 text-sm">
                      <span className="text-3xl block mb-2">💸</span>
                      No manual expenses logged yet.
                    </div>
                  ) : (
                    group.expenses.map((expense) => {
                      const amount = parseFloat(expense.original_amount);
                      const amountBase = parseFloat(expense.amount_base);
                      const isForeign = expense.currency !== group.base_currency;

                      return (
                        <div
                          key={expense.id}
                          className={`p-4 rounded-xl border transition-all ${
                            expense.status === 'voided'
                              ? 'bg-red-500/[0.02] border-red-500/10 opacity-60'
                              : 'bg-white/[0.01] border-white/5 hover:border-white/10'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-base">{expense.description}</span>
                                <span className="px-2 py-0.5 bg-white/5 rounded text-[10px] text-gray-400 capitalize">
                                  {expense.split_type} Split
                                </span>
                                {expense.source === 'import' && (
                                  <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-400">
                                    Imported
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-1">
                                Paid by <span className="text-gray-200 font-semibold">{expense.payer.name}</span> on{' '}
                                {new Date(expense.expense_date).toLocaleDateString()}
                              </p>
                              {expense.notes && (
                                <p className="text-xs text-gray-400 mt-2 bg-black/20 p-2 rounded italic">
                                  {expense.notes}
                                </p>
                              )}
                            </div>

                            <div className="text-right">
                              <p className="text-lg font-black">₹{amountBase.toFixed(2)}</p>
                              {isForeign && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {expense.currency} {amount.toFixed(2)} @ {expense.exchange_rate}
                                </p>
                              )}
                              {expense.status === 'voided' && (
                                <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider block mt-1">
                                  Voided
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Splits detail */}
                          {expense.status !== 'voided' && expense.splits?.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                              <span className="font-semibold text-gray-300">Splits:</span>
                              {expense.splits.map(split => (
                                <span key={split.id}>
                                  {split.user.name}: ₹{parseFloat(split.owed_amount).toFixed(2)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {group.settlements.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 text-sm">
                      <span className="text-3xl block mb-2">🤝</span>
                      No settlement records logged yet.
                    </div>
                  ) : (
                    group.settlements.map((settlement) => {
                      const amtBase = parseFloat(settlement.amount_base);

                      return (
                        <div
                          key={settlement.id}
                          className="p-4 rounded-xl bg-emerald-500/[0.01] border border-emerald-500/10 hover:border-emerald-500/20 flex justify-between items-center"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-emerald-400">Settlement Payment</span>
                              {settlement.source === 'import' && (
                                <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[9px] text-amber-400">
                                  Imported
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-300 mt-1">
                              <span className="font-semibold text-white">{settlement.payer.name}</span> paid{' '}
                              <span className="font-semibold text-white">{settlement.recipient.name}</span>
                            </p>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              Settled on {new Date(settlement.settled_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-base font-black text-emerald-400">₹{amtBase.toFixed(2)}</p>
                            {settlement.notes && (
                              <p className="text-[10px] text-gray-400 italic mt-0.5">{settlement.notes}</p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      </main>
    </div>
  );
};

export default GroupDetail;
