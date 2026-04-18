import { useState, useMemo, useEffect } from 'react';
import { calcBorder } from '../utils/calculations';
import { useLocalStorage } from '../hooks/useLocalStorage';

const BALL_VALUE = 4; // 1玉 = 4円

function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// 実質投資額(円): 持ち玉が増えた分は投資から差し引く
function effectiveInvestment(totalInvestment, startBalls, currentBalls) {
  return totalInvestment - (currentBalls - startBalls) * BALL_VALUE;
}

// 1Kあたり回転数(玉価値考慮)
function calcPerK(currentRotations, startRotations, effInv) {
  const dRot = currentRotations - startRotations;
  if (effInv <= 0 || dRot <= 0) return 0;
  return (dRot * 1000) / effInv;
}

// 空文字なら fallback、それ以外は数値に変換 (0 を正しく扱うため `||` は使わない)
function numOr(input, fallback) {
  if (input === '' || input === null || input === undefined) return fallback;
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

export default function SessionRecorder({ machines, onComplete }) {
  // session が null = 未開始(idle)、それ以外は phase: 'playing' | 'hit-input'
  const [session, setSession] = useLocalStorage('pachi-active-session', null);

  // ====== idle: 開始フォーム ======
  const [startDate, setStartDate] = useState(todayStr());
  const [startMachineId, setStartMachineId] = useState(machines[0]?.id || '');
  const [startRotInput, setStartRotInput] = useState('');
  const [startBallsInput, setStartBallsInput] = useState('');
  const [startNotesInput, setStartNotesInput] = useState('');

  const handleStart = () => {
    if (!startMachineId) return;
    const startRotations = numOr(startRotInput, 0);
    const startBalls = numOr(startBallsInput, 0);
    setSession({
      id: Date.now().toString(),
      date: startDate,
      machineId: startMachineId,
      notes: startNotesInput,
      startedAt: new Date().toISOString(),
      startRotations,
      startBalls,
      currentRotations: startRotations,
      currentBalls: startBalls,
      totalInvestment: 0,
      hits: [],       // [{ atRotations, newRotations, ballsAfter, timestamp }]
      snapshots: [],  // [{ rotations, balls, investment, timestamp }]
      phase: 'playing',
    });
    setStartRotInput('');
    setStartBallsInput('');
    setStartNotesInput('');
  };

  // ====== playing: 入力 ======
  const [curRotInput, setCurRotInput] = useState('');
  const [curBallsInput, setCurBallsInput] = useState('');
  const [addInvInput, setAddInvInput] = useState('');

  // 遊戯セッション切替時に入力欄を同期
  useEffect(() => {
    if (session?.phase === 'playing') {
      setCurRotInput(String(session.currentRotations));
      setCurBallsInput(String(session.currentBalls));
      setAddInvInput('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.phase]);

  const machine = session ? machines.find((m) => m.id === session.machineId) : null;
  const border = machine ? calcBorder(machine) : 0;

  const livePerK = useMemo(() => {
    if (!session || session.phase !== 'playing') return 0;
    const curRot = numOr(curRotInput, session.currentRotations);
    const curBalls = numOr(curBallsInput, session.currentBalls);
    const addInv = numOr(addInvInput, 0);
    const totalInv = session.totalInvestment + addInv;
    const effInv = effectiveInvestment(totalInv, session.startBalls, curBalls);
    return calcPerK(curRot, session.startRotations, effInv);
  }, [session, curRotInput, curBallsInput, addInvInput]);

  // 入力欄の値を session にコミット
  const commitCurrent = () => {
    const curRot = numOr(curRotInput, session.currentRotations);
    const curBalls = numOr(curBallsInput, session.currentBalls);
    const addInv = numOr(addInvInput, 0);
    return {
      ...session,
      currentRotations: curRot,
      currentBalls: curBalls,
      totalInvestment: session.totalInvestment + addInv,
    };
  };

  const handleMidUpdate = () => {
    const updated = commitCurrent();
    const snapshot = {
      rotations: updated.currentRotations,
      balls: updated.currentBalls,
      investment: updated.totalInvestment,
      timestamp: new Date().toISOString(),
    };
    setSession({ ...updated, snapshots: [...updated.snapshots, snapshot] });
    setAddInvInput('');
  };

  const handleHit = () => {
    const updated = commitCurrent();
    setSession({ ...updated, phase: 'hit-input' });
    setAddInvInput('');
  };

  const handleEnd = () => {
    if (!confirm('遊戯を終了して履歴に保存しますか？')) return;
    const updated = commitCurrent();
    const totalRot = updated.currentRotations - updated.startRotations;
    const effInv = effectiveInvestment(
      updated.totalInvestment,
      updated.startBalls,
      updated.currentBalls
    );
    const record = {
      id: updated.id,
      date: updated.date,
      machineId: updated.machineId,
      notes: updated.notes,
      // RecordList / summarize 互換フィールド (玉価値考慮済み)
      rotations: Math.max(0, totalRot),
      investment: Math.max(0, Math.round(effInv)),
      // セッション詳細
      startRotations: updated.startRotations,
      startBalls: updated.startBalls,
      endRotations: updated.currentRotations,
      endBalls: updated.currentBalls,
      totalInvestment: updated.totalInvestment,
      hits: updated.hits,
      snapshots: updated.snapshots,
      startedAt: updated.startedAt,
      endedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      isSession: true,
    };
    onComplete(record);
    setSession(null);
  };

  // ====== hit-input ======
  const [hitRotInput, setHitRotInput] = useState('');
  const [hitBallsInput, setHitBallsInput] = useState('');
  const [hitAddInvInput, setHitAddInvInput] = useState('');

  useEffect(() => {
    if (session?.phase === 'hit-input') {
      setHitRotInput(String(session.currentRotations));
      setHitBallsInput(String(session.currentBalls));
      setHitAddInvInput('');
    }
  }, [session?.phase]);

  // あたり画面のライブ計算プレビュー（再開後の状態をシミュレート）
  const hitLiveStats = useMemo(() => {
    if (!session || session.phase !== 'hit-input') return null;
    const parsedRot = numOr(hitRotInput, session.currentRotations);
    // あたり発生時の累計回転数を下回らないようガード
    const newRot = Math.max(parsedRot, session.currentRotations);
    const newBalls = numOr(hitBallsInput, session.currentBalls);
    const addInv = numOr(hitAddInvInput, 0);
    const totalInv = session.totalInvestment + addInv;
    const effInv = effectiveInvestment(totalInv, session.startBalls, newBalls);
    const dRot = Math.max(0, newRot - session.startRotations);
    return {
      newRot,
      newBalls,
      dRot,
      totalInv,
      effInv,
      perK: calcPerK(newRot, session.startRotations, effInv),
      ballsGained: newBalls - session.currentBalls,
      rotRegression: parsedRot < session.currentRotations,
    };
  }, [session, hitRotInput, hitBallsInput, hitAddInvInput]);

  const handleResume = () => {
    const parsedRot = numOr(hitRotInput, session.currentRotations);
    // 累計回転数はあたり発生時の値を下回らないようガード（ラベル誤読による巻き戻しを防止）
    const newRot = Math.max(parsedRot, session.currentRotations);
    const newBalls = numOr(hitBallsInput, session.currentBalls);
    const addInv = numOr(hitAddInvInput, 0);
    const hit = {
      atRotations: session.currentRotations,
      newRotations: newRot,
      ballsBefore: session.currentBalls,
      ballsAfter: newBalls,
      ballsGained: newBalls - session.currentBalls,
      addedInvestment: addInv,
      timestamp: new Date().toISOString(),
    };
    setSession({
      ...session,
      currentRotations: newRot,
      currentBalls: newBalls,
      totalInvestment: session.totalInvestment + addInv,
      hits: [...session.hits, hit],
      phase: 'playing',
    });
    setHitRotInput('');
    setHitBallsInput('');
    setHitAddInvInput('');
  };

  const handleCancelSession = () => {
    if (!confirm('現在の遊戯を破棄して最初に戻りますか？(履歴には保存されません)')) return;
    setSession(null);
  };

  // ====================== RENDER ======================

  // ----- idle -----
  if (!session) {
    return (
      <div className="p-4 space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">遊戯開始</h2>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">日付</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">機種</label>
          <select
            value={startMachineId}
            onChange={(e) => setStartMachineId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
          >
            <option value="">選択してください</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}（ボーダー{calcBorder(m).toFixed(1)}）
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">現在の回転数</label>
            <input
              type="number"
              inputMode="numeric"
              value={startRotInput}
              onChange={(e) => setStartRotInput(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
              placeholder="例: 0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">持ち玉数</label>
            <input
              type="number"
              inputMode="numeric"
              value={startBallsInput}
              onChange={(e) => setStartBallsInput(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
              placeholder="例: 0"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">メモ（任意）</label>
          <input
            type="text"
            value={startNotesInput}
            onChange={(e) => setStartNotesInput(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
            placeholder="ホール名など"
          />
        </div>
        <button
          onClick={handleStart}
          disabled={!startMachineId}
          className="w-full bg-blue-600 disabled:opacity-50 text-white py-3 rounded-lg font-bold hover:bg-blue-700 active:bg-blue-800 transition"
        >
          ▶ 遊戯開始
        </button>
      </div>
    );
  }

  // ----- hit-input -----
  if (session.phase === 'hit-input') {
    const atRot = session.currentRotations;
    const atBalls = session.currentBalls;
    const preHitDRot = atRot - session.startRotations;
    const stats = hitLiveStats;
    return (
      <div className="p-4 space-y-4">
        <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-800 rounded-lg p-3">
          <div className="text-sm text-slate-600 dark:text-slate-300">{session.date}</div>
          <div className="font-bold text-slate-900 dark:text-white">{machine?.name ?? '不明'}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs mt-1">
            <div className="text-slate-600 dark:text-slate-300">開始からの累計回転</div>
            <div className="text-right font-semibold text-slate-900 dark:text-white">{preHitDRot.toLocaleString()} 回</div>
            <div className="text-slate-600 dark:text-slate-300">あたり時の回転数</div>
            <div className="text-right font-semibold text-slate-900 dark:text-white">{atRot.toLocaleString()} 回</div>
            <div className="text-slate-600 dark:text-slate-300">あたり時の持ち玉</div>
            <div className="text-right font-semibold text-slate-900 dark:text-white">{atBalls.toLocaleString()} 個</div>
            <div className="text-slate-600 dark:text-slate-300">累計投資</div>
            <div className="text-right font-semibold text-slate-900 dark:text-white">¥{session.totalInvestment.toLocaleString()}</div>
            <div className="text-slate-600 dark:text-slate-300">今回までのあたり</div>
            <div className="text-right font-semibold text-slate-900 dark:text-white">{session.hits.length} 回</div>
          </div>
        </div>

        <h2 className="text-lg font-bold text-slate-900 dark:text-white">🎉 あたり後の入力</h2>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            現在の回転数（機械表示の合計）
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={hitRotInput}
            onChange={(e) => setHitRotInput(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
          />
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            ※ 機械に表示されている「合計の回転数」を入力してください（あたり時の {atRot.toLocaleString()}回 以上）
          </div>
          {stats?.rotRegression && (
            <div className="text-xs text-red-600 dark:text-red-400 mt-1">
              ⚠️ あたり時の値を下回っています。自動的に {atRot.toLocaleString()}回 として扱います。
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            現在の持ち玉（あたり獲得後）
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={hitBallsInput}
            onChange={(e) => setHitBallsInput(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
          />
          {stats && stats.ballsGained !== 0 && (
            <div className={`text-xs mt-1 ${stats.ballsGained > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {stats.ballsGained > 0 ? '+' : ''}{stats.ballsGained.toLocaleString()} 玉
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            追加投資（円）<span className="text-xs text-slate-500">任意</span>
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={hitAddInvInput}
            onChange={(e) => setHitAddInvInput(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
            placeholder="あたり中に追加した金額があれば"
          />
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            累計投資: ¥{session.totalInvestment.toLocaleString()}
            {hitAddInvInput ? ` → ¥${(stats?.totalInv ?? session.totalInvestment).toLocaleString()}` : ''}
          </div>
        </div>

        {stats && (
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 space-y-1 text-sm">
            <div className="font-semibold text-slate-900 dark:text-white text-xs mb-1">再開後の状態（プレビュー）</div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">開始からの累計回転</span>
              <span className="font-semibold text-slate-900 dark:text-white">{stats.dRot.toLocaleString()} 回</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">累計投資</span>
              <span className="font-semibold text-slate-900 dark:text-white">¥{stats.totalInv.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">実質投資（玉価値考慮）</span>
              <span className="font-semibold text-slate-900 dark:text-white">¥{Math.max(0, Math.round(stats.effInv)).toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-300 dark:border-slate-700">
              <span className="font-bold text-slate-900 dark:text-white">1K回転数</span>
              <span className={`font-bold ${stats.perK - border >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {stats.perK.toFixed(2)} 回
                <span className="text-xs ml-1">
                  ({stats.perK - border >= 0 ? '+' : ''}{(stats.perK - border).toFixed(2)})
                </span>
              </span>
            </div>
          </div>
        )}

        <button
          onClick={handleResume}
          className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 active:bg-green-800"
        >
          ▶ 再開
        </button>
      </div>
    );
  }

  // ----- playing -----
  const dRot = numOr(curRotInput, session.currentRotations) - session.startRotations;
  const totalInvDisplay = session.totalInvestment + numOr(addInvInput, 0);
  const curBalls = numOr(curBallsInput, session.currentBalls);
  const effInv = effectiveInvestment(totalInvDisplay, session.startBalls, curBalls);
  const delta = livePerK - border;

  return (
    <div className="p-4 space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-800 rounded-lg p-3">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs text-slate-600 dark:text-slate-300">{session.date}</div>
            <div className="font-bold text-slate-900 dark:text-white">{machine?.name ?? '不明'}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              開始: {session.startRotations.toLocaleString()}回 / 持ち玉{session.startBalls.toLocaleString()}個
            </div>
            {session.hits.length > 0 && (
              <div className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                🎉 あたり {session.hits.length}回
              </div>
            )}
          </div>
          <button
            onClick={handleCancelSession}
            className="text-xs text-red-500 px-2 py-1"
          >
            破棄
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">現在の回転数</label>
        <input
          type="number"
          inputMode="numeric"
          value={curRotInput}
          onChange={(e) => setCurRotInput(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">現在の残玉数</label>
        <input
          type="number"
          inputMode="numeric"
          value={curBallsInput}
          onChange={(e) => setCurBallsInput(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">追加投資金額(円)</label>
        <input
          type="number"
          inputMode="numeric"
          value={addInvInput}
          onChange={(e) => setAddInvInput(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
          placeholder="例: 1000"
        />
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          累計投資: ¥{session.totalInvestment.toLocaleString()}
          {addInvInput ? ` → ¥${totalInvDisplay.toLocaleString()}` : ''}
        </div>
      </div>

      <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 space-y-1">
        <div className="text-sm flex justify-between">
          <span className="text-slate-600 dark:text-slate-300">開始からの累計回転</span>
          <span className="font-semibold text-slate-900 dark:text-white">{Math.max(0, dRot).toLocaleString()} 回</span>
        </div>
        <div className="text-sm flex justify-between">
          <span className="text-slate-600 dark:text-slate-300">累計投資</span>
          <span className="font-semibold text-slate-900 dark:text-white">¥{totalInvDisplay.toLocaleString()}</span>
        </div>
        <div className="text-sm flex justify-between">
          <span className="text-slate-600 dark:text-slate-300">実質投資 (玉価値考慮)</span>
          <span className="font-semibold text-slate-900 dark:text-white">¥{Math.max(0, Math.round(effInv)).toLocaleString()}</span>
        </div>
        <div className="text-sm flex justify-between">
          <span className="text-slate-600 dark:text-slate-300">ボーダー</span>
          <span className="font-semibold text-slate-900 dark:text-white">{border.toFixed(2)} 回/1K</span>
        </div>
        <div className="text-base flex justify-between pt-1 border-t border-slate-300 dark:border-slate-700">
          <span className="font-bold text-slate-900 dark:text-white">現在の1K回転数</span>
          <span className={`font-bold ${delta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {livePerK.toFixed(2)} 回
            <span className="text-xs ml-1">
              ({delta >= 0 ? '+' : ''}{delta.toFixed(2)})
            </span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={handleMidUpdate}
          className="bg-slate-600 text-white py-3 rounded-lg font-bold hover:bg-slate-700 active:bg-slate-800 text-sm"
        >
          🔄 遊戯途中
        </button>
        <button
          onClick={handleHit}
          className="bg-orange-500 text-white py-3 rounded-lg font-bold hover:bg-orange-600 active:bg-orange-700 text-sm"
        >
          🎉 あたり
        </button>
        <button
          onClick={handleEnd}
          className="bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 active:bg-red-800 text-sm"
        >
          ⏹ 遊戯終了
        </button>
      </div>
    </div>
  );
}
