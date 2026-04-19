import { useMemo } from 'react';
import { calcExpectedValue, calcSessionExpectedValue, summarize, rotationsPer1K, calcBorder } from '../utils/calculations';

export default function RecordList({ records, machines, onDelete }) {
  const machineMap = useMemo(
    () => Object.fromEntries(machines.map((m) => [m.id, m])),
    [machines]
  );

  const sorted = useMemo(
    () => [...records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [records]
  );

  const summary = useMemo(() => summarize(records, machines), [records, machines]);

  // 収支合計 (セッション記録のみ対象)
  const totalProfit = useMemo(() => {
    return records.reduce((acc, r) => {
      if (!r.isSession) return acc;
      const m = machineMap[r.machineId];
      const rate = r.exchangeRate ?? m?.exchangeRate ?? 4;
      const cash = Number(r.totalInvestment ?? r.investment) || 0;
      const startBalls = Number(r.startBalls) || 0;
      const endBalls = Number(r.endBalls) || 0;
      return acc + (endBalls - startBalls) * rate - cash;
    }, 0);
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
      <div className="bg-slate-800 text-white rounded-lg p-4 space-y-2">
        <h2 className="font-bold">合計</h2>
        <div className="grid grid-cols-2 gap-2 text-center text-sm">
          <div>
            <div className="text-slate-300 text-xs">投資額</div>
            <div className="font-semibold">¥{summary.totalInvestment.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-slate-300 text-xs">総回転数</div>
            <div className="font-semibold">{summary.totalRotations.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-slate-300 text-xs">期待値合計</div>
            <div className={`font-semibold ${summary.totalExpectedValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {summary.totalExpectedValue >= 0 ? '+' : ''}¥{summary.totalExpectedValue.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-slate-300 text-xs">収支合計</div>
            <div className={`font-semibold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalProfit >= 0 ? '+' : ''}¥{Math.round(totalProfit).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {sorted.map((r) => {
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
          const perK = rotationsPer1K(r.rotations, r.investment);
          const exRate = r.exchangeRate ?? machine?.exchangeRate ?? 4;
          const border = machine ? calcBorder({ ...machine, exchangeRate: exRate }) : 0;
          const cashInv = Number(r.totalInvestment ?? r.investment) || 0;
          const profit = r.isSession
            ? ((Number(r.endBalls) || 0) - (Number(r.startBalls) || 0)) * exRate - cashInv
            : null;
          return (
            <div
              key={r.id}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-sm"
            >
              <div className="flex justify-between items-start mb-1">
                <div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">{r.date}</div>
                  <div className="font-medium text-slate-900 dark:text-white">
                    {machine?.name ?? '（削除済み機種）'}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm('この記録を削除しますか？')) onDelete(r.id);
                  }}
                  className="text-red-500 hover:text-red-700 text-sm"
                  aria-label="削除"
                >
                  削除
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-slate-600 dark:text-slate-300 mt-2">
                <div>投資: ¥{r.investment.toLocaleString()}</div>
                <div>回転: {r.rotations.toLocaleString()}</div>
                <div>1K: {perK.toFixed(1)}回 (B:{border.toFixed(1)})</div>
                <div className={`font-semibold ${ev >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  期待値: {ev >= 0 ? '+' : ''}¥{ev.toLocaleString()}
                </div>
                {profit !== null && (
                  <div className={`col-span-2 font-semibold ${profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    収支: {profit >= 0 ? '+' : ''}¥{Math.round(profit).toLocaleString()}
                  </div>
                )}
              </div>
              {r.isSession && (
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded px-2 py-1">
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>🎮 セッション</span>
                    <span>あたり {r.hits?.length ?? 0}回</span>
                    <span>{r.startRotations?.toLocaleString()} → {r.endRotations?.toLocaleString()}回</span>
                    <span>持玉 {r.startBalls?.toLocaleString()} → {r.endBalls?.toLocaleString()}個</span>
                    {typeof r.totalInvestment === 'number' && r.totalInvestment !== r.investment && (
                      <span>現金投資 ¥{r.totalInvestment.toLocaleString()}</span>
                    )}
                  </div>
                </div>
              )}
              {r.notes && (
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">📝 {r.notes}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
