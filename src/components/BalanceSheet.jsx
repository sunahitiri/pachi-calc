import { useMemo } from 'react';
import { summarize, calcExpectedValue, calcSessionExpectedValue } from '../utils/calculations';

// セッション記録の収支 (円)。非セッション記録は収支計算対象外 (0)
function recordProfit(r, machineMap) {
  if (!r.isSession) return 0;
  const m = machineMap[r.machineId];
  const rate = r.exchangeRate ?? m?.exchangeRate ?? 4;
  const cash = Number(r.totalInvestment ?? r.investment) || 0;
  const startBalls = Number(r.startBalls) || 0;
  const endBalls = Number(r.endBalls) || 0;
  return (endBalls - startBalls) * rate - cash;
}

function recordEV(r, machineMap) {
  const m = machineMap[r.machineId];
  if (!m) return 0;
  return r.isSession
    ? calcSessionExpectedValue(r, m)
    : calcExpectedValue({
        totalRotations: r.rotations,
        investment: r.investment,
        machine: m,
      });
}

function formatSignedYen(n) {
  const rounded = Math.round(n);
  const sign = rounded >= 0 ? '+' : '';
  return `${sign}¥${rounded.toLocaleString()}`;
}

function colorClass(n) {
  if (n > 0) return 'text-green-600 dark:text-green-400';
  if (n < 0) return 'text-red-600 dark:text-red-400';
  return 'text-slate-700 dark:text-slate-200';
}

// 投資 (符号無し、白系) / 回収 (符号付き、正負で色付け) の行
function StatRow({ label, value, signed }) {
  const text = signed
    ? formatSignedYen(value)
    : `¥${Math.round(value).toLocaleString()}`;
  const color = signed
    ? value > 0
      ? 'text-green-400'
      : value < 0
      ? 'text-red-400'
      : 'text-slate-200'
    : 'text-slate-100';
  return (
    <div className="flex justify-between">
      <dt className="text-slate-400">{label}</dt>
      <dd className={`font-semibold ${color}`}>{text}</dd>
    </div>
  );
}

// 数値配列の合計/最大/最小/平均/中央値
function summaryStats(arr) {
  if (arr.length === 0) {
    return { sum: 0, max: 0, min: 0, mean: 0, median: 0, count: 0 };
  }
  const sum = arr.reduce((a, b) => a + b, 0);
  const max = Math.max(...arr);
  const min = Math.min(...arr);
  const mean = sum / arr.length;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  return { sum, max, min, mean, median, count: arr.length };
}

