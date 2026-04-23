import { useState, useMemo, useEffect, useRef } from 'react';
import { calcBorder } from '../utils/calculations';

/**
 * 機種選択用のカスタムドロップダウン。
 * - ネイティブ <select> より広い (viewport 基準、最大 640px) 中央ダイアログで開く
 * - 検索ボックス付き
 * - ボーダー値も各行に表示
 */
export default function MachineSelector({
  machines,
  value,
  onChange,
  exchangeRate,
  placeholder = '選択してください',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef(null);

  const selected = useMemo(
    () => machines.find((m) => m.id === value) || null,
    [machines, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return machines;
    return machines.filter((m) => m.name.toLowerCase().includes(q));
  }, [machines, query]);

  const close = () => {
    setIsOpen(false);
    setQuery('');
  };

  // ESC で閉じる
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  // 開いた直後に検索欄にフォーカス
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const triggerLabel = (() => {
    if (!selected) return placeholder;
    const b = calcBorder({ ...selected, exchangeRate });
    return `${selected.name}（ボーダー${b.toFixed(1)}）`;
  })();

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white text-left flex items-center justify-between gap-2 ${
          !selected ? 'text-slate-400 dark:text-slate-500' : ''
        }`}
      >
        <span className="truncate">{triggerLabel}</span>
        <span aria-hidden className="text-slate-400 shrink-0">▾</span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={close}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onTouchCancel={(e) => e.stopPropagation()}
            data-no-swipe
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onTouchCancel={(e) => e.stopPropagation()}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(90vw,640px)] max-h-[80vh] bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl shadow-xl z-50 flex flex-col"
          >
            <div className="p-3 border-b border-slate-200 dark:border-slate-600">
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="機種名で検索"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              />
            </div>
            <ul className="flex-1 overflow-y-auto">
              {filtered.map((m) => {
                const b = calcBorder({ ...m, exchangeRate });
                const isSelected = m.id === value;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(m.id);
                        close();
                      }}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-700 ${
                        isSelected ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                      }`}
                    >
                      <div className="font-medium text-slate-900 dark:text-white">
                        {m.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        ボーダー {b.toFixed(1)} 回転
                      </div>
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="px-4 py-6 text-center text-slate-500 dark:text-slate-400 text-sm">
                  該当機種なし
                </li>
              )}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
