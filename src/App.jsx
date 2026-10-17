import { useState } from 'react';
import BottomNav from './components/BottomNav';
import SessionRecorder from './components/SessionRecorder';
import RecordList from './components/RecordList';
import BalanceSheet from './components/BalanceSheet';
import ProfitChart from './components/ProfitChart';
import MachineManager from './components/MachineManager';
import { PageHeader } from './components/ui/Ui';
import { useLocalStorage } from './hooks/useLocalStorage';
import defaultMachines from './data/machines.json';

const TABS = ['record', 'list', 'balance', 'machines'];

function App() {
  const [tab, setTab] = useState('record');
  const [insight, setInsight] = useState('balance');
  const [records, setRecords] = useLocalStorage('pachi-records', []);
  const [machines, setMachines] = useLocalStorage('pachi-machines', defaultMachines);
  const handleAdd = record => setRecords(prev => [record, ...prev]);
  const handleDelete = id => setRecords(prev => prev.filter(r => r.id !== id));
  const handleUpdate = updated => setRecords(prev => prev.map(r => r.id === updated.id ? updated : r));

  // パネルを維持し、タブを移動しても入力途中の値を残す。
  return <div className="app-shell">
    <main className="app-main">
      <section id="panel-record" aria-label="記録" className="tab-panel" hidden={tab !== 'record'}>
        <SessionRecorder machines={machines} onComplete={handleAdd} onManageMachines={() => setTab('machines')} />
      </section>
      <section id="panel-list" aria-label="履歴" className="tab-panel" hidden={tab !== 'list'}>
        <RecordList records={records} machines={machines} onDelete={handleDelete} onUpdate={handleUpdate} onNewRecord={() => setTab('record')} />
      </section>
      <section id="panel-balance" aria-label="収支" className="tab-panel" hidden={tab !== 'balance'}>
        <div className="page insights-header"><PageHeader eyebrow="INSIGHTS" title="収支を振り返る" description="記録から、日々の変化を見つける。" />
          <div className="segmented-control" aria-label="収支の表示方法">
            <button type="button" aria-pressed={insight === 'balance'} onClick={() => setInsight('balance')}>収支表</button>
            <button type="button" aria-pressed={insight === 'chart'} onClick={() => setInsight('chart')}>チャート</button>
          </div>
        </div>
        <div hidden={insight !== 'balance'}><BalanceSheet records={records} machines={machines} /></div>
        <div hidden={insight !== 'chart'}><ProfitChart records={records} machines={machines} /></div>
      </section>
      <section id="panel-machines" aria-label="機種" className="tab-panel legacy-panel" hidden={tab !== 'machines'}>
        <MachineManager machines={machines} setMachines={setMachines} />
      </section>
    </main>
    <BottomNav tab={tab} setTab={setTab} tabs={TABS} />
  </div>;
}

export default App;
