import { useMemo } from 'react';
import { recalcSession, finalSegmentInvestment } from '../utils/sessionUtils';

// 遊戯詳細 (編集可能なタイムライン)
//
// 表示される行:
//   1. 開始       -- startRotations / startBalls
//   2. あたり N   -- 各 hit: atMachineRot / ballsAfter / addedInvestment / resumeMachineRot
//   3. 現在 or 終了 -- includeEndRow が true のとき (編集可能な最終 state 行)
//
// Props:
//   session        進行中セッション or 完了済み記録
//   machines       機種リスト
//   onChange       (updated) => void  編集があるたびに呼ばれる (recalc 済みを渡す)
//   includeEndRow  true のとき 現在/終了 行を含めて編集対象にする

function numOr(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function RowShell({ badge, title, accent, children }) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        accent === 'start'
          ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
          : accent === 'hit'
          ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800'
          : 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{badge}</span>
        <span className="font-bold text-slate-900 dark:text-white text-sm">{title}</span>
      </div>
      {children}
    </div>
  );
}

function NumField({ label, value, onChange, suffix, placeholder }) {
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
          placeholder={placeholder}
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

  // ===== 変更ハンドラ =====
  const applyChange = (patch) => {
    const next = recalcSession({ ...session, ...patch });
    onChange(next);
  };

  const patchHit = (idx, patch) => {
    const hits = (session.hits || []).map((h, i) => (i === idx ? { ...h, ...patch } : h));
    applyChange({ hits });
  };

  const patchFinalInvestment = (value) => {
    // 最終セグメント投資を変更 ⇒ totalInvestment = Σ(hits.addedInv) + final
    const sumHits = (session.hits || []).reduce(
      (s, h) => s + (Number(h.addedInvestment) || 0),
      0
    );
    const final = Math.max(0, numOr(value, 0));
    applyChange({ totalInvestment: sumHits + final });
  };

  const patchHitInvestment = (idx, value) => {
    // hit.addedInvestment 変更 ⇒ totalInvestment も差分で更新
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

      {/* あたり行 */}
      {(session.hits || []).map((h, i) => (
        <RowShell
          key={i}
          badge="🎯"
          title={`あたり ${i + 1}回目`}
          accent="hit"
        >
          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="あたり時の機械表示"
              value={h.atMachineRot}
              onChange={(v) => patchHit(i, { atMachineRot: numOr(v, 0) })}
              suffix="回"
            />
            <NumField
              label="あたり後の持ち玉"
              value={h.ballsAfter}
              onChange={(v) => patchHit(i, { ballsAfter: numOr(v, 0) })}
              suffix="個"
            />
            <NumField
              label="このセグメントの追加投資"
              value={h.addedInvestment}
              onChange={(v) => patchHitInvestment(i, v)}
              suffix="円"
            />
            <NumField
              label="再開時の機械表示"
              value={h.resumeMachineRot}
              onChange={(v) => patchHit(i, { resumeMachineRot: numOr(v, 0) })}
              suffix="回"
            />
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex justify-between items-center">
            <span>
              セグメント {h.segmentRot ?? 0}回 / 累計 {h.atCumulative ?? 0}回 /
              獲得 {h.ballsGained >= 0 ? '+' : ''}
              {h.ballsGained ?? 0}玉
            </span>
            {onDeleteHit && (
              <button
                onClick={() => {
                  if (confirm(`あたり ${i + 1}回目を削除しますか？`)) onDeleteHit(i);
                }}
                className="text-red-500 text-xs px-1"
              >
                削除
              </button>
            )}
          </div>
        </RowShell>
      ))}

      {/* 現在 or 終了 行 */}
      {includeEndRow && (
        <RowShell
          badge="🏁"
          title={session.endedAt ? '終了' : '現在'}
          accent="end"
        >
          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="機械表示 (回転)"
              value={session.endRotations ?? session.currentRotations}
              onChange={(v) => {
                const n = numOr(v, 0);
                applyChange(
                  session.endRotations != null
                    ? { endRotations: n }
                    : { currentRotations: n }
                );
              }}
              suffix="回"
            />
            <NumField
              label="持ち玉"
              value={session.endBalls ?? session.currentBalls}
              onChange={(v) => {
                const n = numOr(v, 0);
                applyChange(
                  session.endBalls != null ? { endBalls: n } : { currentBalls: n }
                );
              }}
              suffix="個"
            />
            <NumField
              label="このセグメントの追加投資"
              value={finalInv}
              onChange={patchFinalInvestment}
              suffix="円"
            />
          </div>
        </RowShell>
      )}
    </div>
  );
}
