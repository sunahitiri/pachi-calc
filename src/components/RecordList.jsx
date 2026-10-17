import { useMemo, useState } from 'react';
import { calcExpectedValue, calcSessionExpectedValue, rotationsPer1K } from '../utils/calculations';
import SessionDetail from './SessionDetail';
import MachineSelector from './MachineSelector';
import { Icon, PageHeader, NumberField, Notice, EmptyState } from './ui/Ui';

function signedYen(value) {
  return `${value >= 0 ? '+' : '−'}¥${Math.abs(Math.round(value)).toLocaleString()}`;
}
function monthOfToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function dateLabel(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
}
function shiftMonth(month, amount) {
  const [year, m] = month.split('-').map(Number);
  const next = new Date(year, m - 1 + amount, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}
function recordStats(record, machine) {
  const cash = Number(record.totalInvestment ?? record.investment) || 0;
  const rate = record.exchangeRate ?? machine?.exchangeRate ?? 4;
  const startBalls = Number(record.startBalls) || 0;
  const endBalls = Number(record.endBalls) || 0;
  const payout = (record.hits || []).reduce((sum, hit) => sum + (Number(hit.ballsGained) || 0), 0);
  const effectiveInvestment = record.isSession ? Math.max(0, cash + (startBalls + payout - endBalls) * 4) : cash;
  return {
    cash,
    profit: record.isSession ? (endBalls - startBalls) * rate - cash : null,
    ev: !machine ? 0 : record.isSession ? calcSessionExpectedValue(record, machine) : calcExpectedValue({ totalRotations: record.rotations, investment: record.investment, machine }),
    perK: rotationsPer1K(record.rotations, effectiveInvestment),
  };
}

function RecordCard({ record, machine, onOpen }) {
  const stats = recordStats(record, machine);
  const amount = stats.profit ?? stats.ev;
  return <article className="surface record-card">
    <div className="record-card-top">
      <div className="record-card-title"><h3>{machine?.name || '削除済みの機種'}</h3><p className="record-card-subtitle">{record.exchangeId === '25' ? '25玉交換（等価）' : record.exchangeId === '28' ? '28玉交換' : '遊技記録'}{record.notes ? `・${record.notes}` : ''}</p></div>
      <div className={`record-card-amount ${amount >= 0 ? 'positive' : 'negative'}`}><small>{stats.profit === null ? '期待値' : '収支'}</small>{signedYen(amount)}</div>
    </div>
    <div className="record-card-stats"><div><span>現金投資</span><strong>¥{stats.cash.toLocaleString()}</strong></div><div><span>回転率</span><strong>{stats.perK > 0 ? stats.perK.toFixed(1) : '—'} <span style={{ display: 'inline', fontSize: 10 }}>回/1K</span></strong></div></div>
    <button type="button" className="secondary-button card-edit-button" onClick={onOpen}><Icon name="edit" size={17} />記録の詳細・編集</button>
  </article>;
}

export default function RecordList({ records, machines, onDelete, onUpdate, onNewRecord }) {
  const machineMap = useMemo(() => Object.fromEntries(machines.map(machine => [machine.id, machine])), [machines]);
  const [editingId, setEditingId] = useState(null);
  const [monthChoice, setMonthChoice] = useState('');
  const [view, setView] = useState('list');
  const [query, setQuery] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [message, setMessage] = useState('');
  const latestMonth = records.reduce((latest, record) => record.date?.slice(0, 7) > latest ? record.date.slice(0, 7) : latest, '');
  const month = monthChoice || latestMonth || monthOfToday();
  const monthOptions = [...new Set([month, monthOfToday(), ...records.map(record => record.date?.slice(0, 7)).filter(Boolean)])].sort().reverse();
  const monthRecords = records.filter(record => record.date?.startsWith(month));
  const summary = monthRecords.reduce((result, record) => {
    const stats = recordStats(record, machineMap[record.machineId]);
    return { profit: result.profit + (stats.profit || 0), ev: result.ev + stats.ev, cash: result.cash + stats.cash };
  }, { profit: 0, ev: 0, cash: 0 });
  const daysCount = new Set(monthRecords.map(record => record.date)).size;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = monthRecords.filter(record => !normalizedQuery || `${machineMap[record.machineId]?.name || ''} ${record.notes || ''} ${record.date}`.toLocaleLowerCase().includes(normalizedQuery));
  const groups = [...new Set(filtered.map(record => record.date))].sort().reverse().map(date => ({
    date,
    records: filtered.filter(record => record.date === date).sort((a, b) => (b.createdAt || b.startedAt || '').localeCompare(a.createdAt || a.startedAt || '')),
  }));
  const shownGroups = view === 'calendar' && selectedDay ? groups.filter(group => group.date === selectedDay) : groups;
  const changeMonth = value => { setMonthChoice(value); setSelectedDay(''); };
  const editingRecord = records.find(record => record.id === editingId);

  if (editingRecord) return <RecordDetail key={editingId} record={editingRecord} machines={machines} machine={machineMap[editingRecord.machineId]} onUpdate={onUpdate} onBack={() => setEditingId(null)} onDelete={() => { onDelete(editingId); setEditingId(null); setMessage('記録を削除しました。'); }} />;

  return <div className="page">
    <PageHeader eyebrow="YOUR NOTEBOOK" title="記録ノート" description="日々の記録を、見つけやすく、直しやすく。" />
    <Notice>{message}</Notice>
    <div className="surface month-summary">
      <div className="month-control">
        <label><span className="sr-only">表示する月</span><select aria-label="表示する月" value={month} onChange={e => changeMonth(e.target.value)}>{monthOptions.map(value => <option key={value} value={value}>{Number(value.slice(0, 4))}年{Number(value.slice(5))}月</option>)}</select><Icon name="next" size={16} /></label>
        <button type="button" className="icon-button" aria-label="前の月" onClick={() => changeMonth(shiftMonth(month, -1))}><Icon name="back" size={18} /></button>
        <button type="button" className="icon-button" aria-label="次の月" onClick={() => changeMonth(shiftMonth(month, 1))}><Icon name="next" size={18} /></button>
      </div>
      <div className="metrics-grid">
        <div className="metric"><div className="metric-label">今月の収支</div><div className={`metric-value ${summary.profit >= 0 ? 'positive' : 'negative'}`}>{signedYen(summary.profit)}</div></div>
        <div className="metric"><div className="metric-label">記録した日</div><div className="metric-value">{daysCount}<small>日 / {monthRecords.length}件</small></div></div>
      </div>
      <div className="month-substats"><span>現金投資 ¥{summary.cash.toLocaleString()}</span><span>期待値 {signedYen(summary.ev)}</span></div>
    </div>
    <label className="search-field"><Icon name="search" size={18} /><input aria-label="この月の記録を検索" type="search" value={query} onChange={e => { setQuery(e.target.value); setSelectedDay(''); }} placeholder="この月の機種・メモを検索" />{query && <button type="button" className="icon-button" aria-label="検索をクリア" onClick={() => setQuery('')}><Icon name="close" size={16} /></button>}</label>
    <div className="segmented-control" aria-label="履歴の表示方法"><button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}><Icon name="list" size={17} />一覧</button><button type="button" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}><Icon name="calendar" size={17} />カレンダー</button></div>
    {view === 'calendar' && <Calendar month={month} groups={groups} machineMap={machineMap} selectedDay={selectedDay} onSelect={setSelectedDay} />}
    {selectedDay && view === 'calendar' && <button type="button" className="quiet-button full-width" onClick={() => setSelectedDay('')}>日付の選択を解除</button>}
    {!records.length ? <EmptyState title="最初の記録を残しましょう" description="遊技を終了して保存すると、ここに履歴が並びます。" /> : shownGroups.length === 0 ? <EmptyState title="記録が見つかりません" description={query ? '検索する言葉や表示する月を変えてみてください。' : 'この期間の記録はまだありません。'} /> :
      shownGroups.map(group => <section className="date-group" key={group.date}><div className="date-group-title"><h2>{dateLabel(group.date)}</h2><span>{group.records.length}件の記録</span></div>{group.records.map(record => <RecordCard key={record.id} record={record} machine={machineMap[record.machineId]} onOpen={() => setEditingId(record.id)} />)}</section>)}
    <div className="list-footer"><button type="button" className="primary-button full-width" onClick={onNewRecord}><Icon name="plus" size={18} />新しい記録</button></div>
  </div>;
}

