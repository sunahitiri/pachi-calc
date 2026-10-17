import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { calcExpectedValue, calcSessionExpectedValue } from '../utils/calculations';
import { EmptyState, Icon } from './ui/Ui';

const PROFIT_COLOR = '#65dbc7';
const EV_COLOR = '#f3cb78';

function recordProfit(record, machineMap) {
  if (!record.isSession) return 0;
  const rate = record.exchangeRate ?? machineMap[record.machineId]?.exchangeRate ?? 4;
  const cash = Number(record.totalInvestment ?? record.investment) || 0;
  return ((Number(record.endBalls) || 0) - (Number(record.startBalls) || 0)) * rate - cash;
}

function recordEV(record, machineMap) {
  const machine = machineMap[record.machineId];
  if (!machine) return 0;
  return record.isSession
    ? calcSessionExpectedValue(record, machine)
    : calcExpectedValue({ totalRotations: record.rotations, investment: record.investment, machine });
}

function signedYen(value) {
  const rounded = Math.round(value);
  return `${rounded < 0 ? '−' : '+'}¥${Math.abs(rounded).toLocaleString('ja-JP')}`;
}

function defaultMonth(records) {
  const latest = records.reduce((value, record) => /^\d{4}-\d{2}-\d{2}$/.test(record.date || '') && record.date > value ? record.date : value, '');
  if (latest) return latest.slice(0, 7);
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month, amount) {
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + number - 1 + amount;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`;
}

function makeScale(series) {
  const values = [0, ...series.flatMap(day => [day.profit, day.ev])];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1000; max += 1000; }
  const padding = Math.max(200, (max - min) * 0.1);
  const roughStep = (max - min + 2 * padding) / 4;
  const power = 10 ** Math.floor(Math.log10(roughStep));
  const base = roughStep / power;
  const step = (base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10) * power;
  const low = Math.floor((min - padding) / step) * step;
  const high = Math.ceil((max + padding) / step) * step;
  const ticks = Array.from({ length: Math.round((high - low) / step) + 1 }, (_, i) => low + i * step);
  const format = value => {
    const absolute = Number((Math.abs(value) / 10000).toFixed(4));
    return `${value < 0 ? '−' : ''}${absolute.toLocaleString('ja-JP', { maximumFractionDigits: 4 })}`;
  };
  return { min: low, max: high, ticks, format };
}

function CumulativeGraph({ series, selectedDay, onSelect, visible }) {
  const containerRef = useRef(null);
  const gestureRef = useRef(null);
  const [width, setWidth] = useState(320);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale = useMemo(() => makeScale(series), [series]);
  const height = 320;
  const left = Math.max(42, ...scale.ticks.map(value => scale.format(value).length * 7.5 + 12));
  const right = width - 14;
  const top = 28;
  const bottom = height - 46;
  const last = series[series.length - 1];
  const plotWidth = Math.max(1, right - left);
  const xAt = day => left + day / last.day * plotWidth;
  const yAt = value => top + (scale.max - value) / (scale.max - scale.min) * (bottom - top);
  const selected = series.find(day => day.day === selectedDay) || last;
  const tickDays = [...new Set([0, Math.round(last.day / 3), Math.round(last.day * 2 / 3), last.day])];
  const selectAt = (element, clientX) => {
    const box = element.getBoundingClientRect();
    const x = (clientX - box.left) / box.width * width;
    const day = Math.max(1, Math.min(last.day, Math.round((x - left) / plotWidth * last.day)));
    onSelect(day);
  };
  const handleMove = event => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
      gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (gesture.axis === 'x') selectAt(event.currentTarget, event.clientX);
  };
  const handleUp = event => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture || gesture.id !== event.pointerId || gesture.axis === 'y') return;
    selectAt(event.currentTarget, event.clientX);
  };

  return <div className="trend-graph" ref={containerRef}>
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="trend-svg" role="img" aria-labelledby={`${titleId} ${descriptionId}`}
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        gestureRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={handleMove} onPointerUp={handleUp} onPointerCancel={() => { gestureRef.current = null; }}>
      <title id={titleId}>月初からの累計収支と累計期待値</title>
      <desc id={descriptionId}>縦軸は万円、横軸は日付。収支はミントの実線、期待値は黄色の破線。最終記録日までを表示します。選択中は{selected.day}日、累計収支{signedYen(selected.profit)}、累計期待値{signedYen(selected.ev)}です。下の日付選択からも金額を確認できます。</desc>
      <text x="0" y="13" className="trend-axis-title">累計（万円）</text>
      {scale.ticks.map(value => <g key={value}>
        <line x1={left} x2={right} y1={yAt(value)} y2={yAt(value)} className={value === 0 ? 'trend-zero-line' : 'trend-grid-line'} />
        <text x={left - 10} y={yAt(value) + 4} textAnchor="end" className={value === 0 ? 'trend-zero-label' : undefined}>{scale.format(value)}</text>
      </g>)}
      <line x1={xAt(selected.day)} x2={xAt(selected.day)} y1={top} y2={bottom} className="trend-selection-line" />
      {['ev', 'profit'].filter(name => visible[name]).map(name => <g key={name}>
        <path d={series.map((day, i) => `${i === 0 ? 'M' : 'L'} ${xAt(day.day)} ${yAt(day[name])}`).join(' ')} fill="none" stroke={name === 'profit' ? PROFIT_COLOR : EV_COLOR} strokeWidth="3.2" strokeDasharray={name === 'ev' ? '7 5' : undefined} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={xAt(selected.day)} cy={yAt(selected[name])} r="5" fill={name === 'profit' ? PROFIT_COLOR : EV_COLOR} stroke="var(--surface)" strokeWidth="2" />
      </g>)}
      {tickDays.map((day, index) => <text key={day} x={xAt(day)} y={bottom + 22} textAnchor={index === 0 ? 'start' : index === tickDays.length - 1 ? 'end' : 'middle'}>{day === 0 ? '月初' : `${day}日`}</text>)}
      <text x={right} y={height - 3} textAnchor="end" className="trend-axis-title">日付（日）</text>
    </svg>
  </div>;
}

export default function ProfitChart({ records, machines }) {
  const dateControlId = useId();
  const machineMap = useMemo(() => Object.fromEntries(machines.map(machine => [machine.id, machine])), [machines]);
  const [monthChoice, setMonthChoice] = useState(null);
  const [selection, setSelection] = useState(null);
  const [visible, setVisible] = useState({ profit: true, ev: true });
  const month = monthChoice || defaultMonth(records);
  const [year, monthNumber] = month.split('-').map(Number);
  const lastCalendarDay = new Date(year, monthNumber, 0).getDate();
  const months = [...new Set([month, defaultMonth([]), ...records.filter(record => /^\d{4}-\d{2}-\d{2}$/.test(record.date || '')).map(record => record.date.slice(0, 7))])].sort().reverse();
  const { series, recordedDays, count } = useMemo(() => {
    const days = new Map();
    let count = 0;
    for (const record of records) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date || '') || !record.date.startsWith(month)) continue;
      const day = Number(record.date.slice(8, 10));
      if (day < 1 || day > lastCalendarDay) continue;
      const item = days.get(day) || { profitDaily: 0, evDaily: 0, count: 0 };
      item.profitDaily += recordProfit(record, machineMap);
      item.evDaily += recordEV(record, machineMap);
      item.count += 1;
      count += 1;
      days.set(day, item);
    }
    const endDay = days.size ? Math.max(...days.keys()) : 0;
    let profit = 0, ev = 0;
    const series = [{ day: 0, profit: 0, ev: 0, profitDaily: 0, evDaily: 0, count: 0 }];
    for (let day = 1; day <= endDay; day++) {
      const item = days.get(day) || { profitDaily: 0, evDaily: 0, count: 0 };
      profit += item.profitDaily; ev += item.evDaily;
      series.push({ day, ...item, profit, ev });
    }
    return { series, recordedDays: series.filter(day => day.count > 0), count };
  }, [records, machineMap, month, lastCalendarDay]);
  const last = series[series.length - 1];
  const hasData = count > 0;
  const selected = series.find(day => day.day === (selection?.month === month ? selection.day : last.day)) || last;
  const selectDay = day => setSelection({ month, day });
  const changeMonth = value => { setMonthChoice(value); setSelection(null); };
  const dateOptions = series.filter(day => day.count > 0 || day.day === selected.day).filter(day => day.day > 0);
  const previous = [...recordedDays].reverse().find(day => day.day < selected.day);
  const next = recordedDays.find(day => day.day > selected.day);
  const toggle = name => setVisible(current => ({ ...current, [name]: !current[name] }));

  return <div className="trend-page">
    <div className="trend-month-nav">
      <label><span className="sr-only">表示する月</span><select value={month} aria-label="チャートの表示月" onChange={event => changeMonth(event.target.value)}>{months.map(value => <option key={value} value={value}>{Number(value.slice(0, 4))}年{Number(value.slice(5))}月</option>)}</select></label>
      <button type="button" className="icon-button" aria-label="前月" disabled={month === '0001-01'} onClick={() => changeMonth(shiftMonth(month, -1))}><Icon name="back" size={18} /></button>
      <button type="button" className="icon-button" aria-label="翌月" disabled={month === '9999-12'} onClick={() => changeMonth(shiftMonth(month, 1))}><Icon name="next" size={18} /></button>
    </div>
    <div className="trend-totals">
      <div><span>月内収支</span><strong className={last.profit < 0 ? 'negative' : undefined}>{signedYen(last.profit)}</strong></div>
      <div><span>月内期待値</span><strong className={last.ev < 0 ? 'negative' : undefined}>{signedYen(last.ev)}</strong></div>
    </div>
    {!hasData ? <EmptyState title="この月の記録はありません" description="遊技記録を保存すると、月初からの推移が表示されます。" /> : <>
      <section className="trend-card" aria-label="累計のグラフ">
        <div className="trend-card-heading"><h2>月初からの推移</h2><span>{monthNumber}/{last.day}まで</span></div>
        <div className="trend-legend" aria-label="グラフに表示する系列">
          <button type="button" aria-pressed={visible.profit} disabled={visible.profit && !visible.ev} onClick={() => toggle('profit')}><span className="trend-swatch" />収支</button>
          <button type="button" aria-pressed={visible.ev} disabled={visible.ev && !visible.profit} onClick={() => toggle('ev')}><span className="trend-swatch trend-swatch-ev" />期待値</button>
        </div>
        <CumulativeGraph series={series} selectedDay={selected.day} onSelect={selectDay} visible={visible} />
        <p className="trend-chart-hint">グラフをタップすると、その日の金額を表示</p>
      </section>
      <section className="trend-detail" aria-label="選択日の金額" aria-live="polite" aria-atomic="true">
        <div className="trend-detail-heading"><h3>{monthNumber}月{selected.day}日</h3><span>{selected.count ? `${selected.count}件の記録` : 'この日の記録なし'}</span></div>
        <dl className="trend-detail-values">
          {visible.profit && <div><dt>累計収支</dt><dd className={selected.profit < 0 ? 'negative' : undefined}>{signedYen(selected.profit)}</dd></div>}
          {visible.ev && <div><dt>累計期待値</dt><dd className={selected.ev < 0 ? 'negative' : undefined}>{signedYen(selected.ev)}</dd></div>}
        </dl>
      </section>
      <div className="trend-date-control">
        <label htmlFor={dateControlId}>表示する日付</label>
        <div>
          <button type="button" className="icon-button" aria-label="前の記録日" disabled={!previous} onClick={() => selectDay(previous.day)}><Icon name="back" size={17} /></button>
          <select id={dateControlId} value={selected.day} onChange={event => selectDay(Number(event.target.value))}>{dateOptions.map(day => <option key={day.day} value={day.day}>{monthNumber}月{day.day}日{day.count ? '' : '（記録なし）'}</option>)}</select>
          <button type="button" className="icon-button" aria-label="次の記録日" disabled={!next} onClick={() => selectDay(next.day)}><Icon name="next" size={17} /></button>
        </div>
      </div>
      <details className="trend-daily">
        <summary>日ごとの内訳<span>{recordedDays.length}日 / {count}件</span></summary>
        <table><caption className="sr-only">{year}年{monthNumber}月の日ごとの収支と期待値</caption><thead><tr><th scope="col">日付</th><th scope="col">収支</th><th scope="col">期待値</th></tr></thead>
          <tbody>{[...recordedDays].reverse().map(day => <tr key={day.day} className={selected.day === day.day ? 'is-selected' : ''}>
            <th scope="row"><button type="button" aria-pressed={selected.day === day.day} onClick={() => selectDay(day.day)}>{day.day}日</button></th>
            <td className={day.profitDaily < 0 ? 'negative' : undefined}>{signedYen(day.profitDaily)}</td><td className={day.evDaily < 0 ? 'negative' : undefined}>{signedYen(day.evDaily)}</td>
          </tr>)}</tbody>
        </table>
      </details>
    </>}
  </div>;
}
