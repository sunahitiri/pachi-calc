import { useMemo, useRef, useState } from 'react';
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

const PROFIT_COLOR = '#16a34a'; // green-600
const EV_COLOR = '#2563eb'; // blue-600

function lastDayOfMonth(year, month /* 1-12 */) {
  return new Date(year, month, 0).getDate();
}

function shiftMonth({ year, month }, delta) {
  let y = year;
  let m = month + delta;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { year: y, month: m };
}

function defaultMonth(records) {
  let latest = '';
  for (const r of records) {
    if (r.date && r.date > latest) latest = r.date;
  }
  if (latest) {
    return {
      year: Number(latest.slice(0, 4)),
      month: Number(latest.slice(5, 7)),
    };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default function ProfitChart({ records, machines }) {
  const machineMap = useMemo(
    () => Object.fromEntries(machines.map((m) => [m.id, m])),
    [machines],
  );
  const [current, setCurrent] = useState(() => defaultMonth(records));
  const lastDay = lastDayOfMonth(current.year, current.month);
  const ymPrefix = `${current.year}-${String(current.month).padStart(2, '0')}`;

  // 月内の日次/累計データ (1日〜末日まで全日埋め)
  const series = useMemo(() => {
    const profitByDay = new Map();
    const evByDay = new Map();
    for (const r of records) {
      const d = r.date || '';
      if (!d.startsWith(ymPrefix)) continue;
      const day = Number(d.slice(8, 10));
      profitByDay.set(day, (profitByDay.get(day) || 0) + recordProfit(r, machineMap));
      evByDay.set(day, (evByDay.get(day) || 0) + recordEV(r, machineMap));
    }
    let pAcc = 0;
    let eAcc = 0;
    const days = [];
    for (let d = 1; d <= lastDay; d++) {
      const pDaily = profitByDay.get(d) || 0;
      const eDaily = evByDay.get(d) || 0;
      pAcc += pDaily;
      eAcc += eDaily;
      days.push({
        day: d,
        profitDaily: pDaily,
        evDaily: eDaily,
        profit: pAcc,
        ev: eAcc,
      });
    }
    return days;
  }, [records, machineMap, ymPrefix, lastDay]);

  const hasData = useMemo(
    () => series.some((s) => s.profitDaily !== 0 || s.evDaily !== 0),
    [series],
  );

  // SVG 座標系
  const W = 360;
  const H = 220;
  const padL = 38;
  const padR = 12;
  const padT = 12;
  const padB = 38;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Y 軸範囲: 収支・期待値の累計と 0 を含む
  const allY = series.flatMap((s) => [s.profit, s.ev]);
  let yMin = Math.min(0, ...allY);
  let yMax = Math.max(0, ...allY);
  if (yMin === yMax) {
    yMin -= 1000;
    yMax += 1000;
  }
  const yRange = yMax - yMin;

  const xAt = (day) =>
    lastDay === 1
      ? padL + plotW / 2
      : padL + ((day - 1) / (lastDay - 1)) * plotW;
  const yAt = (v) => padT + ((yMax - v) / yRange) * plotH;
  const zeroY = yAt(0);

  const profitPath = series
    .map(
      (s, i) =>
        `${i === 0 ? 'M' : 'L'} ${xAt(s.day).toFixed(1)} ${yAt(s.profit).toFixed(1)}`,
    )
    .join(' ');
  const evPath = series
    .map(
      (s, i) =>
        `${i === 0 ? 'M' : 'L'} ${xAt(s.day).toFixed(1)} ${yAt(s.ev).toFixed(1)}`,
    )
    .join(' ');

  const last = series[series.length - 1];

  // チャート上の横スワイプで前月/翌月
  const touchRef = useRef(null);
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, locked: null };
  };
  const onTouchMove = (e) => {
    const ref = touchRef.current;
    if (!ref) return;
    const t = e.touches[0];
    const dx = t.clientX - ref.x;
    const dy = t.clientY - ref.y;
    if (!ref.locked && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      ref.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
  };
  const onTouchEnd = (e) => {
    const ref = touchRef.current;
    touchRef.current = null;
    if (!ref || ref.locked !== 'x') return;
    const t = e.changedTouches[0];
    const dx = t.clientX - ref.x;
    if (Math.abs(dx) < 40) return;
    // 左スワイプ → 翌月、右スワイプ → 前月
    setCurrent((c) => shiftMonth(c, dx < 0 ? 1 : -1));
  };

  return (
    <div className="p-4 space-y-3">
      {/* 月ナビゲーション */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5">
        <button
          type="button"
          onClick={() => setCurrent(shiftMonth(current, -1))}
          aria-label="前月"
          className="px-3 py-1 text-slate-700 dark:text-slate-200 text-lg leading-none hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
        >
          ◀
        </button>
        <div className="font-semibold text-slate-900 dark:text-white">
          {current.year}年{current.month}月
        </div>
        <button
          type="button"
          onClick={() => setCurrent(shiftMonth(current, 1))}
          aria-label="翌月"
          className="px-3 py-1 text-slate-700 dark:text-slate-200 text-lg leading-none hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
        >
          ▶
        </button>
      </div>

      {/* チャート (横スワイプで月切替) */}
      <div
        data-no-swipe
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3"
      >
        <div className="flex items-center justify-between text-xs mb-1">
          <div className="text-slate-500 dark:text-slate-400">月内累計</div>
          <div className="flex gap-3">
            <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: PROFIT_COLOR }}
              />
              収支
            </span>
            <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: EV_COLOR }}
              />
              期待値
            </span>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* 上下境界 */}
          <line
            x1={padL}
            x2={W - padR}
            y1={yAt(yMax)}
            y2={yAt(yMax)}
            stroke="#e2e8f0"
            strokeDasharray="2,3"
            strokeWidth="1"
          />
          <line
            x1={padL}
            x2={W - padR}
            y1={yAt(yMin)}
            y2={yAt(yMin)}
            stroke="#e2e8f0"
            strokeDasharray="2,3"
            strokeWidth="1"
          />
          <text
            x={padL - 4}
            y={yAt(yMax) + 3}
            textAnchor="end"
            fontSize="9"
            fill="#94a3b8"
          >
            {fmtAxis(yMax)}
          </text>
          <text
            x={padL - 4}
            y={yAt(yMin) + 3}
            textAnchor="end"
            fontSize="9"
            fill="#94a3b8"
          >
            {fmtAxis(yMin)}
          </text>

          {/* ゼロライン */}
          {yMin < 0 && yMax > 0 && (
            <>
              <line
                x1={padL}
                x2={W - padR}
                y1={zeroY}
                y2={zeroY}
                stroke="#64748b"
                strokeWidth="1"
              />
              <text
                x={padL - 4}
                y={zeroY + 3}
                textAnchor="end"
                fontSize="9"
                fill="#64748b"
              >
                0
              </text>
            </>
          )}

          {/* 日付の縦グリッド (7日刻み + 末日のみ・薄め) */}
          {Array.from({ length: lastDay }, (_, i) => i + 1)
            .filter((d) => d === 1 || d % 7 === 1 || d === lastDay)
            .map((d) => (
              <line
                key={`grid-${d}`}
                x1={xAt(d)}
                x2={xAt(d)}
                y1={padT}
                y2={H - padB}
                stroke="#f1f5f9"
                strokeWidth="0.5"
              />
            ))}

          {/* 期待値ライン (先に描画して収支を上に重ねる) */}
          <path d={evPath} fill="none" stroke={EV_COLOR} strokeWidth="1.8" />
          {series.map((s) => (
            <circle
              key={`ev-${s.day}`}
              cx={xAt(s.day)}
              cy={yAt(s.ev)}
              r="1.6"
              fill={EV_COLOR}
            />
          ))}

          {/* 収支ライン */}
          <path d={profitPath} fill="none" stroke={PROFIT_COLOR} strokeWidth="1.8" />
          {series.map((s) => (
            <circle
              key={`p-${s.day}`}
              cx={xAt(s.day)}
              cy={yAt(s.profit)}
              r="1.6"
              fill={PROFIT_COLOR}
            />
          ))}

          {/* X 軸: 7日刻みの日付ラベル (1, 8, 15, 22, 29 + 末日) */}
          {Array.from({ length: lastDay }, (_, i) => i + 1)
            .filter((d) => d === 1 || d % 7 === 1 || d === lastDay)
            .map((d) => (
              <text
                key={`lbl-${d}`}
                x={xAt(d)}
                y={H - padB + 14}
                fontSize="9"
                fill="#94a3b8"
                textAnchor="middle"
              >
                {d}
              </text>
            ))}
        </svg>

        {!hasData && (
          <div className="mt-1 text-center text-xs text-slate-400 dark:text-slate-500">
            この月の記録はありません
          </div>
        )}
      </div>

      {/* 当月サマリ */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 grid grid-cols-2 gap-2 text-center text-xs">
        <div>
          <div className="text-slate-500 dark:text-slate-400">月内収支</div>
          <div
            className={`font-semibold text-sm ${
              last.profit >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatSignedYen(last.profit)}
          </div>
        </div>
        <div>
          <div className="text-slate-500 dark:text-slate-400">月内期待値</div>
          <div
            className={`font-semibold text-sm ${
              last.ev >= 0
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-orange-600 dark:text-orange-400'
            }`}
          >
            {formatSignedYen(last.ev)}
          </div>
        </div>
      </div>

      {/* 日次内訳 (記録のある日のみ・降順) */}
      {hasData && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-slate-100 dark:bg-slate-700/50 text-xs font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
            日次内訳
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 dark:text-slate-400">
                <th className="px-2 py-1.5 text-left font-medium">日</th>
                <th className="px-2 py-1.5 text-right font-medium">収支</th>
                <th className="px-2 py-1.5 text-right font-medium">期待値</th>
              </tr>
            </thead>
            <tbody>
              {series
                .filter((s) => s.profitDaily !== 0 || s.evDaily !== 0)
                .slice()
                .reverse()
                .map((s) => (
                  <tr
                    key={s.day}
                    className="border-t border-slate-100 dark:border-slate-700/60"
                  >
                    <td className="px-2 py-1.5 text-slate-800 dark:text-slate-200">
                      {s.day}日
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right font-semibold ${
                        s.profitDaily >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {formatSignedYen(s.profitDaily)}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right font-semibold ${
                        s.evDaily >= 0
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-orange-600 dark:text-orange-400'
                      }`}
                    >
                      {formatSignedYen(s.evDaily)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