export default function BalanceSheet({ records, machines }) {
  const machineMap = useMemo(
    () => Object.fromEntries(machines.map((m) => [m.id, m])),
    [machines],
  );

  // 年 → 月 に集約
  const { years, grand } = useMemo(() => {
    const byYear = new Map();
    const grandAcc = { count: 0, investment: 0, profit: 0, ev: 0 };
    for (const r of records) {
      const date = r.date || '';
      const year = date.slice(0, 4);
      const ym = date.slice(0, 7); // YYYY-MM
      if (!year || !ym) continue;
      const inv = Number(r.totalInvestment ?? r.investment) || 0;
      const prof = recordProfit(r, machineMap);
      const ev = recordEV(r, machineMap);

      if (!byYear.has(year)) byYear.set(year, new Map());
      const monthMap = byYear.get(year);
      if (!monthMap.has(ym)) {
        monthMap.set(ym, { count: 0, investment: 0, profit: 0, ev: 0 });
      }
      const bucket = monthMap.get(ym);
      bucket.count += 1;
      bucket.investment += inv;
      bucket.profit += prof;
      bucket.ev += ev;

      grandAcc.count += 1;
      grandAcc.investment += inv;
      grandAcc.profit += prof;
      grandAcc.ev += ev;
    }
    const years = [...byYear.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, monthMap]) => {
        const months = [...monthMap.entries()]
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([month, b]) => ({ month, ...b }));
        const yearTotal = months.reduce(
          (acc, m) => ({
            count: acc.count + m.count,
            investment: acc.investment + m.investment,
            profit: acc.profit + m.profit,
            ev: acc.ev + m.ev,
          }),
          { count: 0, investment: 0, profit: 0, ev: 0 },
        );
        return { year, months, total: yearTotal };
      });
    return { years, grand: grandAcc };
  }, [records, machineMap]);

  const total = useMemo(() => summarize(records, machines), [records, machines]);

  // 投資 / 回収 (= 収支) の通算統計 — セッション記録のみ対象
  const stats = useMemo(() => {
    const sessions = records.filter((r) => r.isSession);
    const investments = sessions.map(
      (r) => Number(r.totalInvestment ?? r.investment) || 0,
    );
    const recoveries = sessions.map((r) => recordProfit(r, machineMap));
    return {
      investment: summaryStats(investments),
      recovery: summaryStats(recoveries),
    };
  }, [records, machineMap]);

  if (records.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
        まだ記録がありません
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* 通算サマリ */}
      <div className="bg-slate-800 text-white rounded-lg p-4 space-y-1">
        <h2 className="font-bold mb-2">通算収支</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-xs text-slate-300">件数</div>
            <div className="font-semibold">{grand.count.toLocaleString()} 件</div>
          </div>
          <div>
            <div className="text-xs text-slate-300">総回転</div>
            <div className="font-semibold">{total.totalRotations.toLocaleString()} 回</div>
          </div>
          <div>
            <div className="text-xs text-slate-300">収支</div>
            <div
              className={`font-semibold ${
                grand.profit >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {formatSignedYen(grand.profit)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-300">期待値合計</div>
            <div
              className={`font-semibold ${
                grand.ev >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {formatSignedYen(grand.ev)}
            </div>
          </div>
        </div>

        {/* 投資 / 回収 統計 (左右並列) */}
        <div className="border-t border-slate-700 mt-3 pt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-slate-300 font-semibold mb-1">投資</div>
            <dl className="space-y-0.5 text-xs">
              <StatRow label="合計"   value={stats.investment.sum} />
              <StatRow label="最大"   value={stats.investment.max} />
              <StatRow label="最小"   value={stats.investment.min} />
              <StatRow label="平均"   value={stats.investment.mean} />
              <StatRow label="中央値" value={stats.investment.median} />
            </dl>
          </div>
          <div>
            <div className="text-xs text-slate-300 font-semibold mb-1">回収</div>
            <dl className="space-y-0.5 text-xs">
              <StatRow label="合計"   value={stats.recovery.sum}    signed />
              <StatRow label="最大"   value={stats.recovery.max}    signed />
              <StatRow label="最小"   value={stats.recovery.min}    signed />
              <StatRow label="平均"   value={stats.recovery.mean}   signed />
              <StatRow label="中央値" value={stats.recovery.median} signed />
            </dl>
          </div>
        </div>
      </div>

      {/* 年ごとのテーブル */}
      {years.map((yg) => (
        <div
          key={yg.year}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden"
        >
          <div className="px-3 py-2 bg-slate-100 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <span className="font-bold text-slate-900 dark:text-white">
              {yg.year}年
              <span className="ml-2 text-xs text-slate-500 dark:text-slate-400 font-normal">
                ({yg.total.count}件)
              </span>
            </span>
            <div className="flex gap-3 text-xs font-semibold">
              <span className={colorClass(yg.total.profit)}>
                収:{formatSignedYen(yg.total.profit)}
              </span>
              <span className={colorClass(yg.total.ev)}>
                期:{formatSignedYen(yg.total.ev)}
              </span>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400">
                <th className="px-2 py-1.5 text-left font-medium">月</th>
                <th className="px-2 py-1.5 text-right font-medium">件</th>
                <th className="px-2 py-1.5 text-right font-medium">投資</th>
                <th className="px-2 py-1.5 text-right font-medium">収支</th>
                <th className="px-2 py-1.5 text-right font-medium">期待値</th>
              </tr>
            </thead>
            <tbody>
              {yg.months.map((m) => {
                const monthLabel = String(parseInt(m.month.slice(5), 10));
                return (
                  <tr
                    key={m.month}
                    className="border-t border-slate-100 dark:border-slate-700/60"
                  >
                    <td className="px-2 py-1.5 text-slate-800 dark:text-slate-200 font-medium">
                      {monthLabel}月
                    </td>
                    <td className="px-2 py-1.5 text-right text-slate-600 dark:text-slate-300">
                      {m.count}
                    </td>
                    <td className="px-2 py-1.5 text-right text-slate-600 dark:text-slate-300">
                      ¥{Math.round(m.investment).toLocaleString()}
                    </td>
                    <td className={`px-2 py-1.5 text-right font-semibold ${colorClass(m.profit)}`}>
                      {formatSignedYen(m.profit)}
                    </td>
                    <td className={`px-2 py-1.5 text-right font-semibold ${colorClass(m.ev)}`}>
                      {formatSignedYen(m.ev)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
