import { useMemo, useState } from 'react';
import { calcExpectedValue, calcSessionExpectedValue } from '../utils/calculations';

// セッション記録の収支 (円)
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

// yen を K/M 単位に丸めた軸ラベル
function fmtAxis(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

const MODES = [
  { id: 'profit', label: '収支' },
  { id: 'ev', label: '期待値' },
];

export default function ProfitChart({ records, machines }) {
  const [mode, setMode] = useState('profit');

  const machineMap = useMemo(
    () => Object.fromEntries(machines.map((m) => [m.id, m])),
    [machines],
  );

  // 日付昇順 → 日ごとの収支 or 期待値 → 累計
  const series = useMemo(() => {
    const valueFn = mode === 'profit' ? recordProfit : recordEV;
    const byDate = new Map();
    for (const r of records) {
      const d = r.date || '';
      if (!d) continue;
      byDate.set(d, (byDate.get(d) || 0) + valueFn(r, machineMap));
    }
    const days = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let acc = 0;
    return days.map(([date, v]) => {
      acc += v;
      return { date, daily: v, cumulative: acc };
    });
  }, [records, machineMap, mode]);

  if (series.length === 0) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                mode === m.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="p-8 text-center text-slate-500 dark:text-slate-400">
          まだ記録がありません
        </div>
      </div>
    );
  }

  // SVG 座標計算
  const W = 320; // viewBox 幅
  const H = 200; // viewBox 高さ
  const padL = 40;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const ys = series.map((s) => s.cumulative);
  let yMin = Math.min(0, ...ys);
  let yMax = Math.max(0, ...ys);
  if (yMin === yMax) {
    yMin -= 1000;
    yMax += 1000;
  }
  const yRange = yMax - yMin;

  const xAt = (i) =>
    series.length === 1
      ? padL + plotW / 2
      : padL + (i / (series.length - 1)) * plotW;
  const yAt = (v) => padT + ((yMax - v) / yRange) * plotH;

  const zeroY = yAt(0);
  const path = series
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(s.cumulative).toFixed(1)}`)
    .join(' ');
  // 塗りつぶし用 (0 ラインから上下を塗る)
  const areaPath =
    `M ${xAt(0).toFixed(1)} ${zeroY.toFixed(1)} ` +
    series.map((s, i) => `L ${xAt(i).toFixed(1)} ${yAt(s.cumulative).toFixed(1)}`).join(' ') +
    ` L ${xAt(series.length - 1).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  const last = series[series.length - 1];
  const first = series[0];
  const maxEntry = series.reduce((a, b) => (b.cumulative > a.cumulative ? b : a));
  const minEntry = series.reduce((a, b) => (b.cumulative < a.cumulative ? b : a));
  const lineColor = last.cumulative >= 0 ? '#16a34a' : '#dc2626'; // green-600 / red-600
  const areaColor = last.cumulative >= 0 ? 'rgba(22,163,74,0.18)' : 'rgba(220,38,38,0.18)';

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${
              mode === m.id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
          累計{mode === 'profit' ? '収支' : '期待値'}の推移
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* 背景グリッド (Y軸 0 線 + 上下目盛 3 本) */}
          {[yMax, (yMax + 0) / 2, 0, (yMin + 0) / 2, yMin].map((v, i) => {
            if (v === yMax || v === yMin) {
              return (
                <g key={i}>
                  <line
                    x1={padL}
                    x2={W - padR}
                    y1={yAt(v)}
                    y2={yAt(v)}
                    stroke="#e2e8f0"
                    strokeDasharray="2,3"
                    strokeWidth="1"
                  />
                  <text
                    x={padL - 4}
                    y={yAt(v) + 3}
                    textAnchor="end"
                    fontSize="9"
                    fill="#94a3b8"
                  >
                    {fmtAxis(v)}
                  </text>
                </g>
              );
            }
            return null;
          })}

          {/* ゼロライン */}
          {yMin < 0 && yMax > 0 && (
            <line
              x1={padL}
              x2={W - padR}
              y1={zeroY}
              y2={zeroY}
              stroke="#64748b"
              strokeWidth="1"
            />
          )}

          {/* 0 ラベル */}
          {yMin < 0 && yMax > 0 && (
            <text
              x={padL - 4}
              y={zeroY + 3}
              textAnchor="end"
              fontSize="9"
              fill="#64748b"
            >
              0
            </text>
          )}

          {/* 塗りつぶし */}
          <path d={areaPath} fill={areaColor} />

          {/* 折れ線 */}
          <path d={path} fill="none" stroke={lineColor} strokeWidth="2" />

          {/* 各ポイント */}
          {series.map((s, i) => (
            <circle
              key={s.date}
              cx={xAt(i)}
              cy={yAt(s.cumulative)}
              r={series.length <= 30 ? 2.5 : 1.5}
              fill={lineColor}
            />
          ))}

          {/* 最終点 (強調) */}
          <circle
            cx={xAt(series.length - 1)}
            cy={yAt(last.cumulative)}
            r="4"
            fill={lineColor}
            stroke="#fff"
            strokeWidth="1.5"
          />

          {/* X 軸: 始点・終点の日付 */}
          <text
            x={padL}
            y={H - 6}
            fontSize="9"
            fill="#94a3b8"
            textAnchor="start"
          >
            {first.date.slice(5)}
          </text>
          <text
            x={W - padR}
            y={H - 6}
            fontSize="9"
            fill="#94a3b8"
            textAnchor="end"
          >
            {last.date.slice(5)}
          </text>
        </svg>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <div className="text-slate-500 dark:text-slate-400">現在</div>
            <div
              className={`font-semibold text-sm ${
                last.cumulative >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatSignedYen(last.cumulative)}
            </div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">最大</div>
            <div className="font-semibold text-sm text-green-600 dark:text-green-400">
              {formatSignedYen(maxEntry.cumulative)}
            </div>
            <div className="text-[10px] text-slate-400">{maxEntry.date.slice(5)}</div>
          </div>
          <div>
            <div className="text-slate-500 dark:text-slate-400">最小</div>
            <div className="font-semibold text-sm text-red-600 dark:text-red-400">
              {formatSignedYen(minEntry.cumulative)}
            </div>
            <div className="text-[10px] text-slate-400">{minEntry.date.slice(5)}</div>
          </div>
        </div>
      </div>

      {/* 日次内訳 (直近 10 件) */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-slate-100 dark:bg-slate-700/50 text-xs font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
          日次内訳 (直近 {Math.min(10, series.length)} 日)
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 dark:text-slate-400">
              <th className="px-2 py-1.5 text-left font-medium">日付</th>
              <th className="px-2 py-1.5 text-right font-medium">当日</th>
              <th className="px-2 py-1.5 text-right font-medium">累計</th>
            </tr>
          </thead>
          <tbody>
            {series.slice(-10).reverse().map((s) => (
              <tr
                key={s.date}
                className="border-t border-slate-100 dark:border-slate-700/60"
              >
                <td className="px-2 py-1.5 text-slate-800 dark:text-slate-200">{s.date}</td>
                <td
                  className={`px-2 py-1.5 text-right font-semibold ${
                    s.daily >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {formatSignedYen(s.daily)}
                </td>
                <td
                  className={`px-2 py-1.5 text-right font-semibold ${
                    s.cumulative >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {formatSignedYen(s.cumulative)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
