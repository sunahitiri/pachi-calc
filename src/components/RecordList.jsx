import { useMemo, useState } from 'react';
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

function StatsRow({ summary, profit, dark = false }) {
  const evClass = summary.totalExpectedValue >= 0
    ? (dark ? 'text-green-400' : 'text-green-600 dark:text-green-400')
    : (dark ? 'text-red-400' : 'text-red-600 dark:text-red-400');
  const pfClass = profit >= 0
    ? (dark ? 'text-green-400' : 'text-green-600 dark:text-green-400')
    : (dark ? 'text-red-400' : 'text-red-600 dark:text-red-400');
  const labelClass = dark ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400';
  const valueClass = dark ? 'text-white' : 'text-slate-900 dark:text-white';
  return (
    <div className="grid grid-cols-2 gap-2 text-center text-sm">
      <div>
        <div className={`text-xs ${labelClass}`}>現金投資</div>
        <div className={`font-semibold ${valueClass}`}>¥{summary.totalInvestment.toLocaleString()}</div>
      </div>
      <div>
        <div className={`text-xs ${labelClass}`}>総回転数</div>
        <div className={`font-semibold ${valueClass}`}>{summary.totalRotations.toLocaleString()}</div>
      </div>
      <div>
        <div className={`text-xs ${labelClass}`}>期待値合計</div>
        <div className={`font-semibold ${evClass}`}>{formatSignedYen(summary.totalExpectedValue)}</div>
      </div>
      <div>
        <div className={`text-xs ${labelClass}`}>収支合計</div>
        <div className={`font-semibold ${pfClass}`}>{formatSignedYen(profit)}</div>
      </div>
    </div>
  );
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
      className="w-full text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 active:bg-slate-100 dark:active:bg-slate-700 transition"
    >
      <div className="mb-1">
        <div className="text-sm text-slate-500 dark:text-slate-400">{r.date}</div>
        <div className="font-medium text-slate-900 dark:text-white break-words">
          {machine?.name ?? '（削除済み機種）'}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-300 mt-2">
        <div className={`font-semibold ${ev >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          期待値: {formatSignedYen(ev)}
        </div>
        {profit !== null && (
          <div className={`font-semibold ${profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            収支: {formatSignedYen(profit)}
          </div>
        )}
      </div>
      {r.notes && (
        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">📝 {r.notes}</div>
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

  const summary = useMemo(() => summarize(records, machines), [records, machines]);
  const totalProfit = useMemo(() => computeProfit(records, machineMap), [records, machineMap]);

  // 年→月でグループ化
  const groups = useMemo(() => {
    const byYear = new Map();
    for (const r of records) {
      const date = r.date || '';
      const year = date.slice(0, 4);
      const ym = date.slice(0, 7); // YYYY-MM
      if (!year || !ym) continue;
      if (!byYear.has(year)) byYear.set(year, new Map());
      const monthMap = byYear.get(year);
      if (!monthMap.has(ym)) monthMap.set(ym, []);
      monthMap.get(ym).push(r);
    }
    return [...byYear.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, monthMap]) => {
        const months = [...monthMap.entries()]
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([month, recs]) => {
            const sorted = [...recs].sort(
              (a, b) =>
                b.date.localeCompare(a.date) ||
                (b.createdAt || '').localeCompare(a.createdAt || '')
            );
            return {
              month,
              records: sorted,
              summary: summarize(sorted, machines),
              profit: computeProfit(sorted, machineMap),
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

  // デフォルト: 最新の年・最新の月を展開、それ以外は畳む
  const defaultExpanded = useMemo(() => {
    const s = new Set();
    if (groups.length > 0) {
      s.add('y:' + groups[0].year);
      if (groups[0].months.length > 0) {
        s.add('m:' + groups[0].months[0].month);
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
  if (editingRecord) {
    const machine = machineMap[editingRecord.machineId];
    const exRate = editingRecord.exchangeRate ?? machine?.exchangeRate ?? 4;
    const cashInv = Number(editingRecord.totalInvestment ?? editingRecord.investment) || 0;
    const startBalls = Number(editingRecord.startBalls) || 0;
    const endBalls = Number(editingRecord.endBalls) || 0;
    const profit = editingRecord.isSession
      ? (endBalls - startBalls) * exRate - cashInv
      : 0;
    const ev = !machine
      ? 0
      : editingRecord.isSession
      ? calcSessionExpectedValue(editingRecord, machine)
      : calcExpectedValue({
          totalRotations: editingRecord.rotations,
          investment: editingRecord.investment,
          machine,
        });
    // 1Kあたり回転数は常に 1玉=4円 換算。持ち玉で回した分も 4円 として投資額に含める。
    //   投資相当額(円) = 現金 + (startBalls + hitPayout − endBalls) × 4
    const hitPayout = (editingRecord.hits || []).reduce(
      (s, h) => s + (Number(h.ballsGained) || 0),
      0
    );
    const stockConsumed = startBalls + hitPayout - endBalls; // 持ち玉の純消費玉数
    const effectiveInv4yen = Math.max(0, cashInv + stockConsumed * 4);
    const perK = rotationsPer1K(editingRecord.rotations, effectiveInv4yen);
    const border = machine ? calcBorder({ ...machine, exchangeRate: exRate }) : 0;

    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditingId(null)}
            className="text-slate-600 dark:text-slate-300 text-sm px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
          >
            ← 戻る
          </button>
          <h2 className="font-bold text-slate-900 dark:text-white flex-1">
            {editingRecord.date} {machine?.name ?? '（削除済み機種）'}
          </h2>
          <button
            onClick={() => {
              if (confirm('この記録を削除しますか？')) {
                onDelete(editingRecord.id);
                setEditingId(null);
              }
            }}
            className="text-red-500 text-sm px-2 py-1"
          >
            削除
          </button>
        </div>

        {editingRecord.isSession ? (
          <SessionDetail
            session={editingRecord}
            machines={machines}
            includeEndRow
            onChange={(updated) => onUpdate?.(updated)}
            onDeleteHit={(idx) => {
              const newHits = (editingRecord.hits || []).filter((_, i) => i !== idx);
              onUpdate?.({ ...editingRecord, hits: newHits });
            }}
          />
        ) : (
          <div className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
            この記録はセッション形式ではないため、詳細編集できません。
          </div>
        )}

        {/* サマリ (リアルタイム) */}
        <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-300">累計回転</span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {(editingRecord.rotations || 0).toLocaleString()} 回
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
          {editingRecord.isSession && (
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

        <div className="text-xs text-slate-500 dark:text-slate-400 bg-yellow-50 dark:bg-yellow-900/20 rounded p-2">
          💡 各項目を編集すると自動的に保存されます。
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
      {/* 通算 */}
      <div className="bg-slate-800 text-white rounded-lg p-4 space-y-2">
        <h2 className="font-bold">通算</h2>
        <StatsRow summary={summary} profit={totalProfit} dark />
      </div>

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
                            {mg.records.map((r) => (
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
    </div>
  );
}
