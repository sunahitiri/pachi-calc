import { Icon } from './ui/Ui';

const TAB_META = {
  record: { label: '記録', icon: 'record' },
  list: { label: '履歴', icon: 'history' },
  balance: { label: '収支', icon: 'balance' },
  machines: { label: '機種', icon: 'machine' },
};

export default function BottomNav({ tab, setTab, tabs }) {
  return <nav className="bottom-nav" aria-label="メインメニュー">
    {tabs.map(id => <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} aria-controls={`panel-${id}`} className={tab === id ? 'is-active' : ''}>
      <span className="nav-icon"><Icon name={TAB_META[id].icon} size={22} /></span>
      <span>{TAB_META[id].label}</span>
    </button>)}
  </nav>;
}
