import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { calcBorder } from '../utils/calculations';
import { Icon } from './ui/Ui';

export default function MachineSelector({ machines, value, onChange, exchangeRate, placeholder = '選択してください' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const dialogRef = useRef(null);
  const titleId = useId();
  const selected = machines.find(machine => machine.id === value);
  const filtered = machines.filter(machine => machine.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const close = () => { setIsOpen(false); setQuery(''); triggerRef.current?.focus(); };

  useEffect(() => {
    if (!isOpen) return;
    const timeout = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(timeout);
  }, [isOpen]);

  const handleKeyDown = e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    if (e.key !== 'Tab') return;
    const items = dialogRef.current?.querySelectorAll('button:not(:disabled), input, [tabindex="0"]');
    if (!items?.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return <>
    <button type="button" ref={triggerRef} className="machine-picker-trigger" aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => setIsOpen(true)}><span>{selected?.name || placeholder}</span><Icon name="next" size={17} /></button>
    {isOpen && createPortal(<>
      <div className="machine-picker-backdrop" onClick={close} aria-hidden="true" />
      <div className="machine-picker" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef} onKeyDown={handleKeyDown}>
        <div className="sheet-handle" />
        <div className="machine-picker-header"><h2 id={titleId}>遊技する機種を選択</h2><button className="icon-button" type="button" onClick={close} aria-label="閉じる"><Icon name="close" /></button></div>
        <label className="search-field"><Icon name="search" size={18} /><input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="機種名で検索" aria-label="機種名で検索" /></label>
        <ul className="machine-picker-list">{filtered.map(machine => <li key={machine.id}><button type="button" aria-pressed={machine.id === value} onClick={() => { onChange(machine.id); close(); }}><span>{machine.name}<small>ボーダー {calcBorder({ ...machine, exchangeRate }).toFixed(1)} 回/1K</small></span>{machine.id === value && <Icon name="check" size={18} />}</button></li>)}
          {filtered.length === 0 && <li className="small muted" style={{ textAlign: 'center', padding: 24 }}>該当する機種がありません</li>}
        </ul>
      </div>
    </>, document.body)}
  </>;
}
