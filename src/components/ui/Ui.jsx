import { useId } from 'react';

const paths = {
  record: 'M8 3h8l3 3v15H5V3h3m1 5h6m-6 4h6m-6 4h4',
  history: 'M12 8v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  balance: 'M4 20V10m6 10V4m6 16v-7m5 7H2',
  machine: 'M6 3h12v18H6V3m0 13h12M9 7h6v5H9V7m1 12h4',
  plus: 'M12 5v14M5 12h14',
  edit: 'm16 3 5 5M4 16 16 4a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  check: 'm5 12 4 4L19 6',
  back: 'm14 6-6 6 6 6',
  next: 'm10 6 6 6-6 6',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  calendar: 'M5 5h14v16H5V5m3-3v6m8-6v6M5 10h14',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  close: 'm6 6 12 12M6 18 18 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  flag: 'M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0',
  target: 'M12 8v8m-4-4h8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  info: 'M12 11v6m0-10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
};

export function Icon({ name, size = 20, className = '' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}><path d={paths[name] || paths.record} /></svg>;
}

export function PageHeader({ eyebrow, title, description, actions, back }) {
  return <header className="page-header">
    {eyebrow && <p className="eyebrow">{eyebrow}</p>}
    <div className="page-title-row">
      {back && <button type="button" className="icon-button" onClick={back} aria-label="戻る"><Icon name="back" /></button>}
      <h1>{title}</h1>
      {actions && <div className="header-actions">{actions}</div>}
    </div>
    {description && <p className="page-description">{description}</p>}
  </header>;
}

export function NumberField({ label, value, onChange, suffix, hint, large = false, required = true, placeholder = '0' }) {
  const id = useId();
  return <label className={`number-field ${large ? 'number-field-large' : ''}`} htmlFor={id}>
    <span className="field-label">{label}<Icon name="edit" size={16} /></span>
    <span className="number-input-wrap">
      <input id={id} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={9} required={required} value={value ?? ''} placeholder={placeholder}
        onChange={(e) => {
          const next = e.target.value.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[,\s]/g, '');
          if (/^\d*$/.test(next)) onChange(next);
        }} />
      {suffix && <span className="input-suffix">{suffix}</span>}
    </span>
    {hint && <span className="field-hint">{hint}</span>}
  </label>;
}

export function Notice({ children, error = false }) {
  if (!children) return null;
  return <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : 'status'}><Icon name={error ? 'info' : 'check'} size={18} /><span>{children}</span></div>;
}

export function EmptyState({ title, description, action }) {
  return <div className="empty-state"><div className="empty-icon"><Icon name="record" size={28} /></div><h2>{title}</h2>{description && <p>{description}</p>}{action}</div>;
}
