import React from 'react';

const LINKS = [
  { key: 'expenses', label: 'Expenses' },
  { key: 'balances', label: 'Balances' },
  { key: 'members', label: 'Members' },
  { key: 'import', label: 'Import' }
];

const SidebarShell = ({ groupName, activeSection, onSectionChange, onBack }) => {
  return (
    <aside className="border-r border-paper-line bg-[#f4eee1] p-5 lg:min-h-screen lg:w-64">
      <button
        type="button"
        onClick={onBack}
        className="mono-data text-xs uppercase tracking-[0.12em] text-ink-muted transition-colors hover:text-teal"
      >
        back to groups
      </button>

      <h1 className="mt-5 text-2xl leading-tight text-teal">{groupName}</h1>

      <nav className="mt-8 space-y-2">
        {LINKS.map(link => (
          <button
            key={link.key}
            type="button"
            onClick={() => onSectionChange(link.key)}
            className={`w-full border px-3 py-2 text-left text-sm transition-colors ${
              activeSection === link.key
                ? 'border-teal bg-teal-soft font-semibold text-teal'
                : 'border-paper-line bg-paper text-ink hover:border-teal/50 hover:text-teal'
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