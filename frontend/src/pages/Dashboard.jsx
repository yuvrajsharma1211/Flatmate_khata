import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api, { clearAuth, getCurrentUser } from '../utils/api';

const Dashboard = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/groups');
      setGroups(response.data.groups);
    } catch (err) {
      console.error('Error fetching groups:', err);
      setError('Failed to load groups. Ensure your database is migrated and the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#0b0f17] text-white">
      {/* Navbar */}
      <nav className="border-b border-white/5 bg-glass sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💸</span>
            <span className="font-extrabold text-xl tracking-tight">
              Flatmate <span className="text-gradient">Khata</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold">{currentUser?.name || 'User'}</p>
              <p className="text-xs text-gray-400">{currentUser?.email || ''}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-xs font-semibold bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
            <p className="text-gray-400 text-sm mt-1">Select a flatmate group or check import audits</p>
          </div>
          <Link
            to="/import-review"
            className="bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-700 hover:to-brand-600 px-5 py-3 rounded-xl text-sm font-semibold shadow-lg shadow-brand-600/10 transition-all flex items-center gap-2"
          >
            <span>📥</span> Audit & Import CSV
          </Link>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
            ⚠️ {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-glass-card h-48 rounded-2xl border border-white/5"></div>
            ))}
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-bold text-gray-300 mb-4 tracking-wide uppercase text-xs">My Groups</h2>
            {groups.length === 0 ? (
              <div className="bg-glass-card rounded-2xl border border-white/5 p-12 text-center max-w-lg mx-auto">
                <span className="text-4xl block mb-4">🏠</span>
                <h3 className="text-xl font-bold mb-2">No Groups Found</h3>
                <p className="text-gray-400 text-sm mb-6">
                  You are registered, but haven't been added to any groups or your seed database migrations are pending.
                </p>
                <div className="text-left text-xs bg-black/30 p-4 rounded-xl border border-white/5 text-gray-400 space-y-2">
                  <span className="font-semibold text-brand-300 block">How to seed database:</span>
                  <p>1. Start your local PostgreSQL service.</p>
                  <p>2. Configure <code className="text-white">DATABASE_URL</code> in backend <code className="text-white">.env</code>.</p>
                  <p>3. In the backend folder, execute:</p>
                  <pre className="text-white bg-black/40 p-2.5 rounded mt-1 overflow-x-auto">npx prisma migrate dev --name init&#10;npx prisma db seed</pre>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groups.map((group) => (
                  <div
                    key={group.id}
                    onClick={() => navigate(`/group/${group.id}`)}
                    className="bg-glass-card hover:bg-glass-card/80 rounded-2xl border border-white/5 hover:border-brand-500/30 p-6 shadow-glass hover:shadow-brand-600/5 transition-all duration-300 cursor-pointer group flex flex-col justify-between h-48 relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-brand-500/5 rounded-full blur-xl group-hover:bg-brand-500/10 transition-colors"></div>
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-xl font-bold group-hover:text-brand-300 transition-colors">{group.name}</h3>
                        <span className="px-2.5 py-1 bg-brand-600/15 border border-brand-500/30 text-brand-300 text-xs font-semibold rounded-full uppercase tracking-wider">
                          {group.base_currency}
                        </span>
                      </div>
                      <p className="text-gray-400 text-sm">
                        Members: {group.members?.map(m => m.user?.name).join(', ') || 'None'}
                      </p>
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-brand-400 font-semibold group-hover:text-brand-300">
                      <span>View details & balances</span>
                      <span>➡️</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
