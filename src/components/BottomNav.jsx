// 画面最下部のタブバー。アクティブタブはハイライト表示。
// iOS Safari のホームバー領域を避けるため safe-area-inset-bottom を確保。
const TAB_META = {
  record: { label: '記録', icon: '✏️' },
  list: { label: 'リスト', icon: '📋' },
  balance: { label: '収支表', icon: '📊' },
  chart: { label: 'チャート', icon: '📈' },
  machines: { label: '機種', icon: '🎰' },
};

export default function BottomNav({ tab, setTab, tabs }) {
  return (
    <nav
      className="flex-shrink-0 bg-slate-900 text-white border-t border-slate-700"
      // PWA standalone でも Safari でも下部余白なし (ホームインジケータと重なって OK)
    >
      <div className="flex">
        {tabs.map((id) => {
          const meta = TAB_META[id] || { label: id, icon: '•' };
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition ${
                active
                  ? 'text-yellow-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span
                className={`text-xl leading-none ${
                  active ? 'scale-110' : ''
                } transition-transform`}
                aria-hidden
              >
                {meta.icon}
              </span>
              <span>{meta.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
