import { useEffect, useMemo, useState } from 'react';
import { calcExpectedValue, calcSessionExpectedValue, summarize, rotationsPer1K, calcBorder } from '../utils/calculations';
import SessionDetail from './SessionDetail';

// セッション記録の収支(円)の合計 — 非セッション記録は対象外
function computeProfit(records, machineMap) {
  return records.reduce((acc, r) => {
    if (!r.isSession) return acc;
    const m = machineMap[r.machineId];
    const rate = r.exchangeRate ?? m?.exchangeRate ?? 4;
    const cash = Number(r.totalInvestment ?? r.investment) || 0;
    const startBalls = Number(r.startBalls) || 0;
    const endBalls = Number(r.endBalls) || 0;
    return acc + (endBalls - startBalls) * rate - cash;
  }, 0);
}

// 金額表示のフォーマット (+/- と ¥、小数なし)
function formatSignedYen(n) {
  const rounded = Math.round(n);
  const sign = rounded >= 0 ? '+' : '';
  return `${sign}¥${rounded.toLocaleString()}`;
}

function RecordCard({ r, machineMap, onOpen }) {
  const machine = machineMap[r.machineId];
  const ev = !machine
    ? 0
    : r.isSession
    ? calcSessionExpectedValue(r, machine)
    : calcExpectedValue({
        totalRotations: r.rotations,
        investment: r.investment,
        machine,
      });
  const exRate = r.exchangeRate ?? machine?.exchangeRate ?? 4;
  const cashInv = Number(r.totalInvestment ?? r.investment) || 0;
  const profit = r.isSession
    ? ((Number(r.endBalls) || 0) - (Number(r.startBalls) || 0)) * exRate - cashInv
    : null;

  return (
    <button
      type="button"
      onClick={() => onOpen?.(r)}
      className="w-full text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 active:bg-slate-100 dark:active:bg-slate-700 transition"
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-slate-500 dark:text-slate-400 shrink-0">{r.date}</span>
        <span className="flex items-center gap-3 text-xs font-semibold">
          <span className={ev >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
            期:{formatSignedYen(ev)}
          </span>
          {profit !== null && (
            <span className={profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
              収:{formatSignedYen(profit)}
            </span>
          )}
        </span>
      </div>
      {r.notes && (
        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">📝 {r.notes}</div>
      )}
    </button>
  );
}

export default function RecordList({ records, machines, onDelete, onUpdate }) {
  const machineMap = useMemo(
    () => Object.fromEntries(machines.map((m) => [m.id, m])),
    [machines]
  );

  // 編集中の記録 ID
  const [editingId, setEditingId] = useState(null);
  const editingRecord = useMemo(
    () => records.find((r) => r.id === editingId) || null,
    [records, editingId]
  );
  // 編集中のドラフト (保存/キャンセルで確定/破棄)
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    // 別の記録を開いたときだけドラフトを初期化 (編集中の再レンダーでは上書きしない)
    if (editingId) {
      setDraft((prev) => (prev && prev.id === editingId ? prev : editingRecord));
    } else {
      setDraft(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  // 年→月→日 でグループ化
  const groups = useMemo(() => {
    const byYear = new Map(); // year -> Map<ym, Map<ymd, records[]>>
    for (const r of records) {
      const date = r.date || '';
      const year = date.slice(0, 4);
      const ym = date.slice(0, 7);  // YYYY-MM
      const ymd = date.slice(0, 10); // YYYY-MM-DD
      if (!year || !ym || !ymd) continue;
      if (!byYear.has(year)) byYear.set(year, new Map());
      const monthMap = byYear.get(year);
      if (!monthMap.has(ym)) monthMap.set(ym, new Map());
      const dayMap = monthMap.get(ym);
      if (!dayMap.has(ymd)) dayMap.set(ymd, []);
      dayMap.get(ymd).push(r);
    }
    return [...byYear.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, monthMap]) => {
        const months = [...monthMap.entries()]
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([month, dayMap]) => {
            const days = [...dayMap.entries()]
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([day, recs]) => {
                const sorted = [...recs].sort(
                  (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')
                );
                return {
                  day,
                  records: sorted,
                  summary: summarize(sorted, machines),
                  profit: computeProfit(sorted, machineMap),
                };
              });
            const monthRecs = days.flatMap((d) => d.records);
            return {
              month,
              days,
              records: monthRecs,
              summary: summarize(monthRecs, machines),
              profit: computeProfit(monthRecs, machineMap),
            };
          });
        const yearRecs = months.flatMap((m) => m.records);
        return {
          year,
          months,
          count: yearRecs.length,
          summary: summarize(yearRecs, machines),
          profit: computeProfit(yearRecs, machineMap),
        };
      });
  }, [records, machines, machineMap]);

  // デフォルト: 最新の年・最新の月・最新の日を展開、それ以外は畳む
  const defaultExpanded = useMemo(() => {
    const s = new Set();
    if (groups.length > 0) {
      s.add('y:' + groups[0].year);
      if (groups[0].months.length > 0) {
        s.add('m:' + groups[0].months[0].month);
        if (groups[0].months[0].days.length > 0) {
          s.add('d:' + groups[0].months[0].days[0].day);
        }
      }
    }
    return s;
  }, [groups]);

  // ユーザーが明示的に反転したキー (デフォルトと逆の状態)
  const [toggled, setToggled] = useState(() => new Set());
  const isExpanded = (key) => {
    const def = defaultExpanded.has(key);
    return toggled.has(key) ? !def : def;
  };
  const toggle = (key) => {
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ===== 編集ビュー =====
  if (editingRecord && draft) {
    const machine = machineMap[draft.machineId];
    const exRate = draft.exchangeRate ?? machine?.exchangeRate ?? 4;
    const cashInv = Number(draft.totalInvestment ?? draft.investment) || 0;
    const startBalls = Number(draft.startBalls) || 0;
    const endBalls = Number(draft.endBalls) || 0;
    const profit = draft.isSession
      ? (endBalls - startBalls) * exRate - cashInv
      : 0;
    const ev = !machine
      ? 0
      : draft.isSession
      ? calcSessionExpectedValue(draft, machine)
      : calcExpectedValue({
          totalRotations: draft.rotations,
          investment: draft.investment,
          machine,
        });
    // 1Kあたり回転数は常に 1玉=4円 換算。持ち玉で回した分も 4円 として投資額に含める。
    //   投資相当額(円) = 現金 + (startBalls + hitPayout − endBalls) × 4
    const hitPayout = (draft.hits || []).reduce(
      (s, h) => s + (Number(h.ballsGained) || 0),
      0
    );
    const stockConsumed = startBalls + hitPayout - endBalls; // 持ち玉の純消費玉数
    const effectiveInv4yen = Math.max(0, cashInv + stockConsumed * 4);
    const perK = rotationsPer1K(draft.rotations, effectiveInv4yen);
    const border = machine ? calcBorder({ ...machine, exchangeRate: exRate }) : 0;

    // ドラフトと元記録の差分判定 (浅い JSON 比較で十分)
    const isDirty = JSON.stringify(draft) !== JSON.stringify(editingRecord);
    const closeEdit = () => {
      setEditingId(null);
      setDraft(null);
    };
    const handleSave = () => {
      onUpdate?.(draft);
      closeEdit();
    };
    const handleCancel = () => {
      if (isDirty && !confirm('編集内容を破棄しますか？')) return;
      closeEdit();
    };

    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={handleCancel}
            className="text-slate-600 dark:text-slate-300 text-sm px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
          >
            ← 戻る
          </button>
          <h2 className="font-bold text-slate-900 dark:text-white flex-1">
            {draft.date} {machine?.name ?? '（削除済み機種）'}
          </h2>
          <button
            onClick={() => {
              if (confirm('この記録を削除しますか？')) {
                onDelete(draft.id);
                closeEdit();
              }
            }}
            className="text-red-500 text-sm px-2 py-1"
          >
            削除
          </button>
        </div>

        {draft.isSession ? (
          <SessionDetail
            session={draft}
            machines={machines}
            includeEndRow
            onChange={(updated) => setDraft(updated)}
            onDeleteHit={(idx) => {
              const newHits = (draft.hits || []).filter((_, i) => i !== idx);
              setDraft({ ...draft, hits: newHits });
            }}
          />
        ) : (
          <div className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
            この記録はセッション形式ではないため、詳細編集できません。
          </div>
        )}

        {/* サマリ (ドラフトベース) */}
        <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-300">累計回転</span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {(draft.rotations || 0).toLocaleString()} 回
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-300">投資 (現金)</span>
            <span className="font-semibold text-slate-900 dark:text-white">
              ¥{cashInv.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-300">1Kあたり回転数</span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {perK.toFixed(1)} 回 {machine ? `(B:${border.toFixed(1)})` : ''}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-300">期待値</span>
            <span
              className={`font-semibold ${
                ev >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatSignedYen(ev)}
            </span>
          </div>
          {draft.isSession && (
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">収支</span>
              <span
                className={`font-semibold ${
                  profit >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {formatSignedYen(profit)}
              </span>
            </div>
          )}
        </div>

        {/* 保存 / キャンセル */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleCancel}
            className="bg-slate-300 dark:bg-slate-600 dark:text-white py-2 rounded-lg font-medium text-sm"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty}
            className="bg-blue-600 text-white py-2 rounded-lg font-medium text-sm disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
        まだ記録がありません
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* 年→月→記録 */}
      <div className="space-y-3">
        {groups.map((yg) => {
          const yKey = 'y:' + yg.year;
          const yOpen = isExpanded(yKey);
          return (
            <div
              key={yg.year}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => toggle(yKey)}
                className="w-full p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm w-4">{yOpen ? '▾' : '▸'}</span>
                    <span className="font-bold text-slate-900 dark:text-white">{yg.year}年</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      ({yg.count}件)
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs font-medium">
                    <span
                      className={
                        yg.summary.totalExpectedValue >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }
                    >
                      期:{formatSignedYen(yg.summary.totalExpectedValue)}
                    </span>
                    <span
                      className={
                        yg.profit >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }
                    >
                      収:{formatSignedYen(yg.profit)}
                    </span>
                  </div>
                </div>
              </button>
              {yOpen && (
                <div className="border-t border-slate-200 dark:border-slate-700 p-2 space-y-2">
                  {yg.months.map((mg) => {
                    const mKey = 'm:' + mg.month;
                    const mOpen = isExpanded(mKey);
                    const monthLabel = String(parseInt(mg.month.slice(5), 10));
                    return (
                      <div
                        key={mg.month}
                        className="bg-slate-50 dark:bg-slate-900/40 rounded overflow-hidden"
                      >
                        <button
                          onClick={() => toggle(mKey)}
                          className="w-full p-2 hover:bg-slate-100 dark:hover:bg-slate-700/50 text-left"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 text-sm w-4">
                                {mOpen ? '▾' : '▸'}
                              </span>
                              <span className="font-medium text-slate-800 dark:text-slate-100 text-sm">
                                {monthLabel}月
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                ({mg.records.length}件)
                              </span>
                            </div>
                            <div className="flex gap-3 text-xs font-medium">
                              <span
                                className={
                                  mg.summary.totalExpectedValue >= 0
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-red-600 dark:text-red-400'
                                }
                              >
                                期:{formatSignedYen(mg.summary.totalExpectedValue)}
                              </span>
                              <span
                                className={
                                  mg.profit >= 0
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-red-600 dark:text-red-400'
                                }
                              >
                                収:{formatSignedYen(mg.profit)}
                              </span>
                            </div>
                          </div>
                        </button>
                        {mOpen && (
                          <div className="p-2 pt-0 space-y-2">
                            {mg.days.map((dg) => {
                              const dKey = 'd:' + dg.day;
                              const dOpen = isExpanded(dKey);
                              const dayLabel = String(parseInt(dg.day.slice(8), 10));
                              return (
                                <div
                                  key={dg.day}
                                  className="bg-white dark:bg-slate-800/60 rounded overflow-hidden border border-slate-200 dark:border-slate-700"
                                >
                                  <button
                                    onClick={() => toggle(dKey)}
                                    className="w-full p-2 hover:bg-slate-50 dark:hover:bg-slate-700/40 text-left"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <span className="text-slate-400 text-sm w-4">
                                          {dOpen ? '▾' : '▸'}
                                        </span>
                                        <span className="font-medium text-slate-800 dark:text-slate-100 text-sm">
                                          {dayLabel}日
                                        </span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                          ({dg.records.length}件)
                                        </span>
                                      </div>
                                      <div className="flex gap-3 text-xs font-medium">
                                        <span
                                          className={
                                            dg.summary.totalExpectedValue >= 0
                                              ? 'text-green-600 dark:text-green-400'
                                              : 'text-red-600 dark:text-red-400'
                                          }
                                        >
                                          期:{formatSignedYen(dg.summary.totalExpectedValue)}
                                        </span>
                                        <span
                                          className={
                                            dg.profit >= 0
                                              ? 'text-green-600 dark:text-green-400'
                                              : 'text-red-600 dark:text-red-400'
                                          }
                                        >
                                          収:{formatSignedYen(dg.profit)}
                                        </span>
                                      </div>
                                    </div>
                                  </button>
                                  {dOpen && (
                                    <div className="p-2 pt-0 space-y-2">
                                      {dg.records.map((r) => (
                                        <RecordCard
                                          key={r.id}
                                          r={r}
                                          machineMap={machineMap}
                                          onOpen={() => setEditingId(r.id)}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