function Calendar({ month, groups, machineMap, selectedDay, onSelect }) {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const days = new Date(year, monthNumber, 0).getDate();
  return <div className="surface calendar"><div className="calendar-grid">
    {['日', '月', '火', '水', '木', '金', '土'].map(day => <span className="calendar-weekday" key={day}>{day}</span>)}
    {Array.from({ length: firstDay }, (_, i) => <span key={`blank-${i}`} />)}
    {Array.from({ length: days }, (_, index) => {
      const day = index + 1;
      const date = `${month}-${String(day).padStart(2, '0')}`;
      const group = groups.find(item => item.date === date);
      const profit = group?.records.reduce((sum, record) => sum + (recordStats(record, machineMap[record.machineId]).profit || 0), 0) || 0;
      return <button key={day} type="button" disabled={!group} aria-label={`${day}日${group ? `、${group.records.length}件の記録` : '、記録なし'}`} aria-pressed={selectedDay === date} className={`calendar-day ${group ? 'has-record' : ''}`} onClick={() => onSelect(selectedDay === date ? '' : date)}>{day}<span className={`calendar-dot ${profit < 0 ? 'negative' : ''}`} style={{ visibility: group ? 'visible' : 'hidden' }} /></button>;
    })}
  </div></div>;
}

function RecordDetail({ record, machine, machines, onUpdate, onBack, onDelete }) {
  const [view, setView] = useState(record.isSession ? 'details' : 'overview');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const stats = recordStats(record, machine);
  const leave = callback => {
    if (pending && !confirm('保存していない変更を破棄しますか？')) return;
    setPending(false); callback();
  };
  return <div className="page">
    <PageHeader title={`${dateLabel(record.date)}の記録`} back={() => leave(onBack)} actions={<details className="more-menu"><summary className="icon-button" aria-label="記録のメニュー"><Icon name="more" /></summary><div className="more-menu-popover"><button type="button" onClick={() => { if (confirm('この遊技記録を削除しますか？元に戻せません。')) onDelete(); }}>この記録を削除</button></div></details>} />
    <div className="detail-machine"><h2>{machine?.name || '削除済みの機種'}</h2><p>{record.exchangeId === '25' ? '25玉交換（等価）' : record.exchangeId === '28' ? '28玉交換' : '遊技記録'}{record.notes ? `・${record.notes}` : ''}</p></div>
    <Notice>{notice}</Notice>
    {record.isSession && <div className="segmented-control detail-tabs"><button type="button" aria-pressed={view === 'overview'} onClick={() => { if (view !== 'overview') leave(() => setView('overview')); }}>概要・メモ</button><button type="button" aria-pressed={view === 'details'} onClick={() => { if (view !== 'details') leave(() => setView('details')); }}>記録の詳細</button></div>}
    {view === 'details' ? <SessionDetail session={record} includeEndRow onChange={onUpdate} onDirtyChange={setPending} /> : <>
      <div className="surface" style={{ marginBottom: 20 }}><dl className="stats-list">
        <div><dt>収支</dt><dd className={(stats.profit || 0) >= 0 ? 'positive' : 'negative'}>{stats.profit === null ? '—' : signedYen(stats.profit)}</dd></div>
        <div><dt>現金投資</dt><dd>¥{stats.cash.toLocaleString()}</dd></div>
        <div><dt>累計回転数</dt><dd>{(Number(record.rotations) || 0).toLocaleString()} 回</dd></div>
        <div><dt>回転率</dt><dd>{stats.perK.toFixed(1)} 回/1K</dd></div>
        <div><dt>期待値</dt><dd className={stats.ev >= 0 ? 'positive' : 'negative'}>{signedYen(stats.ev)}</dd></div>
      </dl></div>
      <RecordMetaForm record={record} machines={machines} onDirtyChange={setPending} onSave={updated => { onUpdate(updated); setPending(false); setNotice('記録の基本情報を保存しました。'); }} />
    </>}
  </div>;
}

