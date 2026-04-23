import { useMemo } from 'react';
import { recalcSession, finalSegmentInvestment } from '../utils/sessionUtils';

// 遊戯詳細 (編集可能なタイムライン)
//
// 表示される行:
//   1. 開始           -- startRotations / startBalls
//   2. あたり N       -- atMachineRot / ballsBefore(表示のみ) / addedInvestment
//   3. N回目あたり後  -- resumeMachineRot / ballsAfter
//   4. 現在 or 終了   -- includeEndRow が true のとき

function numOr(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function RowShell({ badge, title, accent, children, actions }) {
  const accentClass =
    accent === 'start'
      ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
      : accent === 'hit'
      ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800'
      : accent === 'after-hit'
      ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800'
      : 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800';

  return (
    <div className={`rounded-lg border p-3 ${accentClass}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">{badge}</span>
          <span className="font-bold text-slate-900 dark:text-white text-sm">{title}</span>
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function CompactInput({ label, value, onChange }) {
  return (
    <div>
      <span className="block text-xs text-slate-500 dark:text-slate-400 text-center mb-0.5">
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 px-1.5 py-1 border border-slate-300 rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-sm text-center"
      />
    </div>
  );
}

function CompactDisplay({ label, value }) {
  return (
    <div>
      <span className="block text-xs text-slate-500 dark:text-slate-400 text-center mb-0.5">
        {label}
      </span>
      <div className="w-full px-1.5 py-1 bg-slate-100 dark:bg-slate-600 rounded text-sm text-center text-slate-700 dark:text-slate-200 font-medium">
        {value ?? '-'}
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, suffix }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-600 dark:text-slate-300 mb-0.5">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          inputMode="numeric"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 px-2 py-1.5 border border-slate-300 rounded bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white text-sm"
        />
        {suffix && (
          <span className="text-xs text-slate-500 dark:text-slate-400">{suffix}</span>
        )}
      </div>
    </label>
  );
}

export default function SessionDetail({
  session,
  machines,
  onChange,
  includeEndRow = false,
  onDeleteHit,
}) {
  const machine = useMemo(
    () => machines.find((m) => m.id === session?.machineId) || null,
    [machines, session?.machineId]
  );

  if (!session) return null;

  const applyChange = (patch) => {
    const next = recalcSession({ ...session, ...patch });
    onChange(next);
  };

  const patchHit = (idx, patch) => {
    const hits = (session.hits || []).map((h, i) => (i === idx ? { ...h, ...patch } : h));
    applyChange({ hits });
  };

  const patchFinalInvestment = (value) => {
    const sumHits = (session.hits || []).reduce(
      (s, h) => s + (Number(h.addedInvestment) || 0),
      0
    );
    const final = Math.max(0, numOr(value, 0));
    applyChange({ totalInvestment: sumHits + final });
  };

  const patchHitInvestment = (idx, value) => {
    const hits = session.hits || [];
    const oldVal = Number(hits[idx]?.addedInvestment) || 0;
    const newVal = Math.max(0, numOr(value, 0));
    const delta = newVal - oldVal;
    const newHits = hits.map((h, i) =>
      i === idx ? { ...h, addedInvestment: newVal } : h
    );
    applyChange({
      hits: newHits,
      totalInvestment: (Number(session.totalInvestment) || 0) + delta,
    });
  };

  const finalInv = finalSegmentInvestment(session);

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
        遊戯詳細 {machine ? `(${machine.name})` : ''}
      </div>

      {/* 開始行 */}
      <RowShell badge="📍" title="開始" accent="start">
        <div className="grid grid-cols-2 gap-2">
          <NumField
            label="機械表示 (回転)"
            value={session.startRotations}
            onChange={(v) => applyChange({ startRotations: numOr(v, 0) })}
            suffix="回"
          />
          <NumField
            label="持ち玉"
            value={session.startBalls}
            onChange={(v) => applyChange({ startBalls: numOr(v, 0) })}
            suffix="個"
          />
        </div>
      </RowShell>

      {/* あたり行 (hit + after-hit) */}
      {(session.hits || []).map((h, i) => (
        <div key={i} className="space-y-1">
          {/* あたり x回目: 回転数 / 持ち玉(表示のみ) / 現金投資 を横一行 */}
          <RowShell badge="🎯" title={`あたり ${i + 1}回目`} accent="hit">
            <div className="grid grid-cols-3 gap-2">
              <CompactInput
                label="回転数(回)"
                value={h.atMachineRot}
                onChange={(v) => patchHit(i, { atMachineRot: numOr(v, 0) })}
              />
              <CompactDisplay
                label="持ち玉(個)"
                value={h.ballsBefore ?? 0}
              />
              <CompactInput
                label="現金投資(円)"
                value={h.addedInvestment}
                onChange={(v) => patchHitInvestment(i, v)}
              />
            </div>
          </RowShell>

          {/* x回目あたり後: 回転数 / 持ち玉 を横一行 */}
          <RowShell
            badge="✨"
            title={`${i + 1}回目あたり後`}
            accent="after-hit"
            actions={
              onDeleteHit && (
                <button
                  onClick={() => {
                    if (confirm(`あたり ${i + 1}回目を削除しますか？`)) onDeleteHit(i);
                  }}
                  className="text-red-500 text-xs px-1"
                >
                  削除
                </button>
              )
            }
          >
            <div className="grid grid-cols-2 gap-2">
              <CompactInput
                label="回転数(回)"
                value={h.resumeMachineRot}
                onChange={(v) => patchHit(i, { resumeMachineRot: numOr(v, 0) })}
              />
              <CompactInput
                label="持ち玉(個)"
                value={h.ballsAfter}
                onChange={(v) => patchHit(i, { ballsAfter: numOr(v, 0) })}
              />
            </div>
          </RowShell>
        </div>
      ))}

      {/* 現在 or 終了 行 */}
      {includeEndRow && (
        <RowShell
          badge="🏁"
          title={session.endedAt ? '終了' : '現在'}
          accent="end"
        >
          <div className="grid grid-cols-3 gap-2">
            <CompactInput
              label="回転数(回)"
              value={session.endRotations ?? session.currentRotations}
              onChange={(v) => {
                const n = numOr(v, 0);
                applyChange(
                  session.endRotations != null
                    ? { endRotations: n }
                    : { currentRotations: n }
                );
              }}
            />
            <CompactInput
              label="持ち玉(個)"
              value={session.endBalls ?? session.currentBalls}
              onChange={(v) => {
                const n = numOr(v, 0);
                applyChange(
                  session.endBalls != null ? { endBalls: n } : { currentBalls: n }
                );
              }}
            />
            <CompactInput
              label="現金投資(円)"
              value={finalInv}
              onChange={patchFinalInvestment}
            />
          </div>
        </RowShell>
      )}
    </div>
  );
}
