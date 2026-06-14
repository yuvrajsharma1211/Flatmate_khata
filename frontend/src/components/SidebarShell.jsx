import React from 'react';

const LINKS = [
  { key: 'expenses', label: 'Expenses' },
  { key: 'balances', label: 'Balances' },
  { key: 'members', label: 'Members' },
  { key: 'import', label: 'Import' }
];

const SidebarShell = ({ groupName, activeSection, onSectionChange, onBack }) => {
  return (
    <aside className="border-r border-white/10 bg-glass p-5 lg:min-h-screen lg:w-64">
      <button
        type="button"
        onClick={onBack}
        className="mono-data text-xs uppercase tracking-[0.12em] text-gray-400 transition-colors hover:text-brand-300"
      >
        back to groups
      </button>

      <h1 className="mt-5 text-2xl font-bold leading-tight text-white">{groupName}</h1>

      <nav className="mt-8 space-y-2">
        {LINKS.map(link => (
          <button
            key={link.key}
            type="button"
            onClick={() => onSectionChange(link.key)}
            className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
              activeSection === link.key
                ? 'border-brand-500/30 bg-brand-600/15 font-semibold text-brand-300'
                : 'border-white/10 bg-white/[0.03] text-gray-300 hover:border-brand-500/30 hover:text-white'
            }`}
          >
            {link.label}
          </button>
        ))}
      </nav>
    </aside>
  );
};

export default SidebarShell;
