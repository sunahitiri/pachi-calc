import { useState, useMemo, useEffect } from 'react';
import { calcBorder } from '../utils/calculations';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { finalSegmentInvestment } from '../utils/sessionUtils';
import SessionDetail from './SessionDetail';
import MachineSelector from './MachineSelector';

const BALL_VALUE = 4; // 1玉 = 4円 (玉貸しレート)

// 交換レートの選択肢 (1玉 = X円: 景品交換時の換金価値)
const EXCHANGE_OPTIONS = [
  { id: '28', label: '28玉交換', rate: 100 / 28 },
  { id: '25', label: '25玉交換 (等価)', rate: 4 },
];
const DEFAULT_EXCHANGE_ID = '28';

function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// あたりで獲得した持ち玉の合計(全セグメント)
function sumHitBallsGained(hits) {
  return (hits || []).reduce((s, h) => s + (h.ballsGained || 0), 0);
}

// 累計投資額(円): 現金投資から、あたり以外で得た持ち玉分(=通常プレイ中の玉貸出等)を差し引く。
// あたり中に増えた球は差し引かない(= 投資が減らない)
function cumulativeInvestment(totalInvestment, startBalls, currentBalls, hitBallsGained) {
  const nonHitBallsDelta = (currentBalls - startBalls) - hitBallsGained;
  return totalInvestment - nonHitBallsDelta * BALL_VALUE;
}

// 1Kあたり回転数 — dRot は累計回転数(全セグメント合算)、cumInv は累計投資
function calcPerK(dRot, cumInv) {
  if (cumInv <= 0 || dRot <= 0) return 0;
  return (dRot * 1000) / cumInv;
}

// 現金・持ち玉を区別した厳密コスト内訳
// 方針: 現金で借りた玉(totalInvestment/4)を先に消費したとみなし、残りを持ち玉消費とする
function strictCostBreakdown(session, currentBalls, currentTotalInv, dRot) {
  const cashBalls = currentTotalInv / BALL_VALUE;
  const hitPayout = sumHitBallsGained(session.hits);
  const totalConsumed = session.startBalls + cashBalls + hitPayout - currentBalls;
  const cashConsumed = Math.max(0, Math.min(cashBalls, totalConsumed));
  const stockConsumed = Math.max(0, totalConsumed - cashConsumed);
  return {
    totalConsumed,
    cashConsumed,
    stockConsumed,
    ballsPerRot: dRot > 0 ? totalConsumed / dRot : 0,
  };
}

// 累計期待値(厳密版): 現金コストは 4円/玉、持ち玉コストは exchangeRate/玉
function strictTotalEV(session, currentBalls, currentTotalInv, dRot, machine) {
  if (!machine || dRot <= 0) return 0;
  const incomePerRot = (1 / machine.probability) * machine.averagePayout * machine.exchangeRate;
  const { cashConsumed, stockConsumed } = strictCostBreakdown(session, currentBalls, currentTotalInv, dRot);
  const cashCost = cashConsumed * BALL_VALUE;
  const stockCost = stockConsumed * machine.exchangeRate;
  return incomePerRot * dRot - (cashCost + stockCost);
}

// 期待時給: 「持ち玉のみで打ち続けた場合」の EV/回転 × 回転/時
// → 現金投資なしで rotationsPerHour 回転した場合の累計期待値と一致する
function strictHourlyEV(session, currentBalls, currentTotalInv, dRot, machine, rotationsPerHour = 200) {
  if (!machine || dRot <= 0) return 0;
  const incomePerRot = (1 / machine.probability) * machine.averagePayout * machine.exchangeRate;
  const { ballsPerRot } = strictCostBreakdown(session, currentBalls, currentTotalInv, dRot);
  if (ballsPerRot <= 0) return 0;
  const costPerRot = ballsPerRot * machine.exchangeRate;
  return (incomePerRot - costPerRot) * rotationsPerHour;
}

