import { useState } from 'react';
import { recalcSession, finalSegmentInvestment } from '../utils/sessionUtils';
import { Icon, NumberField, Notice } from './ui/Ui';

const number = value => Number(value) || 0;
const count = value => number(value).toLocaleString();
const time = value => value ? new Date(value).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
const fields = {
  rotations: { key: 'rotations', label: '台の表示回転数', suffix: '回' },
  balls: { key: 'balls', label: '持ち玉', suffix: '玉' },
  investment: { key: 'investment', label: 'この区間の現金投資', suffix: '円' },
};

// 各カード内だけで文字列の下書きを持ち、保存時に一度だけ再計算する。
// 入力を消した直後の「0」への丸めや、途中入力による他の値の変更を避ける。
export default function SessionDetail({ session, onChange, includeEndRow = false, onDirtyChange }) {
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  if (!session) return null;

  const rows = [{
    key: 'start', title: '開始', time: time(session.startedAt), icon: 'record',
    values: { rotations: number(session.startRotations), balls: number(session.startBalls) },
    fields: [fields.rotations, fields.balls],
  }];
  for (const [i, hit] of (session.hits || []).entries()) {
    rows.push({
      key: `hit-${i}`, title: `当たり ${i + 1}回目`, time: time(hit.timestamp), icon: 'target', index: i, kind: 'hit',
      values: { rotations: number(hit.atMachineRot), balls: number(hit.ballsBefore ?? (i === 0 ? session.startBalls : session.hits[i - 1].ballsAfter)), investment: number(hit.addedInvestment) },
      fields: [fields.rotations, fields.balls, fields.investment],
    }, {
      key: `after-${i}`, title: `${i + 1}回目の当たり後`, icon: 'check', index: i, kind: 'after',
      values: { rotations: number(hit.resumeMachineRot), balls: number(hit.ballsAfter) },
      fields: [fields.rotations, fields.balls],
    });
  }
  if (includeEndRow) rows.push({
    key: 'end', title: session.isSession || session.endRotations != null ? '終了' : '現在', time: time(session.endedAt || session.lastRecordedAt), icon: 'flag',
    values: { rotations: number(session.endRotations ?? session.currentRotations), balls: number(session.endBalls ?? session.currentBalls), investment: finalSegmentInvestment(session) },
    fields: [fields.rotations, fields.balls, fields.investment],
  });

  const description = values => `${count(values.rotations)}回 / ${count(values.balls)}玉${values.investment != null ? ` / 投資 ¥${count(values.investment)}` : ''}`;
  const isDirty = edit => edit && Object.keys(edit.values).some(key => String(edit.values[key]) !== String(edit.original[key]));
  const startEdit = row => {
    if (isDirty(editing) && !confirm('入力中の変更を破棄して、別の記録を編集しますか？')) return;
    setEditing({ key: row.key, original: row.values, values: Object.fromEntries(Object.entries(row.values).map(([key, value]) => [key, String(value)])) });
    setNotice(''); setError(''); onDirtyChange?.(false);
  };
  const cancel = () => { setEditing(null); setError(''); onDirtyChange?.(false); };
  const save = (e, row) => {
    e.preventDefault();
    const values = Object.fromEntries(Object.entries(editing.values).map(([key, value]) => [key, Number(value)]));
    let patch = {};
    if (row.key === 'start') {
      const nextRot = session.hits?.[0]?.atMachineRot ?? session.endRotations ?? session.currentRotations;
      if (nextRot != null && values.rotations > nextRot) { setError('開始回転数は、次の記録の回転数以下で入力してください。'); return; }
      patch = { startRotations: values.rotations, startBalls: values.balls };
    } else if (row.kind === 'hit') {
      const prev = row.index === 0 ? session.startRotations : session.hits[row.index - 1].resumeMachineRot;
      if (values.rotations < number(prev)) { setError(`台の表示回転数は、この区間の開始値（${count(prev)}回）以上で入力してください。`); return; }
      patch = {
        hits: session.hits.map((hit, i) => i === row.index ? { ...hit, atMachineRot: values.rotations, ballsBefore: values.balls, addedInvestment: values.investment } : hit),
        totalInvestment: number(session.totalInvestment) + values.investment - number(session.hits[row.index].addedInvestment),
      };
    } else if (row.kind === 'after') {
      const nextRot = session.hits[row.index + 1]?.atMachineRot ?? session.endRotations ?? session.currentRotations;
      if (nextRot != null && values.rotations > nextRot) { setError('再開回転数は、次の記録の回転数以下で入力してください。'); return; }
      patch = { hits: session.hits.map((hit, i) => i === row.index ? { ...hit, resumeMachineRot: values.rotations, ballsAfter: values.balls } : hit) };
    } else {
      const prev = session.hits?.length ? session.hits[session.hits.length - 1].resumeMachineRot : session.startRotations;
      if (values.rotations < number(prev)) { setError(`台の表示回転数は、この区間の開始値（${count(prev)}回）以上で入力してください。`); return; }
      const hitInvestment = (session.hits || []).reduce((sum, hit) => sum + number(hit.addedInvestment), 0);
      patch = {
        ...(session.endRotations != null ? { endRotations: values.rotations } : { currentRotations: values.rotations }),
        ...(session.endBalls != null ? { endBalls: values.balls } : { currentBalls: values.balls }),
        totalInvestment: hitInvestment + values.investment,
      };
    }
    onChange(recalcSession({ ...session, ...patch }));
    setEditing(null); setError(''); setNotice(`「${row.title}」の変更を保存しました。`); onDirtyChange?.(false);
  };
  const deleteHit = row => {
    if (!confirm(`当たり ${row.index + 1}回目と、その当たり後の記録を削除しますか？現金投資の合計は保持されます。`)) return;
    onChange(recalcSession({ ...session, hits: session.hits.filter((_, i) => i !== row.index) }));
    setEditing(null); setError(''); setNotice('当たりの記録を削除しました。'); onDirtyChange?.(false);
  };

  return <div className="timeline">
    <Notice>{notice}</Notice>
    {rows.map(row => {
      const open = editing?.key === row.key;
      return <article key={row.key} className={`event-card ${open ? 'is-editing' : ''}`}>
        <div className="event-header">
          <span className="event-icon"><Icon name={row.icon} size={18} /></span>
          <div className="event-title"><h3>{row.title}{row.time && <span className="muted" style={{ marginLeft: 9, fontSize: 12, fontWeight: 400 }}>{row.time}</span>}</h3>{!open && <p>{description(row.values)}</p>}</div>
          {open ? <span className="editing-badge">編集中</span> : <button type="button" className="icon-button" aria-label={`${row.title}を編集`} onClick={() => startEdit(row)}><Icon name="edit" size={19} /></button>}
        </div>
        {open && <form className="event-form" onSubmit={e => save(e, row)}>
          <div className="event-form-fields">{row.fields.map(field => <NumberField key={field.key} label={field.label} suffix={field.suffix} value={editing.values[field.key]} onChange={value => {
            const next = { ...editing, values: { ...editing.values, [field.key]: value } };
            setEditing(next); setError(''); onDirtyChange?.(Boolean(isDirty(next)));
          }} />)}</div>
          <p className="event-before">修正前 {description(editing.original)}</p>
          <Notice error>{error}</Notice>
          <button type="submit" className="primary-button full-width" disabled={!isDirty(editing)}><Icon name="check" size={17} />この変更を保存</button>
          <button type="button" className="quiet-button" onClick={cancel}>キャンセル</button>
          {row.kind === 'after' && <details className="disclosure" style={{ margin: '0 0 10px' }}><summary>この当たりの削除</summary><button type="button" className="danger-button full-width" onClick={() => deleteHit(row)}>当たり前後の記録を削除</button></details>}
        </form>}
      </article>;
    })}
    <p className="timeline-hint"><Icon name="info" size={17} />鉛筆マークから、直したい記録だけ編集できます。</p>
  </div>;
}
