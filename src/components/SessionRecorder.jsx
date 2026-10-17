import { useState } from 'react';
import { Icon, PageHeader, NumberField, Notice, EmptyState } from './ui/Ui';
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

export default function SessionRecorder({ machines, onComplete, onManageMachines }) {
  const [session, setSession] = useLocalStorage('pachi-active-session', null);
  const [savedMessage, setSavedMessage] = useState('');
  const complete = record => {
    onComplete(record);
    setSession(null);
    setSavedMessage('遊技記録を履歴に保存しました。');
  };
  if (!session) return <StartForm machines={machines} onStart={value => { setSession(value); setSavedMessage(''); }} onManageMachines={onManageMachines} savedMessage={savedMessage} />;
  return <ActiveSession key={session.id} session={session} machines={machines} setSession={setSession} onComplete={complete} />;
}

function StartForm({ machines, onStart, onManageMachines, savedMessage }) {
  const selectable = machines.filter(m => !m.deleted);
  const [date, setDate] = useState(todayStr);
  const [exchangeId, setExchangeId] = useState(DEFAULT_EXCHANGE_ID);
  const [machineId, setMachineId] = useState(selectable[0]?.id || '');
  const [rotations, setRotations] = useState('0');
  const [balls, setBalls] = useState('0');
  const [notes, setNotes] = useState('');
  const selectedId = selectable.some(m => m.id === machineId) ? machineId : selectable[0]?.id || '';
  const exchange = EXCHANGE_OPTIONS.find(o => o.id === exchangeId) || EXCHANGE_OPTIONS[0];

  const start = e => {
    e.preventDefault();
    if (!selectedId || !date) return;
    const startRotations = Number(rotations);
    const startBalls = Number(balls);
    onStart({
      id: Date.now().toString(), date, machineId: selectedId,
      exchangeId: exchange.id, exchangeRate: exchange.rate, notes,
      startedAt: new Date().toISOString(), startRotations, startBalls,
      currentRotations: startRotations, currentBalls: startBalls,
      cumulativeRotations: 0, segmentStartRotations: startRotations,
      totalInvestment: 0, hits: [], snapshots: [], phase: 'playing',
    });
  };

  return <div className="page">
    <PageHeader eyebrow="PLAY RECORD" title="今日の記録をはじめる" description="台の表示と持ち玉から、かんたんに。" />
    <Notice>{savedMessage}</Notice>
    {!selectable.length ? <EmptyState title="まずは機種を登録" description="機種を追加すると、遊技の記録を始められます。" action={<button className="primary-button" onClick={onManageMachines}><Icon name="plus" />機種を追加</button>} /> :
      <form onSubmit={start}>
        <div className="surface stack">
          <div><label className="form-label">遊技する機種</label><MachineSelector machines={selectable} value={selectedId} onChange={setMachineId} exchangeRate={exchange.rate} /></div>
          <div className="form-grid">
            <label><span className="form-label">日付</span><input className="text-input" type="date" value={date} onChange={e => setDate(e.target.value)} required /></label>
            <label><span className="form-label">交換レート</span><select className="select-input" value={exchangeId} onChange={e => setExchangeId(e.target.value)}>{EXCHANGE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
          </div>
        </div>
        <h2 className="section-heading">開始時の数値</h2>
        <div className="stack">
          <NumberField label="台の表示回転数" value={rotations} onChange={setRotations} suffix="回" large />
          <NumberField label="持ち玉" value={balls} onChange={setBalls} suffix="玉" large />
        </div>
        <details className="disclosure"><summary>ホール・メモを追加</summary><div className="disclosure-content"><label><span className="form-label">メモ（任意）</span><input className="text-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="ホール名、台番号など" /></label></div></details>
        <div className="entry-actions record-actions"><button className="primary-button full-width" type="submit">遊技を開始<Icon name="arrow" size={18} /></button></div>
        <p className="small muted" style={{ textAlign: 'center', marginTop: 14 }}>進行中の記録は、この端末に保存されます。</p>
      </form>}
  </div>;
}

function ActiveSession({ session, machines, setSession, onComplete }) {
  const [showDetail, setShowDetail] = useState(false);
  const [detailDirty, setDetailDirty] = useState(false);
  const rawMachine = machines.find(m => m.id === session.machineId);
  const machine = rawMachine ? { ...rawMachine, exchangeRate: session.exchangeRate ?? rawMachine.exchangeRate } : null;
  if (showDetail) return <div className="page">
    <PageHeader title="進行中の記録を編集" back={() => {
      if (detailDirty && !confirm('保存していない変更を破棄しますか？')) return;
      setDetailDirty(false); setShowDetail(false);
    }} />
    <div className="detail-machine"><h2>{machine?.name || '削除済みの機種'}</h2><p>{session.date}・{session.exchangeId === '25' ? '25玉交換（等価）' : '28玉交換'}</p></div>
    <SessionDetail session={session} onChange={setSession} includeEndRow onDirtyChange={setDetailDirty} />
  </div>;
  if (session.phase === 'hit-input') return <HitForm key={session.hits?.length || 0} session={session} machine={machine} setSession={setSession} />;

  return <PlayingForm key={session.hits?.length || 0} session={session} machine={machine} setSession={setSession} onComplete={onComplete} onOpenDetail={() => setShowDetail(true)} />;
}

function MachineSummary({ session, machine }) {
  return <div className="surface machine-summary">
    <span className="machine-symbol"><Icon name="machine" size={23} /></span>
    <div className="machine-copy"><h2>{machine?.name || '削除済みの機種'}</h2><p>{session.date.replaceAll('-', '/')}・{session.exchangeId === '25' ? '25玉交換（等価）' : '28玉交換'}</p></div>
  </div>;
}

function PlayingForm({ session, machine, setSession, onComplete, onOpenDetail }) {
  const [rotations, setRotations] = useState(String(session.currentRotations ?? 0));
  const [balls, setBalls] = useState(String(session.currentBalls ?? 0));
  const [investment, setInvestment] = useState('');
  const [showInvestment, setShowInvestment] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const border = machine ? calcBorder(machine) : 0;
  const curRot = numOr(rotations, session.currentRotations);
  const curBalls = numOr(balls, session.currentBalls);
  const totalInv = session.totalInvestment + numOr(investment, 0);
  const dRot = totalDRot(session, curRot);
  const cumInv = cumulativeInvestment(totalInv, session.startBalls, curBalls, sumHitBallsGained(session.hits));
  const perK = calcPerK(dRot, cumInv);
  const hourlyEV = strictHourlyEV(session, curBalls, totalInv, dRot, machine);
  const totalEV = strictTotalEV(session, curBalls, totalInv, dRot, machine);
  const dirty = curRot !== session.currentRotations || curBalls !== session.currentBalls || numOr(investment, 0) > 0;
  const signedYen = value => `${value >= 0 ? '+' : '−'}¥${Math.abs(Math.round(value)).toLocaleString()}`;
  const updateInput = setter => value => { setter(value); setError(''); setNotice(''); };

  const committed = () => {
    if (rotations === '' || balls === '') { setError('回転数と持ち玉を入力してください。'); return null; }
    if (curRot < getSegState(session).segmentStart) { setError(`回転数は、この区間の開始値（${getSegState(session).segmentStart}回）以上で入力してください。当たり後のリセットは「当たりを記録」から入力できます。`); return null; }
    return { ...session, currentRotations: curRot, currentBalls: curBalls, totalInvestment: totalInv, lastRecordedAt: new Date().toISOString() };
  };
  const save = e => {
    e.preventDefault();
    const next = committed();
    if (!next) return;
    setSession(next);
    setInvestment('');
    setNotice('記録を更新しました。');
  };
  const hit = () => {
    const next = committed();
    if (next) setSession({ ...next, phase: 'hit-input' });
  };
  const end = () => {
    const updated = committed();
    if (!updated || !confirm('遊技を終了して履歴に保存しますか？')) return;
    const now = new Date().toISOString();
    onComplete({
      id: updated.id, date: updated.date, machineId: updated.machineId,
      exchangeId: updated.exchangeId, exchangeRate: updated.exchangeRate, notes: updated.notes,
      rotations: totalDRot(updated, updated.currentRotations),
      investment: Math.max(0, Math.round(cumulativeInvestment(updated.totalInvestment, updated.startBalls, updated.currentBalls, sumHitBallsGained(updated.hits)))),
      startRotations: updated.startRotations, startBalls: updated.startBalls,
      endRotations: updated.currentRotations, endBalls: updated.currentBalls,
      cumulativeRotations: updated.cumulativeRotations, segmentStartRotations: updated.segmentStartRotations,
      totalInvestment: updated.totalInvestment, hits: updated.hits, snapshots: updated.snapshots || [],
      startedAt: updated.startedAt, endedAt: now, createdAt: now, isSession: true,
    });
  };
  const openDetail = () => {
    if (dirty && !confirm('入力中の数値を保存せずに、記録の編集へ移動しますか？')) return;
    onOpenDetail();
  };

  return <div className="page">
    <PageHeader eyebrow="PLAY RECORD" title="遊技記録" actions={<><span className="status-pill">記録中</span><details className="more-menu"><summary className="icon-button" aria-label="遊技のメニュー"><Icon name="more" /></summary><div className="more-menu-popover"><button type="button" onClick={() => { if (confirm('進行中の遊技を破棄しますか？履歴には保存されません。')) setSession(null); }}>この遊技を破棄</button></div></details></>} />
    <MachineSummary session={session} machine={machine} />
    <form onSubmit={save}>
      <div className="section-heading-row"><h2 className="section-heading">いまの数値を入力</h2>{dirty && <span className="small muted">未保存</span>}</div>
      <div className="stack">
        <NumberField label="台の表示回転数" value={rotations} onChange={updateInput(setRotations)} suffix="回" large />
        <NumberField label="持ち玉" value={balls} onChange={updateInput(setBalls)} suffix="玉" large />
      </div>
      <h2 className="section-heading">追加投資<span className="optional-label">任意</span></h2>
      <div className="investment-chips">{[1000, 5000].map(n => <button type="button" key={n} onClick={() => { setInvestment(String(numOr(investment, 0) + n)); setNotice(''); setError(''); }}>+{n.toLocaleString()}円</button>)}<button type="button" aria-expanded={showInvestment} onClick={() => setShowInvestment(value => !value)}>金額入力</button></div>
      {(showInvestment || investment !== '') && <NumberField label="今回追加する金額" value={investment} onChange={updateInput(setInvestment)} suffix="円" required={false} />}
      <div className="surface" style={{ marginTop: 20 }}>
        <div className="metrics-grid">
          <div className="metric"><div className="metric-label">現金投資</div><div className="metric-value">¥{totalInv.toLocaleString()}</div></div>
          <div className="metric"><div className="metric-label">回転率</div><div className="metric-value">{perK > 0 ? perK.toFixed(1) : '—'}<small>回/1K</small></div></div>
        </div>
        <p className="metric-footnote">{dirty ? '入力中の数値で集計しています' : session.lastRecordedAt ? `最終記録 ${new Date(session.lastRecordedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}` : '開始時の数値を記録しました'}</p>
      </div>
      <div className="entry-actions record-actions">
        <Notice error>{error}</Notice><Notice>{notice}</Notice>
        <button type="submit" className="primary-button full-width"><Icon name="check" size={18} />記録を更新</button>
        <button type="button" onClick={hit} className="secondary-button full-width"><Icon name="target" size={18} />当たりを記録</button>
      </div>
    </form>
    <details className="disclosure"><summary>回転数・期待値を詳しく見る</summary><div className="surface disclosure-content">
      <dl className="stats-list">
        <div><dt>累計回転数</dt><dd>{dRot.toLocaleString()} 回</dd></div>
        <div><dt>当たり回数</dt><dd>{(session.hits || []).length} 回</dd></div>
        <div><dt>累計投資（持ち玉を含む）</dt><dd>¥{Math.max(0, Math.round(cumInv)).toLocaleString()}</dd></div>
        <div><dt>ボーダー</dt><dd>{border.toFixed(2)} 回/1K</dd></div>
        <div><dt>ボーダーとの差</dt><dd className={perK >= border ? 'positive' : 'negative'}>{perK >= border ? '+' : ''}{(perK - border).toFixed(2)} 回</dd></div>
        <div><dt>累計期待値</dt><dd className={totalEV >= 0 ? 'positive' : 'negative'}>{signedYen(totalEV)}</dd></div>
        <div><dt>期待時給（200回転/h）</dt><dd className={hourlyEV >= 0 ? 'positive' : 'negative'}>{signedYen(hourlyEV)}</dd></div>
      </dl>
    </div></details>
    <button type="button" className="quiet-button full-width" onClick={openDetail}><Icon name="edit" size={17} />開始・当たりの記録を編集</button>
    <button type="button" className="quiet-button full-width" onClick={end}><Icon name="flag" size={17} />遊技を終了して保存</button>
  </div>;
}

function HitForm({ session, machine, setSession }) {
  const [resume, setResume] = useState('0');
  const [balls, setBalls] = useState(String(session.currentBalls));
  const [investment, setInvestment] = useState('');
  const border = machine ? calcBorder(machine) : 0;
  const { segmentStart, cumulative } = getSegState(session);
  const segmentRot = Math.max(0, session.currentRotations - segmentStart);
  const newCumulative = cumulative + segmentRot;
  const gained = numOr(balls, session.currentBalls) - session.currentBalls;
  const totalInv = session.totalInvestment + numOr(investment, 0);
  const cumInv = cumulativeInvestment(totalInv, session.startBalls, numOr(balls, session.currentBalls), sumHitBallsGained(session.hits) + gained);
  const perK = calcPerK(newCumulative, cumInv);
  const submit = e => {
    e.preventDefault();
    const resumeRot = Number(resume);
    const newBalls = Number(balls);
    const addInv = numOr(investment, 0);
    const hit = {
      atMachineRot: session.currentRotations, atCumulative: newCumulative,
      resumeMachineRot: resumeRot, segmentRot, ballsBefore: session.currentBalls,
      ballsAfter: newBalls, ballsGained: newBalls - session.currentBalls,
      addedInvestment: finalSegmentInvestment(session) + addInv, timestamp: new Date().toISOString(),
    };
    setSession({ ...session, currentRotations: resumeRot, currentBalls: newBalls,
      segmentStartRotations: resumeRot, cumulativeRotations: newCumulative,
      totalInvestment: totalInv, hits: [...(session.hits || []), hit],
      lastRecordedAt: new Date().toISOString(), phase: 'playing' });
  };
  return <div className="page">
    <PageHeader eyebrow="HIT RECORD" title="当たり後の数値を入力" description="通常の遊技に戻った時点で記録します。" />
    <MachineSummary session={session} machine={machine} />
    <div className="surface" style={{ marginTop: 16 }}><dl className="stats-list"><div><dt>当たり時の台の表示</dt><dd>{session.currentRotations.toLocaleString()} 回</dd></div><div><dt>当たり前の持ち玉</dt><dd>{session.currentBalls.toLocaleString()} 玉</dd></div></dl></div>
    <form onSubmit={submit}>
      <h2 className="section-heading">再開時の状態</h2>
      <div className="stack">
        <NumberField label="再開時の台の表示回転数" value={resume} onChange={setResume} suffix="回" large hint="時短で100回転なら「100」、すぐ通常に戻ったら「0」。" />
        <NumberField label="当たり後の持ち玉" value={balls} onChange={setBalls} suffix="玉" large hint={`当たり前から ${gained >= 0 ? '+' : ''}${gained.toLocaleString()}玉`} />
        <NumberField label="当たり中の追加投資（任意）" value={investment} onChange={setInvestment} suffix="円" required={false} />
      </div>
      <details className="disclosure"><summary>再開後の集計を見る</summary><div className="surface disclosure-content"><dl className="stats-list">
        <div><dt>累計回転数</dt><dd>{newCumulative.toLocaleString()} 回</dd></div><div><dt>現金投資</dt><dd>¥{totalInv.toLocaleString()}</dd></div>
        <div><dt>回転率 / ボーダー</dt><dd>{perK.toFixed(1)} / {border.toFixed(1)} 回</dd></div>
      </dl></div></details>
      <div className="entry-actions record-actions"><button type="submit" className="primary-button full-width"><Icon name="check" size={18} />当たりを保存して再開</button>
        <button type="button" className="quiet-button" onClick={() => { if (confirm('当たり後の入力を取り消して戻りますか？')) setSession({ ...session, phase: 'playing' }); }}>当たりの入力をやめる</button>
      </div>
    </form>
  </div>;
}