// 空文字なら fallback、それ以外は数値に変換 (0 を正しく扱うため `||` は使わない)
function numOr(input, fallback) {
  if (input === '' || input === null || input === undefined) return fallback;
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

// セグメント状態の取得(旧データ互換: フィールド欠損時は初期値で補完)
function getSegState(session) {
  return {
    segmentStart: session.segmentStartRotations ?? session.startRotations,
    cumulative: session.cumulativeRotations ?? 0,
  };
}

// 累計回転数 = 過去セグメント累計 + 現セグメント差分(機械表示 - セグメント開始値)
function totalDRot(session, currentRot) {
  const { segmentStart, cumulative } = getSegState(session);
  return cumulative + Math.max(0, currentRot - segmentStart);
}

export default function SessionRecorder({ machines, onComplete }) {
  // session が null = 未開始(idle)、それ以外は phase: 'playing' | 'hit-input'
  const [session, setSession] = useLocalStorage('pachi-active-session', null);

  // ====== idle: 開始フォーム ======
  const [startDate, setStartDate] = useState(todayStr());
  const [startExchangeId, setStartExchangeId] = useState(DEFAULT_EXCHANGE_ID);
  const [startMachineId, setStartMachineId] = useState(machines[0]?.id || '');
  const [startRotInput, setStartRotInput] = useState('');
  const [startBallsInput, setStartBallsInput] = useState('');
  const [startNotesInput, setStartNotesInput] = useState('');

  const handleStart = () => {
    if (!startMachineId) return;
    const startRotations = numOr(startRotInput, 0);
    const startBalls = numOr(startBallsInput, 0);
    const exchangeOpt = EXCHANGE_OPTIONS.find((o) => o.id === startExchangeId) || EXCHANGE_OPTIONS[0];
    setSession({
      id: Date.now().toString(),
      date: startDate,
      machineId: startMachineId,
      exchangeId: exchangeOpt.id,
      exchangeRate: exchangeOpt.rate,
      notes: startNotesInput,
      startedAt: new Date().toISOString(),
      startRotations,
      startBalls,
      currentRotations: startRotations,
      currentBalls: startBalls,
      // セグメント管理: あたり後に機械表示がリセットされても累計を保持する
      cumulativeRotations: 0,          // 確定済みセグメント合計(あたり前までの累計)
      segmentStartRotations: startRotations, // 現セグメントの開始機械表示
      totalInvestment: 0,
      hits: [],       // [{ atMachineRot, atCumulative, resumeMachineRot, segmentRot, ballsBefore, ballsAfter, ballsGained, addedInvestment, timestamp }]
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
  // 遊戯詳細の編集ドラフト (null = 閉じている)
  const [detailDraft, setDetailDraft] = useState(null);
  const showDetail = detailDraft !== null;
  const openDetail = () => setDetailDraft(session);
  const closeDetail = () => setDetailDraft(null);
  const isDetailDirty =
    detailDraft !== null && JSON.stringify(detailDraft) !== JSON.stringify(session);
  const saveDetail = () => {
    if (detailDraft) setSession(detailDraft);
    closeDetail();
  };
  const cancelDetail = () => {
    if (isDetailDirty && !confirm('編集内容を破棄しますか？')) return;
    closeDetail();
  };

  // 遊戯セッション切替時に入力欄を同期
  useEffect(() => {
    if (session?.phase === 'playing') {
      setCurRotInput(String(session.currentRotations));
      setCurBallsInput(String(session.currentBalls));
      setAddInvInput('');
    }
    // セッションが切り替わった (= id が変わった or null になった) ら、
    // 前回開いていた遊戯詳細パネルが次セッションに引き継がれないようリセット
    setDetailDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.phase]);

  const rawMachine = session ? machines.find((m) => m.id === session.machineId) : null;
  // セッションで選択した交換レートを優先 (旧セッション互換で未設定なら機種の値)
  const machine = rawMachine
    ? { ...rawMachine, exchangeRate: session.exchangeRate ?? rawMachine.exchangeRate }
    : null;
  const border = machine ? calcBorder(machine) : 0;

  const livePerK = useMemo(() => {
    if (!session || session.phase !== 'playing') return 0;
    const curRot = numOr(curRotInput, session.currentRotations);
    const curBalls = numOr(curBallsInput, session.currentBalls);
    const addInv = numOr(addInvInput, 0);
    const totalInv = session.totalInvestment + addInv;
    const cumInv = cumulativeInvestment(totalInv, session.startBalls, curBalls, sumHitBallsGained(session.hits));
    return calcPerK(totalDRot(session, curRot), cumInv);
  }, [session, curRotInput, curBallsInput, addInvInput]);

  // 入力欄の値を session にコミット
  const commitCurrent = () => {
    const parsedRot = numOr(curRotInput, session.currentRotations);
    const { segmentStart } = getSegState(session);
    // 現セグメント内では機械表示が開始値を下回らないようガード
    const curRot = Math.max(parsedRot, segmentStart);
    const curBalls = numOr(curBallsInput, session.currentBalls);
    const addInv = numOr(addInvInput, 0);
    return {
      ...session,
      currentRotations: curRot,
      currentBalls: curBalls,
      totalInvestment: session.totalInvestment + addInv,
    };
  };

  const handleHit = () => {
    const updated = commitCurrent();
    setSession({ ...updated, phase: 'hit-input' });
    setAddInvInput('');
  };

  const handleEnd = () => {
    if (!confirm('遊戯を終了して履歴に保存しますか？')) return;
    const updated = commitCurrent();
    const totalRot = totalDRot(updated, updated.currentRotations);
    const cumInv = cumulativeInvestment(
      updated.totalInvestment,
      updated.startBalls,
      updated.currentBalls,
      sumHitBallsGained(updated.hits)
    );
    const record = {
      id: updated.id,
      date: updated.date,
      machineId: updated.machineId,
      exchangeId: updated.exchangeId,
      exchangeRate: updated.exchangeRate,
      notes: updated.notes,
      // RecordList / summarize 互換フィールド (累計投資額)
      rotations: Math.max(0, totalRot),
      investment: Math.max(0, Math.round(cumInv)),
      // セッション詳細
      startRotations: updated.startRotations,
      startBalls: updated.startBalls,
      endRotations: updated.currentRotations,
      endBalls: updated.currentBalls,
      cumulativeRotations: updated.cumulativeRotations ?? 0,
      segmentStartRotations: updated.segmentStartRotations ?? updated.startRotations,
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
  // hitResumeRotInput: あたり→時短などを抜けて通常プレイに戻った時点の「機械表示」の値。
  // パチンコは大当りで機械表示がリセットされるのが一般的なので、通常は 0 近辺になる。
  const [hitResumeRotInput, setHitResumeRotInput] = useState('');
  const [hitBallsInput, setHitBallsInput] = useState('');
  const [hitAddInvInput, setHitAddInvInput] = useState('');

  useEffect(() => {
    if (session?.phase === 'hit-input') {
      setHitResumeRotInput('0');
      setHitBallsInput(String(session.currentBalls));
      setHitAddInvInput('');
    }
  }, [session?.phase]);

  // あたり画面のライブ計算プレビュー（再開後の状態をシミュレート）
  const hitLiveStats = useMemo(() => {
    if (!session || session.phase !== 'hit-input') return null;
    const resumeRot = numOr(hitResumeRotInput, 0);
    const newBalls = numOr(hitBallsInput, session.currentBalls);
    const addInv = numOr(hitAddInvInput, 0);
    const totalInv = session.totalInvestment + addInv;
    // このあたりまでのセグメント分(機械表示ベース)
    const { segmentStart, cumulative } = getSegState(session);
    const thisSegmentRot = Math.max(0, session.currentRotations - segmentStart);
    // あたり確定時点の累計回転数
    const newCumulative = cumulative + thisSegmentRot;
    // 累計投資: このあたりで増えた球分を含め、全あたりの払い出し球は差し引かない
    const thisHitGained = newBalls - session.currentBalls;
    const totalHitGained = sumHitBallsGained(session.hits) + thisHitGained;
    const cumInv = cumulativeInvestment(totalInv, session.startBalls, newBalls, totalHitGained);
    // 再開直後は新セグメント差分 0 なので累計 = newCumulative
    return {
      resumeRot,
      newBalls,
      thisSegmentRot,
      newCumulative,
      totalInv,
      cumInv,
      perK: calcPerK(newCumulative, cumInv),
      ballsGained: thisHitGained,
    };
  }, [session, hitResumeRotInput, hitBallsInput, hitAddInvInput]);

  const handleResume = () => {
    const resumeRot = numOr(hitResumeRotInput, 0);
    const newBalls = numOr(hitBallsInput, session.currentBalls);
    const addInv = numOr(hitAddInvInput, 0);
    const { segmentStart, cumulative } = getSegState(session);
    // このセグメントで回した分をあたり発生時点で確定して累計に加算
    const thisSegmentRot = Math.max(0, session.currentRotations - segmentStart);
    const newCumulative = cumulative + thisSegmentRot;
    // このあたり直前までに投入された現金のうち、まだどの hit にも紐付いていない分。
    // (= 直前のセグメント中に追加された現金。あたり後画面の追加投資 addInv とは別物)
    // これを当該 hit の addedInvestment に帰属させ、遊戯詳細で各セクションごとの現金投資が
    // 正しく表示されるようにする。
    const segmentInvestment = finalSegmentInvestment(session);
    const hit = {
      atMachineRot: session.currentRotations,
      atCumulative: newCumulative,
      resumeMachineRot: resumeRot,
      segmentRot: thisSegmentRot,
      ballsBefore: session.currentBalls,
      ballsAfter: newBalls,
      ballsGained: newBalls - session.currentBalls,
      addedInvestment: segmentInvestment + addInv,
      timestamp: new Date().toISOString(),
    };
    setSession({
      ...session,
      // 次セグメント: 機械表示は resumeRot から始まる
      currentRotations: resumeRot,
      segmentStartRotations: resumeRot,
      cumulativeRotations: newCumulative,
      currentBalls: newBalls,
      totalInvestment: session.totalInvestment + addInv,
      hits: [...session.hits, hit],
      phase: 'playing',
    });
    setHitResumeRotInput('');
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
            className="block w-full min-w-0 appearance-none px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">交換レート</label>
          <select
            value={startExchangeId}
            onChange={(e) => setStartExchangeId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
          >
            {EXCHANGE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}（1玉 {o.rate.toFixed(2)}円）
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">機種</label>
          <MachineSelector
            machines={machines}
            value={startMachineId}
            onChange={setStartMachineId}
            exchangeRate={(EXCHANGE_OPTIONS.find((o) => o.id === startExchangeId) || EXCHANGE_OPTIONS[0]).rate}
            placeholder="選択してください"
          />
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
    const { segmentStart: _segStart, cumulative: _cum } = getSegState(session);
    const thisSegmentRot = Math.max(0, atRot - _segStart);
    const preHitCumulative = _cum + thisSegmentRot;
    const stats = hitLiveStats;
    return (
      <div className="p-4 space-y-4">
        <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-800 rounded-lg p-3">
          <div className="text-sm text-slate-600 dark:text-slate-300">{session.date}</div>
          <div className="font-bold text-slate-900 dark:text-white">{machine?.name ?? '不明'}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs mt-1">
            <div className="text-slate-600 dark:text-slate-300">開始からの累計回転</div>
            <div className="text-right font-semibold text-slate-900 dark:text-white">{preHitCumulative.toLocaleString()} 回</div>
            <div className="text-slate-600 dark:text-slate-300">今回セグメントで回した</div>
            <div className="text-right font-semibold text-slate-900 dark:text-white">{thisSegmentRot.toLocaleString()} 回</div>
            <div className="text-slate-600 dark:text-slate-300">あたり時の機械表示</div>
            <div className="text-right font-semibold text-slate-900 dark:text-white">{atRot.toLocaleString()} 回</div>
            <div className="text-slate-600 dark:text-slate-300">あたり時の持ち玉</div>
            <div className="text-right font-semibold text-slate-900 dark:text-white">{atBalls.toLocaleString()} 個</div>
            <div className="text-slate-600 dark:text-slate-300">現金投資</div>
            <div className="text-right font-semibold text-slate-900 dark:text-white">¥{session.totalInvestment.toLocaleString()}</div>
            <div className="text-slate-600 dark:text-slate-300">今回までのあたり</div>
            <div className="text-right font-semibold text-slate-900 dark:text-white">{session.hits.length} 回</div>
          </div>
        </div>

        <h2 className="text-lg font-bold text-slate-900 dark:text-white">🎉 あたり後の入力</h2>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            再開時の機械表示（回転数）
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={hitResumeRotInput}
            onChange={(e) => setHitResumeRotInput(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
            placeholder="例: 0"
          />
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            ※ 大当り後は機械表示がリセットされます。通常プレイに戻った時点の機械の表示値を入力してください。
            <br />
            　時短で100回転消化して再開なら「100」、すぐ通常に戻ったなら「0」です。
          </div>
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
            現金投資: ¥{session.totalInvestment.toLocaleString()}
            {hitAddInvInput ? ` → ¥${(stats?.totalInv ?? session.totalInvestment).toLocaleString()}` : ''}
          </div>
        </div>

        {stats && (
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 space-y-1 text-sm">
            <div className="font-semibold text-slate-900 dark:text-white text-xs mb-1">再開後の状態（プレビュー）</div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">開始からの累計回転</span>
              <span className="font-semibold text-slate-900 dark:text-white">{stats.newCumulative.toLocaleString()} 回</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">現金投資</span>
              <span className="font-semibold text-slate-900 dark:text-white">¥{stats.totalInv.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">累計投資</span>
              <span className="font-semibold text-slate-900 dark:text-white">¥{Math.max(0, Math.round(stats.cumInv)).toLocaleString()}</span>
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
  const curRotLive = numOr(curRotInput, session.currentRotations);
  const dRot = totalDRot(session, curRotLive);
  const { segmentStart: segStartLive, cumulative: cumLive } = getSegState(session);
  const thisSegLive = Math.max(0, curRotLive - segStartLive);
  const totalInvDisplay = session.totalInvestment + numOr(addInvInput, 0);
  const curBalls = numOr(curBallsInput, session.currentBalls);
  const cumInv = cumulativeInvestment(totalInvDisplay, session.startBalls, curBalls, sumHitBallsGained(session.hits));
  const delta = livePerK - border;
  const hourlyEV = strictHourlyEV(session, curBalls, totalInvDisplay, Math.max(0, dRot), machine);
  const totalEV = strictTotalEV(session, curBalls, totalInvDisplay, Math.max(0, dRot), machine);

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
                🎉 あたり {session.hits.length}回 / 確定累計 {cumLive.toLocaleString()}回
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
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">現在の回転数（機械表示）</label>
        <input
          type="number"
          inputMode="numeric"
          value={curRotInput}
          onChange={(e) => setCurRotInput(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
        />
        {session.hits.length > 0 && (
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            現セグメント開始: {segStartLive.toLocaleString()}回 → 今のセグメント: {thisSegLive.toLocaleString()}回
          </div>
        )}
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
          現金投資: ¥{session.totalInvestment.toLocaleString()}
          {addInvInput ? ` → ¥${totalInvDisplay.toLocaleString()}` : ''}
        </div>
      </div>

      <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-3 space-y-1">
        <div className="text-sm flex justify-between">
          <span className="text-slate-600 dark:text-slate-300">開始からの累計回転</span>
          <span className="font-semibold text-slate-900 dark:text-white">{Math.max(0, dRot).toLocaleString()} 回</span>
        </div>
        <div className="text-sm flex justify-between">
          <span className="text-slate-600 dark:text-slate-300">現金投資</span>
          <span className="font-semibold text-slate-900 dark:text-white">¥{totalInvDisplay.toLocaleString()}</span>
        </div>
        <div className="text-sm flex justify-between">
          <span className="text-slate-600 dark:text-slate-300">累計投資</span>
          <span className="font-semibold text-slate-900 dark:text-white">¥{Math.max(0, Math.round(cumInv)).toLocaleString()}</span>
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
        <div className="text-sm flex justify-between">
          <span className="text-slate-600 dark:text-slate-300">現在の期待時給 <span className="text-xs text-slate-500">(200回転/h)</span></span>
          <span className={`font-semibold ${hourlyEV >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {hourlyEV >= 0 ? '+' : ''}¥{Math.round(hourlyEV).toLocaleString()}
          </span>
        </div>
        <div className="text-sm flex justify-between">
          <span className="text-slate-600 dark:text-slate-300">現在までの期待値</span>
          <span className={`font-semibold ${totalEV >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {totalEV >= 0 ? '+' : ''}¥{Math.round(totalEV).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
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

      <button
        onClick={() => (showDetail ? cancelDetail() : openDetail())}
        className={`w-full text-slate-800 dark:text-slate-100 py-2 rounded-lg font-medium text-sm transition ${
          // 詳細編集中はスクロールしても画面最上部に残るよう sticky 化。
          // sticky 時はページ背景 (slate-50/slate-900) と同色にして「画面最上部の背景色を変えない」。
          // ボタン認識用にボーダーを付与。
          showDetail
            ? 'sticky top-0 z-10 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600'
            : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600'
        }`}
      >
        {showDetail ? '▾ 遊戯詳細を閉じる' : '▸ 遊戯詳細を表示'}
      </button>

      {showDetail && detailDraft && (
        <>
          <SessionDetail
            session={detailDraft}
            machines={machines}
            onChange={(updated) => setDetailDraft(updated)}
            onDeleteHit={(idx) => {
              const newHits = (detailDraft.hits || []).filter((_, i) => i !== idx);
              setDetailDraft({ ...detailDraft, hits: newHits });
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={cancelDetail}
              className="bg-slate-300 dark:bg-slate-600 dark:text-white py-2 rounded-lg font-medium text-sm"
            >
              キャンセル
            </button>
            <button
              onClick={saveDetail}
              disabled={!isDetailDirty}
              className="bg-blue-600 text-white py-2 rounded-lg font-medium text-sm disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </>
      )}
    </div>
  );
}
