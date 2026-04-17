export default function Header({ tab, setTab }) {
  const tabs = [
    { id: 'record', label: '記録' },
    { id: 'list', label: '履歴' },
    { id: 'machines', label: '機種' },
  ];

  return (
    <header className="sticky top-0 z-10 bg-slate-900 text-white shadow-md">
      <div className="px-4 py-3">
        <h1 className="text-lg font-bold text-center">パチンコ期待値計算</h1>
      </div>
      <nav className="flex border-t border-slate-700">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-sm font-medium transition ${
              tab === t.id
                ? 'bg-slate-700 text-white border-b-2 border-blue-400'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