function RecordMetaForm({ record, machines, onDirtyChange, onSave }) {
  const [values, setValues] = useState(() => ({
    date: record.date, machineId: record.machineId, notes: record.notes || '',
    exchangeId: record.exchangeId || ((record.exchangeRate ?? 4) === 4 ? '25' : (record.exchangeRate === 100 / 28 ? '28' : 'custom')),
    rotations: String(record.rotations ?? 0), investment: String(record.investment ?? 0),
  }));
  const [initial, setInitial] = useState(values);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const update = (key, value) => {
    const next = { ...values, [key]: value };
    setValues(next); onDirtyChange(JSON.stringify(next) !== JSON.stringify(initial));
  };
  const exchangeRate = values.exchangeId === '25' ? 4 : values.exchangeId === '28' ? 100 / 28 : record.exchangeRate ?? 4;
  const selectable = machines.filter(machine => !machine.deleted || machine.id === record.machineId);
  const save = e => {
    e.preventDefault();
    onSave({
      ...record, date: values.date, machineId: values.machineId, notes: values.notes,
      exchangeId: values.exchangeId, exchangeRate,
      ...(!record.isSession ? { rotations: Number(values.rotations), investment: Number(values.investment) } : {}),
    });
    setInitial(values);
  };
  return <form onSubmit={save}>
    <h2 className="section-heading">基本情報を編集</h2>
    <div className="surface stack">
      <label><span className="form-label">日付</span><input type="date" className="text-input" required value={values.date} onChange={e => update('date', e.target.value)} /></label>
      <div><label className="form-label">機種</label><MachineSelector machines={selectable} value={values.machineId} onChange={value => update('machineId', value)} exchangeRate={exchangeRate} /></div>
      <label><span className="form-label">交換レート</span><select className="select-input" value={values.exchangeId} onChange={e => update('exchangeId', e.target.value)}><option value="28">28玉交換</option><option value="25">25玉交換（等価）</option>{values.exchangeId === 'custom' && <option value="custom">保存時のレート</option>}</select></label>
      <label><span className="form-label">メモ（任意）</span><textarea className="text-input" value={values.notes} onChange={e => update('notes', e.target.value)} placeholder="ホール名、台番号など" /></label>
      {!record.isSession && <><NumberField label="総回転数" suffix="回" value={values.rotations} onChange={value => update('rotations', value)} /><NumberField label="現金投資" suffix="円" value={values.investment} onChange={value => update('investment', value)} /></>}
    </div>
    <div className="sticky-actions"><button type="submit" className="primary-button full-width" disabled={!dirty}>変更を保存</button><button type="button" className="quiet-button full-width" disabled={!dirty} onClick={() => { setValues(initial); onDirtyChange(false); }}>変更を取り消す</button></div>
  </form>;
}
